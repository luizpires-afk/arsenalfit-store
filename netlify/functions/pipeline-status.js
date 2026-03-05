import fs from "fs";
import path from "path";

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const parseLastCycle = (content) => {
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
        pipeline_status: "FAILED",
      };
      continue;
    }
    if (!current) continue;

    const ok = line.match(/step_ok=([a-z0-9_\-]+)/i);
    if (ok) current.steps_ok.push(ok[1]);

    const fail = line.match(/step_failed=([a-z0-9_\-]+)/i);
    if (fail) current.steps_failed.push(fail[1]);

    const health = line.match(/pipeline_duration=(\d+)s/i);
    if (health) current.duration_seconds = Number(health[1] || 0) || 0;

    const doneErr = line.match(/completed_with_errors/i);
    if (doneErr) {
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
  return cycles.length ? cycles[cycles.length - 1] : null;
};

export const handler = async () => {
  try {
    const cwd = process.cwd();
    const logPath = path.resolve(cwd, "logs/ml-30m-sync-cycle.log");
    if (!fs.existsSync(logPath)) {
      return jsonResponse(200, {
        pipeline_status: "FAILED",
        last_pipeline_run_time: null,
        duration_seconds: 0,
        steps_ok: [],
        steps_failed: [],
      });
    }

    const content = String(fs.readFileSync(logPath, "utf8"));
    const lastCycle = parseLastCycle(content);
    if (!lastCycle) {
      return jsonResponse(200, {
        pipeline_status: "FAILED",
        last_pipeline_run_time: null,
        duration_seconds: 0,
        steps_ok: [],
        steps_failed: [],
      });
    }

    return jsonResponse(200, {
      pipeline_status: lastCycle.pipeline_status,
      last_pipeline_run_time: lastCycle.ended_at || lastCycle.started_at || null,
      duration_seconds: lastCycle.duration_seconds || 0,
      steps_ok: lastCycle.steps_ok,
      steps_failed: lastCycle.steps_failed,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: String(error?.message || error),
    });
  }
};
