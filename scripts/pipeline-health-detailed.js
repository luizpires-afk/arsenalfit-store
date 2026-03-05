import fs from "fs";
import {
  getArg,
  writeJson,
} from "./_affiliate_catalog_common.js";

const logFile = getArg("--log-file", "logs/ml-30m-sync-cycle.log");
const outFile = getArg("--out-file", "reports/pipeline-health-detailed.json");

const parseCycles = (content) => {
  const lines = content.split(/\r?\n/).filter(Boolean);
  let current = null;
  const cycles = [];

  for (const line of lines) {
    const start = line.match(/^\[([^\]]+)\]\s+\[ml_30m_sync_cycle\]\s+START/i);
    if (start) {
      if (current) cycles.push(current);
      current = {
        started_at: start[1],
        ended_at: null,
        duration_seconds: 0,
        steps_ok: [],
        steps_failed: [],
        steps_retried: [],
        pipeline_status: "FAILED",
      };
      continue;
    }

    if (!current) continue;

    const ok = line.match(/step_ok=([a-z0-9_\-]+)/i);
    if (ok) current.steps_ok.push(ok[1]);

    const fail = line.match(/step_failed=([a-z0-9_\-]+)/i);
    if (fail) current.steps_failed.push(fail[1]);

    const retry = line.match(/step_retry=([a-z0-9_\-]+)/i);
    if (retry) current.steps_retried.push(retry[1]);

    const health = line.match(/pipeline_duration=(\d+)s/i);
    if (health) current.duration_seconds = Number(health[1] || 0) || 0;

    if (/completed_with_errors/i.test(line)) {
      current.pipeline_status = "WARNING";
      current.ended_at = line.match(/^\[([^\]]+)\]/)?.[1] || null;
      cycles.push(current);
      current = null;
      continue;
    }

    if (/completed_ok/i.test(line)) {
      current.pipeline_status = "OK";
      current.ended_at = line.match(/^\[([^\]]+)\]/)?.[1] || null;
      cycles.push(current);
      current = null;
    }
  }

  if (current) cycles.push(current);
  return cycles;
};

const main = async () => {
  const exists = fs.existsSync(logFile);
  const content = exists ? String(fs.readFileSync(logFile, "utf8")) : "";
  const cycles = parseCycles(content);
  const last = cycles.length ? cycles[cycles.length - 1] : null;
  const lastSuccess = [...cycles].reverse().find((cycle) => cycle.pipeline_status === "OK") || null;
  const lastFailed = [...cycles].reverse().find((cycle) => cycle.pipeline_status !== "OK") || null;
  const averageCycleDuration = cycles.length
    ? Number((cycles.reduce((acc, cycle) => acc + (Number(cycle.duration_seconds || 0) || 0), 0) / cycles.length).toFixed(2))
    : 0;

  const report = {
    generated_at: new Date().toISOString(),
    pipeline_status: last?.pipeline_status || "FAILED",
    last_pipeline_run_time: last?.ended_at || last?.started_at || null,
    duration_seconds: last?.duration_seconds || 0,
    steps_failed: last?.steps_failed || [],
    steps_retried: last?.steps_retried || [],
    last_successful_cycle: lastSuccess
      ? {
          started_at: lastSuccess.started_at,
          ended_at: lastSuccess.ended_at,
          duration_seconds: lastSuccess.duration_seconds || 0,
        }
      : null,
    last_failed_cycle: lastFailed
      ? {
          started_at: lastFailed.started_at,
          ended_at: lastFailed.ended_at,
          duration_seconds: lastFailed.duration_seconds || 0,
          steps_failed: lastFailed.steps_failed,
        }
      : null,
    average_cycle_duration: averageCycleDuration,
    total_cycles_detected: cycles.length,
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
