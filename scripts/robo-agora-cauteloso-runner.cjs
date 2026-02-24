const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const source = getArg("--source", "robo_agora_cauteloso");
const timeout = getArg("--timeout", "240000");
const blockedMlItems = getArg("--blocked-ml-items", process.env.BLOCKED_ML_ITEMS || "MLB6173287630");
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

runStep("Ingestao diaria cautelosa", [
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
]);

runStep("Cleanup catalogo (apply)", [
  "npm",
  "run",
  "catalog_cleanup_and_unblock",
  "--",
  "--env",
  envFile,
  "--source",
  source,
  "--apply",
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
  "80",
  ...(blockedMlItems ? ["--blocked-ml-items", blockedMlItems] : []),
]);

runStep("Price maintenance (recheck critico reforcado)", [
  "npm",
  "run",
  "price_maintenance_full",
  "--",
  "--env",
  envFile,
  "--strict-max-stale-hours",
  "8",
  "--critical-recheck-cycles",
  "3",
  "--critical-recheck-wait-ms",
  "2000",
]);

runStep("Auto recover mercado products (dedupe + standby recovery + promo capture)", [
  "node",
  "scripts/auto-recover-mercado-products-runner.cjs",
  "--env",
  envFile,
  "--limit",
  "500",
  "--fetch-limit",
  "500",
  "--recent-hours",
  "72",
  ...(blockedMlItems ? ["--blocked-ml-items", blockedMlItems] : []),
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

runStep("Operational health snapshot", [
  "npm",
  "run",
  "operational_health_snapshot",
  "--",
  "--env",
  envFile,
  "--source",
  `${source}_final`,
  "--auto-enqueue-cta-unresolved",
]);

runStep("Check export standby strict", [
  "node",
  "scripts/export-standby-batch-runner.cjs",
  "--env",
  envFile,
  "--limit",
  "30",
  "--source",
  `${source}_final`,
  "--json",
]);

console.log("\nFluxo robo_agora_cauteloso concluido com sucesso.");
