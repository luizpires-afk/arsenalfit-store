const { readRunnerEnv, createSupabaseRestClient } = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);

const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};

const envPath = getArg("--env", "supabase/functions/.env.scheduler");
const itemLimit = Math.max(1, Math.min(50000, Number(getArg("--item-limit", "5000")) || 5000));

const main = async () => {
  const env = readRunnerEnv(envPath);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const cleanup = await client.rpc("cleanup_expired_affiliate_validation_batches", {
    p_item_limit: itemLimit,
  });

  const openBatches = await client.request(
    "/affiliate_validation_batches?select=id,created_at,expires_at,status,total_items,applied_items,invalid_items&status=eq.OPEN&order=created_at.desc&limit=50",
    { method: "GET" },
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        cleanup,
        open_batches_after: openBatches.length,
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
