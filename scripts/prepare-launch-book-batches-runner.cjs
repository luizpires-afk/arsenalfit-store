const fs = require("fs");
const path = require("path");
const {
  readRunnerEnv,
  createSupabaseRestClient,
  toCsv,
} = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};
const hasArg = (name) => args.includes(name);

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const inputFile = getArg("--input", "docs/launch-book-60.json");
const outPrefix = getArg("--out-prefix", "docs/launch-book-60");
const batchSize = Math.max(1, Math.min(30, Number(getArg("--batch-size", "30")) || 30));
const sourcePrefix = getArg("--source-prefix", "launch_book_60_wave");
const skipDbBatch = hasArg("--skip-db-batch");

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

const ensureDirForFile = (filePath) => {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
};

const main = async () => {
  const inputPath = path.resolve(inputFile);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`input_not_found:${inputPath}`);
  }

  const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  if (!rows.length) {
    throw new Error("launch_book_rows_empty");
  }

  const waves = chunk(rows, batchSize);
  const created = [];

  let client = null;
  if (!skipDbBatch) {
    const env = readRunnerEnv(envFile);
    if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_URL/SERVICE_ROLE_KEY ausentes para criar batch no DB");
    }
    client = createSupabaseRestClient({
      supabaseUrl: env.SUPABASE_URL,
      serviceRoleKey: env.SERVICE_ROLE_KEY,
    });
  }

  for (let waveIndex = 0; waveIndex < waves.length; waveIndex += 1) {
    const waveNumber = waveIndex + 1;
    const waveRows = waves[waveIndex];
    const waveBase = `${outPrefix}-wave${waveNumber}`;
    const txtPath = path.resolve(`${waveBase}.txt`);
    const csvPath = path.resolve(`${waveBase}.csv`);
    const jsonPath = path.resolve(`${waveBase}.json`);

    const outputRows = waveRows.map((row, index) => ({
      position: index + 1,
      id: row.id,
      name: row.name,
      site_category: row.site_category,
      ml_item_id: row.ml_item_id,
      price: row.price,
      last_price_source: row.last_price_source,
      free_shipping: row.free_shipping,
      source_url: row.source_url,
    }));

    ensureDirForFile(txtPath);
    fs.writeFileSync(
      txtPath,
      outputRows.map((item) => item.source_url).filter(Boolean).join("\n") + "\n",
      "utf8",
    );
    fs.writeFileSync(csvPath, toCsv(outputRows), "utf8");
    fs.writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          wave: waveNumber,
          source_input: inputPath,
          rows: outputRows,
        },
        null,
        2,
      ),
      "utf8",
    );

    let batchId = null;
    if (client) {
      const source = `${sourcePrefix}_${waveNumber}`;
      const metadata = {
        source_input: path.basename(inputPath),
        wave: waveNumber,
        prepared_by: "prepare-launch-book-batches-runner",
        from_launch_book: true,
      };

      const createdBatch = await client.request("/affiliate_validation_batches", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          source,
          status: "OPEN",
          metadata,
        }),
      });

      if (!Array.isArray(createdBatch) || !createdBatch[0]?.id) {
        throw new Error(`failed_to_create_batch_wave_${waveNumber}`);
      }

      batchId = createdBatch[0].id;
      const itemsPayload = outputRows.map((item, index) => ({
        batch_id: batchId,
        position: index + 1,
        product_id: item.id,
        source_url: item.source_url,
        external_id: item.ml_item_id,
      }));

      await client.request("/affiliate_validation_batch_items", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(itemsPayload),
      });

      await client.patch(`/affiliate_validation_batches?id=eq.${encodeURIComponent(batchId)}`, {
        total_items: outputRows.length,
      });
    }

    created.push({
      wave: waveNumber,
      total: outputRows.length,
      batch_id: batchId,
      files: {
        txt: txtPath,
        csv: csvPath,
        json: jsonPath,
      },
    });
  }

  const summaryPath = path.resolve(`${outPrefix}-batches.json`);
  ensureDirForFile(summaryPath);
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        input: inputPath,
        total_rows: rows.length,
        batch_size: batchSize,
        db_batches_created: !skipDbBatch,
        waves: created,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        summary_file: summaryPath,
        waves: created,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
