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

const parseLinks = (text) =>
  String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const batchId = getArg("--batch-id", null);
const linksFile = getArg("--links-file", null);
const asJson = hasArg("--json");

if (!batchId) {
  console.error("Informe --batch-id <uuid>.");
  process.exit(1);
}

let links = [];
if (linksFile) {
  if (!fs.existsSync(linksFile)) {
    console.error(`Arquivo nao encontrado: ${linksFile}`);
    process.exit(1);
  }
  links = parseLinks(fs.readFileSync(linksFile, "utf8"));
} else {
  try {
    if (!process.stdin.isTTY) {
      const stdin = fs.readFileSync(0, "utf8");
      links = parseLinks(stdin);
    }
  } catch {
    // ignore stdin read errors
  }
}

if (!links.length) {
  console.error(
    "Nenhum link recebido. Use --links-file <arquivo.txt> ou envie links por STDIN (1 por linha).",
  );
  process.exit(1);
}

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

  const { data, error } = await client.rpc("apply_affiliate_validation_batch", {
    p_batch_id: batchId,
    p_affiliate_urls: links,
  });

  if (error) {
    console.error("Erro ao aplicar batch:", error.message || error);
    process.exit(1);
  }

  const payload = Array.isArray(data) ? data[0] : data;
  if (asJson) {
    console.log(JSON.stringify(payload ?? {}, null, 2));
    return;
  }

  console.log(JSON.stringify(payload ?? {}, null, 2));
};

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
