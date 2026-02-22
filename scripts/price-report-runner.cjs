const fs = require("fs");

const args = process.argv.slice(2);
const hasArg = (name) => args.includes(name);
const getArgAny = (names, fallback) => {
  for (const name of names) {
    const idx = args.indexOf(name);
    if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  }
  return fallback;
};

const envFile = getArgAny(["--env"], "supabase/functions/.env.scheduler");
const sinceHours = Number(getArgAny(["--since-hours", "--since_hours"], "24")) || 24;
const reportDate = getArgAny(["--date", "--report-date", "--report_date"], null);
const maxRetries = Number(getArgAny(["--max-retries", "--max_retries"], "3")) || 3;
const explicitMode = getArgAny(["--mode"], null);
const resendMode = hasArg("--resend") || hasArg("--retry") || explicitMode === "resend";
const mode = explicitMode || (resendMode ? "resend" : "generate_daily");

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
  console.error("SUPABASE_URL nao definido. Informe no ambiente ou no arquivo:", envFile);
  process.exit(1);
}
if (!CRON_SECRET) {
  console.error("CRON_SECRET nao definido. Informe no ambiente ou no arquivo:", envFile);
  process.exit(1);
}

process.env.HTTP_PROXY = "";
process.env.HTTPS_PROXY = "";
process.env.ALL_PROXY = "";
process.env.GIT_HTTP_PROXY = "";
process.env.GIT_HTTPS_PROXY = "";

const base = SUPABASE_URL.replace(/\/$/, "");
const endpoint = base.endsWith("/functions/v1")
  ? `${base}/price-sync-report`
  : `${base}/functions/v1/price-sync-report`;

const timeoutMs = 30000;
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

const body = {
  source: resendMode ? "manual_resend" : "manual_generate",
  mode,
  sinceHours,
  max_retries: maxRetries,
  ...(reportDate ? { report_date: reportDate } : {}),
};

fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-cron-secret": CRON_SECRET,
  },
  body: JSON.stringify(body),
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
