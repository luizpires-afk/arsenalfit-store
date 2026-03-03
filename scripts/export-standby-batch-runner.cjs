const fs = require("fs");
const path = require("path");
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
const fallbackFromPending = String(getArg("--fallback-from-pending", "false")).toLowerCase() === "true";
const category = getArg("--category", "all");
const maxItems = Math.max(1, Math.min(30, Number(getArg("--max-items", String(limit))) || limit));
const asJson = hasArg("--json");
const outPrefix = getArg("--out-prefix", null);

const writePayloadArtifacts = ({ prefix, payload, rowsForCsv, txtLines }) => {
  if (!prefix) return null;
  fs.mkdirSync(path.dirname(prefix), { recursive: true });
  const txtPath = `${prefix}.txt`;
  const csvPath = `${prefix}.csv`;
  const jsonPath = `${prefix}.json`;
  fs.writeFileSync(txtPath, `${txtLines.join("\n")}${txtLines.length ? "\n" : ""}`, "utf8");
  fs.writeFileSync(csvPath, `${toCsv(rowsForCsv)}\n`, "utf8");
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { txt: txtPath, csv: csvPath, json: jsonPath };
};

const main = async () => {
  const {
    shouldUseFallbackFromPending,
    pickFallbackRows,
    buildFallbackBatchSource,
    buildFallbackSummary,
  } = await import("../src/lib/affiliateFallbackBatch.js");

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
    let payload = { ok: true, batch_id: null, total: 0, source, limit, fallback_used: false, summary: { items: 0 }, error_summary: {}, rows: [], source_urls: [] };

    let fallbackOutputs = null;
    if (shouldUseFallbackFromPending({ exportRows: rows, pendingRows: [{}], fallbackEnabled: fallbackFromPending })) {
      const pendingPath = path.join(path.dirname(outPrefix || "logs/affiliate-batch-export"), "pending-affiliate-links.json");
      const pendingPayload = fs.existsSync(pendingPath)
        ? JSON.parse(fs.readFileSync(pendingPath, "utf8"))
        : null;

      const pendingRows = Array.isArray(pendingPayload?.rows) ? pendingPayload.rows : [];
      const selected = pickFallbackRows({
        pendingRows,
        category,
        maxItems,
      });

      if (selected.length > 0) {
        const fallbackSource = buildFallbackBatchSource({ baseSource: source, category });
        const existingOpen = await client.request(
          `/affiliate_validation_batches?select=id,status,source,total_items,created_at&status=eq.OPEN&source=eq.${encodeURIComponent(fallbackSource)}&order=created_at.desc&limit=1`,
          { method: "GET" },
        );
        let batchId = Array.isArray(existingOpen) && existingOpen[0] ? existingOpen[0].id : null;

        if (!batchId) {
          const created = await client.request(`/affiliate_validation_batches`, {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({
              status: "OPEN",
              source: fallbackSource,
              metadata: {
                fallback_from_pending: true,
                category,
                max_items: maxItems,
                origin_source: source,
              },
            }),
          });
          batchId = Array.isArray(created) && created[0] ? created[0].id : null;

          if (batchId) {
            const items = selected.map((item, index) => ({
              batch_id: batchId,
              position: index + 1,
              product_id: item.product_id,
              source_url: item.source_url,
              external_id: item.ml_item_id || null,
            }));
            await client.request(`/affiliate_validation_batch_items`, {
              method: "POST",
              headers: { Prefer: "return=representation" },
              body: JSON.stringify(items),
            });
            await client.patch(`/affiliate_validation_batches?id=eq.${encodeURIComponent(batchId)}`, {
              total_items: items.length,
              applied_items: 0,
              invalid_items: 0,
              ignored_extra: 0,
            });
          }
        }

        const fallbackItems = batchId
          ? await client.request(
              `/affiliate_validation_batch_items?select=batch_id,position,product_id,source_url,external_id,apply_status,error_message&batch_id=eq.${encodeURIComponent(batchId)}&order=position.asc`,
              { method: "GET" },
            )
          : [];

        const fallbackOrdered = Array.isArray(fallbackItems) ? fallbackItems : [];
        const fallbackUrls = fallbackOrdered.map((item) => String(item.source_url || "").trim()).filter(Boolean);
        payload = {
          ok: true,
          batch_id: batchId,
          total: fallbackOrdered.length,
          source,
          limit,
          fallback_used: true,
          fallback_mode: "pending_manual_batch",
          summary: {
            items: fallbackOrdered.length,
            ...buildFallbackSummary({ selectedRows: fallbackOrdered, category, maxItems }),
          },
          error_summary: {},
          rows: fallbackOrdered,
          source_urls: fallbackUrls,
        };

        const fallbackPrefix = path.join(path.dirname(outPrefix || "logs/affiliate-batch-export"), "affiliate-batch-export-fallback");
        fallbackOutputs = writePayloadArtifacts({
          prefix: fallbackPrefix,
          payload,
          rowsForCsv: fallbackOrdered,
          txtLines: fallbackUrls,
        });
      }
    }

    if (outPrefix) {
      writePayloadArtifacts({
        prefix: outPrefix,
        payload,
        rowsForCsv: payload.rows,
        txtLines: payload.source_urls,
      });
    }
    if (asJson) {
      console.log(JSON.stringify({ ...payload, outputs: fallbackOutputs || undefined }, null, 2));
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
    const outputs = writePayloadArtifacts({
      prefix: outPrefix,
      payload,
      rowsForCsv: ordered,
      txtLines: urls,
    });
    console.log(JSON.stringify({ ...payload, outputs }, null, 2));
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
