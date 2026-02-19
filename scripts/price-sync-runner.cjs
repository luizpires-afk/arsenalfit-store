const fs = require("fs");

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const source = getArg("--source", "cron");

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  let text = fs.readFileSync(filePath, "utf8");
  text = text.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  const out = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    out[key] = value;
  }
  return out;
};

const envFromFile = parseEnvFile(envFile);
const supabaseEnv = parseEnvFile("supabase/.env");
const rootEnv = parseEnvFile(".env");
const forceSync = args.includes("--force");
const forceTokens = args.includes("--force-tokens") || args.includes("--reset-tokens");
const skipAlerts = args.includes("--skip-alerts");
const noContinuation = args.includes("--no-continuation");
const batchSizeArg = getArg("--batch-size", null);
const maxRuntimeArg = getArg("--max-runtime", null);
const maxContinuationsArg = getArg("--max-continuations", null);
const toFiniteInt = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : null;
};
const batchSize = batchSizeArg === null ? null : toFiniteInt(batchSizeArg);
const maxRuntime = maxRuntimeArg === null ? null : toFiniteInt(maxRuntimeArg);
const maxContinuations = maxContinuationsArg === null ? null : toFiniteInt(maxContinuationsArg);

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  envFromFile.SUPABASE_URL ||
  supabaseEnv.SUPABASE_URL ||
  rootEnv.SUPABASE_URL ||
  rootEnv.VITE_SUPABASE_URL;

const CRON_SECRET =
  process.env.CRON_SECRET ||
  envFromFile.CRON_SECRET ||
  supabaseEnv.CRON_SECRET ||
  rootEnv.CRON_SECRET;

if (!SUPABASE_URL) {
  console.error("SUPABASE_URL não definido. Informe no ambiente ou no arquivo:", envFile);
  process.exit(1);
}
if (!CRON_SECRET) {
  console.error("CRON_SECRET não definido. Informe no ambiente ou no arquivo:", envFile);
  process.exit(1);
}

process.env.HTTP_PROXY = "";
process.env.HTTPS_PROXY = "";
process.env.ALL_PROXY = "";
process.env.GIT_HTTP_PROXY = "";
process.env.GIT_HTTPS_PROXY = "";

const base = SUPABASE_URL.replace(/\/$/, "");
const endpoint = base.endsWith("/functions/v1")
  ? `${base}/price-sync`
  : `${base}/functions/v1/price-sync`;

const timeoutMs = Number(getArg("--timeout", "180000")) || 180000;
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-cron-secret": CRON_SECRET,
  },
  body: JSON.stringify({
    source,
    ...(forceSync ? { force: true } : {}),
    ...(forceTokens ? { force_tokens: true } : {}),
    ...(skipAlerts ? { skip_alerts: true } : {}),
    ...(noContinuation ? { allow_continuation: false } : {}),
    ...(batchSize !== null ? { batch_size: batchSize } : {}),
    ...(maxRuntime !== null ? { max_runtime_ms: maxRuntime } : {}),
    ...(maxContinuations !== null ? { max_continuations: maxContinuations } : {}),
  }),
  signal: controller.signal,
})
  .then(async (resp) => {
    clearTimeout(timer);
    const text = await resp.text();
    console.log("Status:", resp.status);
    if (text) console.log(text);
    if (!resp.ok) process.exit(1);
  })
  .catch((err) => {
    clearTimeout(timer);
    console.error(err?.message || err);
    process.exit(1);
  });
