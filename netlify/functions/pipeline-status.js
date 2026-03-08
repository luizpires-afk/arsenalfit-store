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
  return cycles;
};

export const handler = async () => {
  try {
    const cwd = process.cwd();
    const logPath = path.resolve(cwd, "logs/ml-30m-sync-cycle.log");
    if (!fs.existsSync(logPath)) {
      return jsonResponse(200, {
        pipeline_status: "NOT_STARTED",
        status_reason: "log_file_not_found",
        message: "Nenhum ciclo registrado ainda neste ambiente.",
        last_pipeline_run_time: null,
        duration_seconds: 0,
        steps_ok: [],
        steps_failed: [],
      });
    }

    const content = String(fs.readFileSync(logPath, "utf8"));
    const cycles = parseCycles(content);
    const lastCycle = cycles.length ? cycles[cycles.length - 1] : null;
    if (!lastCycle) {
      return jsonResponse(200, {
        pipeline_status: "NOT_STARTED",
        status_reason: "log_file_empty_or_unrecognized",
        message: "Log encontrado, mas sem ciclos reconhecidos.",
        last_pipeline_run_time: null,
        duration_seconds: 0,
        steps_ok: [],
        steps_failed: [],
      });
    }

    const successful = [...cycles].reverse().find((c) => c.pipeline_status === "OK") || null;
    const failed = [...cycles].reverse().find((c) => c.pipeline_status !== "OK") || null;
    const avgDuration = cycles.length
      ? Number((cycles.reduce((acc, c) => acc + (Number(c.duration_seconds || 0) || 0), 0) / cycles.length).toFixed(2))
      : 0;

    return jsonResponse(200, {
      pipeline_status: lastCycle.pipeline_status,
      last_pipeline_run_time: lastCycle.ended_at || lastCycle.started_at || null,
      duration_seconds: lastCycle.duration_seconds || 0,
      steps_ok: lastCycle.steps_ok,
      steps_failed: lastCycle.steps_failed,
      steps_retried: lastCycle.steps_retried,
      last_successful_cycle: successful
        ? {
            started_at: successful.started_at,
            ended_at: successful.ended_at,
            duration_seconds: successful.duration_seconds || 0,
          }
        : null,
      last_failed_cycle: failed
        ? {
            started_at: failed.started_at,
            ended_at: failed.ended_at,
            duration_seconds: failed.duration_seconds || 0,
            steps_failed: failed.steps_failed,
          }
        : null,
      average_cycle_duration: avgDuration,
      total_cycles_detected: cycles.length,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: String(error?.message || error),
    });
  }
};
