const fs = require("fs");
const {
  readRunnerEnv,
  createSupabaseRestClient,
  toCsv,
} = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const outPrefix = getArg("--out-prefix", "logs/affiliate-unvalidated-list");
const asJson = args.includes("--json");

const sortRows = (rows) =>
  rows.sort((left, right) => {
    const byReason = String(left.reason_code || "").localeCompare(String(right.reason_code || ""));
    if (byReason !== 0) return byReason;
    const byStatus = String(left.status || "").localeCompare(String(right.status || ""));
    if (byStatus !== 0) return byStatus;
    return String(left.updated_at || "").localeCompare(String(right.updated_at || ""));
  });

const countBy = (rows, keySelector) => {
  const counts = {};
  for (const row of rows) {
    const key = keySelector(row);
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
};

const main = async () => {
  const env = readRunnerEnv(envFile);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }

  const { getUnvalidatedReasonCode } = await import("../src/lib/affiliateValidationRules.js");

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const fields = [
    "id",
    "name",
    "marketplace",
    "status",
    "is_active",
    "affiliate_verified",
    "affiliate_link",
    "source_url",
    "ml_item_id",
    "affiliate_validation_status",
    "affiliate_validation_error",
    "deactivation_reason",
    "auto_disabled_reason",
    "updated_at",
    "removed_at",
  ].join(",");

  const allMercado = await client.fetchPagedRows(
    `/products?select=${encodeURIComponent(fields)}&marketplace=eq.mercadolivre&removed_at=is.null&order=updated_at.desc`,
  );

  const rows = sortRows(
    allMercado
      .map((product) => {
        const reasonCode = getUnvalidatedReasonCode(product);
        if (!reasonCode) return null;
        return {
          id: product.id,
          name: product.name,
          status: product.status,
          is_active: Boolean(product.is_active),
          affiliate_verified: Boolean(product.affiliate_verified),
          reason_code: reasonCode,
          deactivation_reason: product.deactivation_reason || null,
          auto_disabled_reason: product.auto_disabled_reason || null,
          affiliate_validation_status: product.affiliate_validation_status || null,
          affiliate_validation_error: product.affiliate_validation_error || null,
          source_url: product.source_url || null,
          affiliate_link: product.affiliate_link || null,
          ml_item_id: product.ml_item_id || null,
          updated_at: product.updated_at || null,
        };
      })
      .filter(Boolean),
  );

  const payload = {
    ok: true,
    generated_at: new Date().toISOString(),
    totals: {
      products_scanned: allMercado.length,
      unvalidated_total: rows.length,
    },
    grouped: {
      by_reason: countBy(rows, (row) => String(row.reason_code || "sem_motivo")),
      by_status: countBy(rows, (row) => String(row.status || "sem_status")),
    },
    rows,
  };

  const jsonPath = `${outPrefix}.json`;
  const csvPath = `${outPrefix}.csv`;
  fs.mkdirSync(require("path").dirname(outPrefix), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(csvPath, `${toCsv(rows)}\n`, "utf8");

  if (asJson) {
    console.log(JSON.stringify({ ...payload, outputs: { json: jsonPath, csv: csvPath } }, null, 2));
    return;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        totals: payload.totals,
        grouped: payload.grouped,
        outputs: { json: jsonPath, csv: csvPath },
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
