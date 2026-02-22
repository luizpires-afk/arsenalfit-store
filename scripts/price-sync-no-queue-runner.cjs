const fs = require('fs');

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  let text = fs.readFileSync(filePath, 'utf8');
  text = text.replace(/^\uFEFF/, '');
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, '');
    out[key] = value;
  }
  return out;
};

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};

const envFile = getArg('--env', 'supabase/functions/.env.scheduler');
const source = getArg('--source', 'launch_no_queue');
const timeoutMs = Number(getArg('--timeout', '180000')) || 180000;

const envFromFile = parseEnvFile(envFile);
const supabaseEnv = parseEnvFile('supabase/.env');
const rootEnv = parseEnvFile('.env');

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

if (!SUPABASE_URL || !CRON_SECRET) {
  console.error('SUPABASE_URL/CRON_SECRET ausentes');
  process.exit(1);
}

const base = String(SUPABASE_URL).replace(/\/$/, '');
const endpoint = base.endsWith('/functions/v1')
  ? `${base}/price-sync`
  : `${base}/functions/v1/price-sync`;

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-cron-secret': CRON_SECRET,
  },
  body: JSON.stringify({
    source,
    force: true,
    use_queue: false,
    batch_size: 120,
    max_runtime_ms: 120000,
    max_continuations: 8,
    allow_continuation: true,
    skip_alerts: true,
  }),
  signal: controller.signal,
})
  .then(async (resp) => {
    clearTimeout(timer);
    const text = await resp.text();
    console.log('Status:', resp.status);
    if (text) console.log(text);
    if (!resp.ok) process.exit(1);
  })
  .catch((error) => {
    clearTimeout(timer);
    console.error(error?.message || error);
    process.exit(1);
  });
