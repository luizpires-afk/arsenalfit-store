const fs = require("fs");
const path = require("path");
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
const outDir = getArg("--out-dir", "logs");
const limit = Math.max(1, Math.min(5000, Number(getArg("--limit", "800")) || 800));
const windowHours = Math.max(1, Math.min(240, Number(getArg("--window-hours", "72")) || 72));
const source = getArg("--source", "standby_reactivation_report");

const ts = new Date().toISOString().replace(/[:.]/g, "-");

const countByReason = (rows) => {
  const map = {};
  for (const row of rows) {
    const reason = String(row.auto_disabled_reason || row.deactivation_reason || "sem_motivo");
    map[reason] = (map[reason] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
};

const isEligible = (row, nowMs, windowHoursValue) => {
  const disabled = String(row.auto_disabled_reason || "") === "supervisao_automatica_incoerencia";
  if (!disabled) return false;
  const status = String(row.status || "").toLowerCase();
  const statusOk = ["standby", "pending", "pending_validacao", "pending_validation"].includes(status) || !Boolean(row.is_active);
  if (!statusOk) return false;
  const verified = row.last_price_verified_at ? Date.parse(String(row.last_price_verified_at)) : NaN;
  if (!Number.isFinite(verified)) return false;
  if (verified < nowMs - windowHoursValue * 60 * 60 * 1000) return false;
  const src = String(row.last_price_source || "").toLowerCase();
  return ["api_base", "api_pix", "auth", "public", "catalog", "catalog_ingest"].includes(src);
};

const writeArtifacts = ({ payload, rows, outDirPath }) => {
  const base = path.join(outDirPath, "standby-reactivation-report");
  const stamped = `${base}-${ts}`;
  const json = `${base}.json`;
  const csv = `${base}.csv`;
  const jsonTs = `${stamped}.json`;
  const csvTs = `${stamped}.csv`;
  fs.writeFileSync(json, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(csv, `${toCsv(rows)}\n`, "utf8");
  fs.writeFileSync(jsonTs, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(csvTs, `${toCsv(rows)}\n`, "utf8");
  return { json, csv, timestamped: { json: jsonTs, csv: csvTs } };
};

const runAdminSqlFallback = async ({ projectRef, accessToken, limitValue, windowHoursValue, sourceValue }) => {
  const safeSource = String(sourceValue || "standby_reactivation_report").replace(/'/g, "''");
  const query = `select set_config('request.jwt.claim.role','service_role', true); select public.reactivate_auto_disabled_coherence_products(${Math.trunc(limitValue)}, ${Math.trunc(windowHoursValue)}, '${safeSource}') as result;`;
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!response.ok) {
    throw new Error(`fallback_sql_error: ${response.status} ${response.statusText} ${typeof parsed === "string" ? parsed : JSON.stringify(parsed || {})}`);
  }
  return parsed;
};

const main = async () => {
  const env = readRunnerEnv(envFile);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }
  fs.mkdirSync(outDir, { recursive: true });

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const fields = [
    "id",
    "name",
    "status",
    "is_active",
    "auto_disabled_reason",
    "deactivation_reason",
    "last_price_source",
    "last_price_verified_at",
    "updated_at",
  ].join(",");

  const beforeRows = await client.fetchPagedRows(
    `/products?select=${encodeURIComponent(fields)}&marketplace=eq.mercadolivre&removed_at=is.null&order=updated_at.desc`,
  );
  const beforeStandby = beforeRows.filter((row) => String(row.status || "").toLowerCase() === "standby" || !Boolean(row.is_active));
  const nowMs = Date.now();
  const eligibleBefore = beforeStandby.filter((row) => isEligible(row, nowMs, windowHours));

  let execution = { mode: "rpc", payload: null };
  try {
    execution.payload = await client.rpc("reactivate_auto_disabled_coherence_products", {
      p_limit: limit,
      p_window_hours: windowHours,
      p_source: source,
    });
  } catch (error) {
    const message = String(error?.message || error);
    if (!/admin_required/i.test(message)) {
      throw error;
    }
    const projectRef = (fs.existsSync("supabase/.temp/project-ref")
      ? String(fs.readFileSync("supabase/.temp/project-ref", "utf8")).trim()
      : "") || process.env.SUPABASE_PROJECT_REF || "";
    const accessToken = process.env.SUPABASE_ACCESS_TOKEN || "";
    if (!projectRef || !accessToken) {
      execution = { mode: "blocked_admin_required", payload: { error: message } };
    } else {
      const payload = await runAdminSqlFallback({
        projectRef,
        accessToken,
        limitValue: limit,
        windowHoursValue: windowHours,
        sourceValue: source,
      });
      execution = { mode: "admin_sql_api", payload };
    }
  }

  const afterRows = await client.fetchPagedRows(
    `/products?select=${encodeURIComponent(fields)}&marketplace=eq.mercadolivre&removed_at=is.null&order=updated_at.desc`,
  );
  const afterStandby = afterRows.filter((row) => String(row.status || "").toLowerCase() === "standby" || !Boolean(row.is_active));

  const beforeMap = new Map(beforeRows.map((row) => [row.id, row]));
  const afterMap = new Map(afterRows.map((row) => [row.id, row]));
  const reactivated = [];
  for (const [id, before] of beforeMap.entries()) {
    const after = afterMap.get(id);
    if (!after) continue;
    const beforeStandbyLike = String(before.status || "").toLowerCase() === "standby" || !Boolean(before.is_active);
    const afterActiveLike = String(after.status || "").toLowerCase() === "active" && Boolean(after.is_active);
    if (beforeStandbyLike && afterActiveLike) {
      reactivated.push({ id, name: after.name, from_status: before.status, to_status: after.status });
    }
  }

  const reasonRows = [];
  const beforeReason = countByReason(beforeStandby);
  const afterReason = countByReason(afterStandby);
  const allReasons = [...new Set([...Object.keys(beforeReason), ...Object.keys(afterReason)])].sort();
  for (const reason of allReasons) {
    reasonRows.push({
      metric: `standby_reason:${reason}`,
      before: Number(beforeReason[reason] || 0),
      after: Number(afterReason[reason] || 0),
      delta: Number(afterReason[reason] || 0) - Number(beforeReason[reason] || 0),
    });
  }
  reasonRows.push({
    metric: "standby_total",
    before: beforeStandby.length,
    after: afterStandby.length,
    delta: afterStandby.length - beforeStandby.length,
  });
  reasonRows.push({
    metric: "reactivated_total",
    before: 0,
    after: reactivated.length,
    delta: reactivated.length,
  });

  const payload = {
    ok: true,
    generated_at: new Date().toISOString(),
    execution,
    totals: {
      standby_before: beforeStandby.length,
      standby_after: afterStandby.length,
      eligible_before: eligibleBefore.length,
      reactivated_total: reactivated.length,
      kept_standby_total: afterStandby.length,
    },
    causes: {
      before_by_reason: beforeReason,
      after_by_reason: afterReason,
    },
    reactivated_samples: reactivated.slice(0, 100),
    rows: reasonRows,
  };

  const outputs = writeArtifacts({ payload, rows: reasonRows, outDirPath: outDir });
  console.log(JSON.stringify({ ok: true, totals: payload.totals, outputs }, null, 2));
};

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
