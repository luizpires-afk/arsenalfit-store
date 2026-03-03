const fs = require("fs");
const {
  readRunnerEnv,
  createSupabaseRestClient,
  toCsv,
} = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);

const getArg = (name, fallback = null) => {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

const hasArg = (name) => args.includes(name);

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const limit = Math.max(1, Math.min(30, Number(getArg("--limit", "30")) || 30));
const source = getArg("--source", "cli_export_standby_batch");
const asJson = hasArg("--json");
const outPrefix = getArg("--out-prefix", null);

const main = async () => {
  const env = readRunnerEnv(envFile);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }

  if (!source.trim()) {
    throw new Error("Parametro --source invalido. Informe um source nao vazio.");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  let data = null;
  let error = null;

  try {
    data = await client.rpc("export_standby_affiliate_batch_service", {
      p_limit: limit,
      p_source: source,
    });
  } catch (serviceError) {
    try {
      data = await client.rpc("export_standby_affiliate_batch", {
        p_limit: limit,
        p_source: source,
      });
    } catch (fallbackError) {
      error = fallbackError?.message || fallbackError || serviceError;
    }
  }

  if (error) {
    throw new Error(`Erro ao exportar lote. Verifique permissao admin/service_role e tente novamente. Detalhe: ${error}`);
  }

  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    const payload = { ok: true, batch_id: null, total: 0, source, limit, summary: { items: 0 }, error_summary: {}, rows: [], source_urls: [] };
    if (outPrefix) {
      fs.writeFileSync(`${outPrefix}.txt`, "", "utf8");
      fs.writeFileSync(`${outPrefix}.csv`, "", "utf8");
      fs.writeFileSync(`${outPrefix}.json`, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    }
    if (asJson) {
      console.log(JSON.stringify(payload, null, 2));
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

  const payload = {
    ok: true,
    batch_id: batchId,
    total: ordered.length,
    source,
    limit,
    summary: {
      items: ordered.length,
    },
    error_summary: {},
    rows: ordered,
    source_urls: urls,
  };

  if (outPrefix) {
    const txtPath = `${outPrefix}.txt`;
    const csvPath = `${outPrefix}.csv`;
    const jsonPath = `${outPrefix}.json`;
    fs.writeFileSync(txtPath, `${urls.join("\n")}${urls.length ? "\n" : ""}`, "utf8");
    fs.writeFileSync(csvPath, `${toCsv(ordered)}\n`, "utf8");
    fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ...payload, outputs: { txt: txtPath, csv: csvPath, json: jsonPath } }, null, 2));
    return;
  }

  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
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
