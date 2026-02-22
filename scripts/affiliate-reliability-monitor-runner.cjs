const { readRunnerEnv, createSupabaseRestClient } = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);

const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};

const envPath = getArg("--env", "supabase/functions/.env.scheduler");
const windowHours = Math.max(1, Math.min(168, Number(getArg("--window-hours", "48")) || 48));
const source = getArg("--source", "on_demand");

const main = async () => {
  const env = readRunnerEnv(envPath);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const snapshot = await client.rpc("capture_affiliate_reliability_snapshot", {
    p_source: source,
    p_window_hours: windowHours,
  });

  const latest = await client.request(
    "/affiliate_reliability_snapshots?select=id,source,captured_at,window_hours,overall_status,standby_total,standby_healthy,standby_strict_gate,active_total,active_sec_link,active_api_recent,active_ml_item_ok,open_affiliate_batches,trace_report_date,trace_total_mismatch&order=captured_at.desc&limit=5",
    { method: "GET" },
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        snapshot,
        latest,
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
