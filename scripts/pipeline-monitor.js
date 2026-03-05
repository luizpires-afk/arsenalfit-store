import fs from "fs";
import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  writeJson,
} from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "reports/pipeline-health.json");
const logFile = getArg("--log-file", "logs/ml-30m-sync-cycle.log");

const parseCycleLog = (content) => {
  const lines = content.split(/\r?\n/).filter(Boolean);
  const stepOk = [];
  const stepFailed = [];
  let lastHealth = null;

  for (const line of lines) {
    const okMatch = line.match(/step_ok=([a-z0-9_\-]+)/i);
    if (okMatch) stepOk.push(okMatch[1]);

    const failMatch = line.match(/step_failed=([a-z0-9_\-]+)/i);
    if (failMatch) stepFailed.push(failMatch[1]);

    const healthMatch = line.match(/health_check=(\{.*\})\s+pipeline_duration=/);
    if (healthMatch) {
      try {
        lastHealth = JSON.parse(healthMatch[1]);
      } catch {
        lastHealth = null;
      }
    }
  }

  return {
    total_lines: lines.length,
    steps_ok: stepOk,
    steps_failed: stepFailed,
    last_health_check: lastHealth,
  };
};

const headCount = async (url, headers, path) => {
  const resp = await fetch(`${url}${path}`, {
    method: "HEAD",
    headers: { ...headers, Prefer: "count=exact" },
  });
  if (!resp.ok) return 0;
  const cr = resp.headers.get("content-range") || "*/0";
  return Number(String(cr).split("/")[1] || 0) || 0;
};

const main = async () => {
  const { env } = parseEnvAndClient(envFile);
  const url = env.SUPABASE_URL;
  const key = env.SERVICE_ROLE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const logExists = fs.existsSync(logFile);
  const logContent = logExists ? String(fs.readFileSync(logFile, "utf8")) : "";
  const parsed = parseCycleLog(logContent);

  const [products, conversionRows, pricingRows] = await Promise.all([
    headCount(url, headers, "/rest/v1/products?select=id"),
    headCount(url, headers, "/rest/v1/product_conversion_metrics?select=id"),
    headCount(url, headers, "/rest/v1/product_price_intelligence?select=id"),
  ]);

  const status = {
    pipeline_log_present: logExists,
    last_cycle_has_failures: parsed.steps_failed.length > 0,
    trend_predictor_active: parsed.last_health_check?.trend_predictor_status === "active",
    database_connected: products >= 0,
  };

  const report = {
    generated_at: new Date().toISOString(),
    ok: status.pipeline_log_present && !status.last_cycle_has_failures && status.database_connected,
    status,
    cycle: parsed,
    db_metrics: {
      products_total: products,
      conversion_rows_total: conversionRows,
      pricing_rows_total: pricingRows,
    },
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
