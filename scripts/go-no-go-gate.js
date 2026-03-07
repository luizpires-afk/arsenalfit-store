import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

function argFlag(name) {
  return process.argv.includes(name);
}

function argValue(name, defaultValue) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return defaultValue;
  return process.argv[idx + 1];
}

function readJson(relativePath) {
  try {
    const fullPath = path.resolve(relativePath);
    if (!fs.existsSync(fullPath)) return null;
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch {
    return null;
  }
}

function runCommand(command, envOverrides = {}) {
  const result = spawnSync("bash", ["-lc", command], {
    env: {
      ...process.env,
      ...envOverrides,
    },
    encoding: "utf8",
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function boolFromArg(name, defaultValue) {
  if (argFlag(name)) return true;
  if (argFlag(`--no-${name.replace(/^--/, "")}`)) return false;
  return defaultValue;
}

function envFileValue(envFilePath, key) {
  try {
    const filePath = path.resolve(envFilePath);
    if (!fs.existsSync(filePath)) return "";
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (!trimmed.startsWith(`${key}=`)) continue;
      return trimmed.slice(key.length + 1).trim();
    }
  } catch {
    return "";
  }
  return "";
}

function hasAnyKey(envFilePath, keys) {
  for (const key of keys) {
    const fromProcess = String(process.env[key] || "").trim();
    if (fromProcess) return { ok: true, key };
    const fromFile = envFileValue(envFilePath, key);
    if (fromFile) return { ok: true, key };
  }
  return { ok: false, key: null };
}

const runReadiness = boolFromArg("--run-readiness", true);
const checkStack = boolFromArg("--check-stack", true);
const runBuildValidation = boolFromArg("--run-build-validation", false);
const runE2E = boolFromArg("--run-e2e", false);
const runFullPricing = boolFromArg("--run-full-pricing", false);
const progressiveConfig = boolFromArg("--progressive-config", true);
const envFile = argValue("--env-file", "supabase/functions/.env.scheduler");

const minActiveHealthy = Number(argValue("--min-active-healthy", "1"));
const maxStandbyRatio = Number(argValue("--max-standby-ratio", "0.95"));
const maxUndispatchedP1 = Number(argValue("--max-undispatched-p1", "0"));

const findings = [];

if (checkStack) {
  const stackStatus = runCommand("npm run ops_stack_status");
  if (!stackStatus.ok) {
    findings.push("Stack status not healthy (`npm run ops_stack_status` failed)");
  }
}

if (runReadiness) {
  const readiness = runCommand("npm run ops_stack_readiness", {
    PRODUCTION_SMOKE_RUN_BUILD_VALIDATION: runBuildValidation ? "true" : "false",
    PRODUCTION_SMOKE_RUN_E2E: runE2E ? "true" : "false",
    PRODUCTION_SMOKE_RUN_FULL_PRICING: runFullPricing ? "true" : "false",
    PRODUCTION_SMOKE_STRICT_CONFIG: progressiveConfig ? "false" : "true",
  });

  if (!readiness.ok) {
    findings.push("Readiness execution failed (`npm run ops_stack_readiness`) ");
  }
}

const tokenCheck = hasAnyKey(envFile, ["MELI_ACCESS_TOKEN", "MERCADOLIVRE_ACCESS_TOKEN", "ACCESS_TOKEN"]);
if (!tokenCheck.ok) {
  findings.push("Missing Mercado Livre token in environment (`MELI_ACCESS_TOKEN`, `MERCADOLIVRE_ACCESS_TOKEN` or `ACCESS_TOKEN`)");
}

const webhookCheck = hasAnyKey(envFile, [
  "ALERT_ROUTING_P1_WEBHOOK",
  "ALERT_ROUTING_P2_WEBHOOK",
  "ALERT_ROUTING_P3_WEBHOOK",
]);
if (!webhookCheck.ok) {
  findings.push("Missing alert webhook (`ALERT_ROUTING_P1_WEBHOOK|P2|P3`)");
}

const pipeline = readJson("reports/pipeline-final-health.json") || {};
if (String(pipeline.pipeline_status || "") !== "OK") {
  findings.push("Pipeline final health is not OK");
}

const readinessReport = readJson("reports/system-production-readiness.json") || {};
const criteria = readinessReport.success_criteria || {};
for (const [key, value] of Object.entries(criteria)) {
  if (!value) findings.push(`Readiness criteria failed: ${key}`);
}

const operational = readJson("logs/operational-health-snapshot-latest.json") || {};
const totals = operational.totals || {};
const activeHealthy = Number(totals.active_healthy || 0);
const productsTotal = Number(totals.products || 0);
const standbyTotal = Number(totals.standby_total || 0);
const standbyRatio = productsTotal > 0 ? standbyTotal / productsTotal : 1;

if (activeHealthy < minActiveHealthy) {
  findings.push(`Active healthy products below threshold (${activeHealthy} < ${minActiveHealthy})`);
}

if (standbyRatio > maxStandbyRatio) {
  findings.push(`Standby ratio above threshold (${standbyRatio.toFixed(3)} > ${maxStandbyRatio})`);
}

const alerts = readJson("reports/alert-routing-report.json") || {};
const alertItems = Array.isArray(alerts.alerts) ? alerts.alerts : [];
const undispatchedP1 = alertItems.filter((a) => a.priority === "P1" && a.dispatch_ok === false).length;
if (undispatchedP1 > maxUndispatchedP1) {
  findings.push(`Undispatched P1 alerts above threshold (${undispatchedP1} > ${maxUndispatchedP1})`);
}

const verdict = findings.length === 0 ? "GO" : "NO_GO";

const report = {
  generated_at: new Date().toISOString(),
  verdict,
  checks: {
    stack_checked: checkStack,
    readiness_executed: runReadiness,
    progressive_config: progressiveConfig,
    token_key_found: tokenCheck.ok,
    webhook_key_found: webhookCheck.ok,
    pipeline_status: String(pipeline.pipeline_status || "UNKNOWN"),
    active_healthy: activeHealthy,
    total_products: productsTotal,
    standby_total: standbyTotal,
    standby_ratio: Number(standbyRatio.toFixed(4)),
    undispatched_p1_alerts: undispatchedP1,
  },
  thresholds: {
    min_active_healthy: minActiveHealthy,
    max_standby_ratio: maxStandbyRatio,
    max_undispatched_p1: maxUndispatchedP1,
  },
  findings,
};

const outFile = path.resolve("reports/go-no-go-gate.json");
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
console.log(`GO_NO_GO_REPORT: ${outFile}`);

if (verdict !== "GO") {
  process.exit(1);
}
