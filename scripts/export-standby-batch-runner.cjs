const fs = require("fs");

const args = process.argv.slice(2);

const getArg = (name, fallback = null) => {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

const hasArg = (name) => args.includes(name);

const parseEnvFile = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return {};
  let text = fs.readFileSync(filePath, "utf8");
  text = text.replace(/^\uFEFF/, "");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    out[key] = value;
  }
  return out;
};

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const limit = Math.max(1, Math.min(30, Number(getArg("--limit", "30")) || 30));
const source = getArg("--source", "cli_export_standby_batch");
const asJson = hasArg("--json");

const envFromFile = parseEnvFile(envFile);
const envFromSupabase = parseEnvFile("supabase/.env");
const envFromRoot = parseEnvFile(".env");

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  envFromFile.SUPABASE_URL ||
  envFromSupabase.SUPABASE_URL ||
  envFromRoot.SUPABASE_URL ||
  envFromRoot.VITE_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  envFromFile.SUPABASE_SERVICE_ROLE_KEY ||
  envFromFile.SUPABASE_SERVICE_KEY ||
  envFromSupabase.SUPABASE_SERVICE_ROLE_KEY ||
  envFromSupabase.SUPABASE_SERVICE_KEY ||
  envFromRoot.SUPABASE_SERVICE_ROLE_KEY ||
  envFromRoot.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente. Configure no ambiente/.env.",
  );
  process.exit(1);
}

const main = async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.rpc("export_standby_affiliate_batch", {
    p_limit: limit,
    p_source: source,
  });

  if (error) {
    console.error("Erro ao exportar batch:", error.message || error);
    process.exit(1);
  }

  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    if (asJson) {
      console.log(JSON.stringify({ batch_id: null, total: 0, rows: [] }, null, 2));
    } else {
      console.log("Nenhum produto pendente elegivel para exportacao.");
    }
    return;
  }

  const ordered = rows
    .slice()
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
  const batchId = ordered[0]?.batch_id ?? null;
  const urls = ordered
    .map((row) => String(row.source_url ?? "").trim())
    .filter(Boolean);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          batch_id: batchId,
          total: ordered.length,
          rows: ordered,
          source_urls: urls,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`batch_id=${batchId}`);
  console.log(`total=${ordered.length}`);
  console.log("");
  for (const url of urls) {
    console.log(url);
  }
};

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
