const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);

const hasArg = (name) => args.includes(name);
const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};

const MODE = String(getArg("--mode", "daily") || "daily").trim().toLowerCase();
const DRY_RUN = hasArg("--dry-run") || hasArg("--dry_run");
const CONTINUE_ON_ERROR = hasArg("--continue-on-error") || hasArg("--continue_on_error");

const PROFILES = {
  "post-deploy": [
    "npm run build",
    "npm test",
    "npm run home_rules_audit",
    "npm run root_commerce_guard",
    "npm run affiliate_reliability_monitor",
    "npm run operational_health_snapshot",
    "npm run seo_health_report",
  ],
  daily: [
    "npm run robo_agora_cauteloso",
    "npm run launch_validated_products",
    "npm run affiliate_reliability_monitor",
    "npm run operational_health_snapshot",
    "npm run home_rules_audit",
  ],
  weekly: [
    "npm run robo_15_estrito",
    "npm run audit_all_active_offers",
    "npm run operational_health_snapshot_strict",
    "npm run seo_health_report",
    "npm run affiliate_validation_list",
  ],
};

PROFILES.full = [
  ...PROFILES["post-deploy"],
  ...PROFILES.daily,
  ...PROFILES.weekly,
].filter((command, index, list) => list.indexOf(command) === index);

if (!PROFILES[MODE]) {
  console.error(
    `Modo invalido: ${MODE}. Use --mode post-deploy|daily|weekly|full`,
  );
  process.exit(1);
}

const quoteArg = (value) => {
  const raw = String(value ?? "");
  if (!raw) return '""';
  if (/\s|"/.test(raw)) return `"${raw.replace(/"/g, '\\"')}"`;
  return raw;
};

const nowIsoSafe = () => new Date().toISOString().replace(/[.:]/g, "-");
const reportDir = path.resolve("logs");
fs.mkdirSync(reportDir, { recursive: true });

const runId = `${MODE}-${nowIsoSafe()}`;
const reportPath = path.join(reportDir, `ops-production-${runId}.json`);

const report = {
  run_id: runId,
  mode: MODE,
  dry_run: DRY_RUN,
  continue_on_error: CONTINUE_ON_ERROR,
  started_at: new Date().toISOString(),
  finished_at: null,
  ok: true,
  steps: [],
};

const steps = PROFILES[MODE];

console.log(`\n[ops-production] Mode: ${MODE}`);
console.log(`[ops-production] Steps: ${steps.length}`);
if (DRY_RUN) {
  console.log("[ops-production] DRY RUN enabled. Commands will not execute.");
}

for (let i = 0; i < steps.length; i += 1) {
  const command = steps[i];
  const stepNo = i + 1;
  const startedAt = new Date();

  console.log(`\n=== [${stepNo}/${steps.length}] ${command} ===`);

  if (DRY_RUN) {
    report.steps.push({
      index: stepNo,
      command,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: 0,
      exit_code: 0,
      status: "skipped_dry_run",
    });
    continue;
  }

  const result = spawnSync(command, {
    shell: true,
    stdio: "inherit",
    env: process.env,
  });

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  const exitCode = typeof result.status === "number" ? result.status : 1;
  const status = exitCode === 0 ? "ok" : "failed";

  report.steps.push({
    index: stepNo,
    command,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: durationMs,
    exit_code: exitCode,
    status,
  });

  if (exitCode !== 0) {
    report.ok = false;
    if (!CONTINUE_ON_ERROR) {
      console.error(`\n[ops-production] Step failed (${exitCode}): ${command}`);
      break;
    }
    console.warn(`\n[ops-production] Step failed but continuing: ${command}`);
  }
}

report.finished_at = new Date().toISOString();
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

const okSteps = report.steps.filter((step) => step.exit_code === 0 || step.status === "skipped_dry_run").length;
const failSteps = report.steps.filter((step) => step.exit_code !== 0 && step.status !== "skipped_dry_run").length;

console.log("\n[ops-production] Summary");
console.log(`- ok: ${report.ok}`);
console.log(`- total steps: ${report.steps.length}`);
console.log(`- passed/skipped: ${okSteps}`);
console.log(`- failed: ${failSteps}`);
console.log(`- report: ${reportPath}`);

if (!report.ok) process.exit(1);
