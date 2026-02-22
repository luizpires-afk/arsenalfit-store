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

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const batchId = getArg("--batch-id", null);
const outPrefix = getArg("--out-prefix", null);

if (!batchId) {
  console.error("Informe --batch-id <uuid>");
  process.exit(1);
}

const main = async () => {
  const env = readRunnerEnv(envFile);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SERVICE_ROLE_KEY ausentes");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const batches = await client.request(
    `/affiliate_validation_batches?select=id,source,status,total_items,applied_items,invalid_items,ignored_extra,created_at,expires_at&id=eq.${encodeURIComponent(batchId)}&limit=1`,
    { method: "GET" },
  );

  const batch = Array.isArray(batches) ? batches[0] : null;
  if (!batch) {
    throw new Error("batch_not_found");
  }

  const items = await client.request(
    `/affiliate_validation_batch_items?select=position,product_id,source_url,external_id,affiliate_url,apply_status,error_message,applied_at&batch_id=eq.${encodeURIComponent(batchId)}&order=position.asc`,
    { method: "GET" },
  );

  const rows = Array.isArray(items) ? items : [];
  const sourceUrls = rows
    .map((row) => String(row?.source_url || "").trim())
    .filter(Boolean);

  const summary = {
    batch,
    totals: {
      items: rows.length,
      pending: rows.filter((row) => String(row?.apply_status || "").toUpperCase() === "PENDING").length,
      applied: rows.filter((row) => String(row?.apply_status || "").toUpperCase() === "APPLIED").length,
      invalid: rows.filter((row) => String(row?.apply_status || "").toUpperCase() === "INVALID").length,
      skipped: rows.filter((row) => String(row?.apply_status || "").toUpperCase() === "SKIPPED").length,
    },
  };

  if (outPrefix) {
    const txtPath = `${outPrefix}.txt`;
    const csvPath = `${outPrefix}.csv`;
    const jsonPath = `${outPrefix}.json`;
    fs.writeFileSync(txtPath, sourceUrls.join("\n") + (sourceUrls.length ? "\n" : ""), "utf8");
    fs.writeFileSync(csvPath, toCsv(rows), "utf8");
    fs.writeFileSync(jsonPath, JSON.stringify({ summary, rows }, null, 2), "utf8");
    console.log(JSON.stringify({ summary, files: { txt: txtPath, csv: csvPath, json: jsonPath } }, null, 2));
    return;
  }

  console.log(JSON.stringify({ summary, rows, source_urls: sourceUrls }, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
