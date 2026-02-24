const { readRunnerEnv, createSupabaseRestClient } = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);
const hasArg = (name) => args.includes(name);
const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};

const envPath = getArg("--env", "supabase/functions/.env.scheduler");
const limit = Math.max(1, Number(getArg("--limit", "40")) || 40);
const staleHours = Math.max(1, Number(getArg("--stale-hours", "6")) || 6);
const force = hasArg("--force");
const dryRun = hasArg("--dry-run");
const reason = getArg("--reason", "catalog_audit_gap_revalidate");

const isCatalogSource = (source) => {
  const normalized = String(source || "").trim().toLowerCase();
  return normalized === "catalog" || normalized === "catalog_ingest";
};

const isStaleOrMissingAudit = (row, thresholdMs) => {
  const auditMs = row?.last_price_audit_at ? new Date(row.last_price_audit_at).getTime() : NaN;
  if (!Number.isFinite(auditMs)) return true;
  return Date.now() - auditMs > thresholdMs;
};

const main = async () => {
  const env = readRunnerEnv(envPath);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const thresholdMs = staleHours * 60 * 60 * 1000;

  const rows = await client.fetchPagedRows(
    "/products?select=id,name,marketplace,status,is_active,last_price_source,last_price_verified_at,last_price_audit_at,ml_item_id,data_health_status,auto_disabled_reason,removed_at&marketplace=eq.mercadolivre&removed_at=is.null&is_active=eq.true&status=eq.active&order=updated_at.desc&limit=2000",
    500,
  );

  const selected = rows
    .filter((row) => String(row?.auto_disabled_reason || "").trim().toLowerCase() !== "blocked")
    .filter((row) => isCatalogSource(row?.last_price_source))
    .filter((row) => isStaleOrMissingAudit(row, thresholdMs))
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      name: row.name,
      ml_item_id: row.ml_item_id,
      last_price_source: row.last_price_source,
      last_price_verified_at: row.last_price_verified_at,
      last_price_audit_at: row.last_price_audit_at,
      data_health_status: row.data_health_status,
    }));

  const result = {
    ok: true,
    config: {
      limit,
      stale_hours: staleHours,
      force,
      dry_run: dryRun,
      reason,
    },
    totals: {
      candidates_total: selected.length,
      queued_total: 0,
      error_total: 0,
    },
    selected,
    queued: [],
    errors: [],
  };

  if (dryRun || selected.length === 0) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  for (const row of selected) {
    try {
      await client.rpc("enqueue_price_check_refresh", {
        p_product_id: row.id,
        p_force: force,
        p_reason: reason,
      });
      result.totals.queued_total += 1;
      result.queued.push(row);
    } catch (error) {
      result.totals.error_total += 1;
      result.errors.push({
        ...row,
        error: error?.message || String(error),
      });
    }
  }

  console.log(JSON.stringify(result, null, 2));

  if (result.totals.error_total > 0) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
