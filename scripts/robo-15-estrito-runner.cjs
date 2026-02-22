const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const source = getArg("--source", "robo_15_estrito");
const timeout = getArg("--timeout", "240000");

const quoteArg = (value) => {
  const raw = String(value ?? "");
  if (!raw) return '""';
  if (/\s|"/.test(raw)) return `"${raw.replace(/"/g, '\\"')}"`;
  return raw;
};

const runStep = (label, commandParts) => {
  console.log(`\n=== ${label} ===`);
  const command = commandParts.map((part) => quoteArg(part)).join(" ");
  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  if (result.error) {
    console.error(`Erro em ${label}:`, result.error.message || result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`Falha em ${label}. Exit code: ${result.status}`);
    process.exit(result.status || 1);
  }
};

runStep("Ingestao diaria 15 estrita", [
  "npm",
  "run",
  "daily_import",
  "--",
  "--env",
  envFile,
  "--source",
  source,
  "--timeout",
  timeout,
  "--supplements",
  "5",
  "--accessories",
  "4",
  "--men_clothing",
  "2",
  "--women_clothing",
  "2",
  "--equipment",
  "2",
]);

runStep("Price maintenance full", [
  "npm",
  "run",
  "price_maintenance_full",
]);

runStep("Repair ativos (apply)", [
  "npm",
  "run",
  "repair_all_active_prices",
  "--",
  "--env",
  envFile,
  "--apply",
  "--loops",
  "1",
  "--auto-fix-limit",
  "120",
]);

runStep("Autopilot de coerencia", [
  "node",
  "-e",
  "const { readRunnerEnv, createSupabaseRestClient } = require('./scripts/_supabase_runner_utils.cjs'); const env = readRunnerEnv('supabase/functions/.env.scheduler'); const client = createSupabaseRestClient({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SERVICE_ROLE_KEY }); client.rpc('run_storefront_autopilot_now_service', { p_source: 'robo_15_estrito' }).then((res)=>{console.log(JSON.stringify(res,null,2));}).catch((e)=>{console.error(e.message||e); process.exit(1);});",
]);

runStep("Auditoria ativos", [
  "npm",
  "run",
  "audit_all_active_offers",
  "--",
  "--env",
  envFile,
]);

runStep("Reliability monitor", [
  "npm",
  "run",
  "affiliate_reliability_monitor",
  "--",
  "--env",
  envFile,
  "--source",
  `${source}_final`,
]);

runStep("Export links-fonte diarios estritos (15)", [
  "node",
  "scripts/export-daily-strict-sources-runner.cjs",
  "--env",
  envFile,
  "--limit",
  "15",
  "--out-prefix",
  "docs/daily-strict-sources",
]);

console.log("\nFluxo robo_15_estrito concluido com sucesso.");
