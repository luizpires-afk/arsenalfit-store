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
  const cycles = [];
  let current = null;

  for (const line of lines) {
    const startMatch = line.match(/^\[([^\]]+)\]\s+\[ml_30m_sync_cycle\]\s+START/i);
    if (startMatch) {
      if (current) cycles.push(current);
      current = {
        started_at: startMatch[1],
        ended_at: null,
        duration_seconds: null,
        steps_ok: [],
        steps_failed: [],
        failed_steps_count: 0,
        completed_state: "unknown",
        last_health_check: null,
      };
      continue;
    }

    if (!current) continue;

    const okMatch = line.match(/step_ok=([a-z0-9_\-]+)/i);
    if (okMatch) current.steps_ok.push(okMatch[1]);

    const failMatch = line.match(/step_failed=([a-z0-9_\-]+)/i);
    if (failMatch) current.steps_failed.push(failMatch[1]);

    const healthMatch = line.match(/health_check=(\{.*\})\s+pipeline_duration=(\d+)s/i);
    if (healthMatch) {
      try {
        current.last_health_check = JSON.parse(healthMatch[1]);
      } catch {
        current.last_health_check = null;
      }
      current.duration_seconds = Number(healthMatch[2] || 0) || 0;
    }

    const completedErr = line.match(/completed_with_errors\s+failed_steps=(\d+)/i);
    if (completedErr) {
      current.completed_state = "completed_with_errors";
      current.failed_steps_count = Number(completedErr[1] || 0) || current.steps_failed.length;
      current.ended_at = line.match(/^\[([^\]]+)\]/)?.[1] || null;
      cycles.push(current);
      current = null;
      continue;
    }

    if (/completed_ok/i.test(line)) {
      current.completed_state = "completed_ok";
      current.failed_steps_count = 0;
      current.ended_at = line.match(/^\[([^\]]+)\]/)?.[1] || null;
      cycles.push(current);
      current = null;
    }
  }

  if (current) cycles.push(current);

  const lastCycle = cycles.length ? cycles[cycles.length - 1] : null;

  return {
    total_lines: lines.length,
    total_cycles: cycles.length,
    last_cycle: lastCycle,
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
    last_cycle_has_failures: (parsed.last_cycle?.failed_steps_count || 0) > 0,
    trend_predictor_active: parsed.last_cycle?.last_health_check?.trend_predictor_status === "active",
    database_connected: products >= 0,
  };

  let pipelineStatus = "FAILED";
  if (!status.pipeline_log_present || !parsed.last_cycle) {
    pipelineStatus = "FAILED";
  } else if (status.last_cycle_has_failures) {
    pipelineStatus = "WARNING";
  } else if (!status.trend_predictor_active) {
    pipelineStatus = "WARNING";
  } else {
    pipelineStatus = "OK";
  }

  const report = {
    generated_at: new Date().toISOString(),
    ok: pipelineStatus === "OK" && status.database_connected,
    pipeline_status: pipelineStatus,
    status,
    cycle: parsed,
    last_pipeline_run: {
      started_at: parsed.last_cycle?.started_at || null,
      ended_at: parsed.last_cycle?.ended_at || null,
      duration_seconds: parsed.last_cycle?.duration_seconds || 0,
    },
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
