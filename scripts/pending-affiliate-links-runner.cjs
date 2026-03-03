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

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const limit = Math.max(1, Math.min(5000, Number(getArg("--limit", "800")) || 800));
const outDir = getArg("--out-dir", "logs");

const ts = new Date().toISOString().replace(/[:.]/g, "-");

const classifyBlock = (categoryName) => {
  const text = String(categoryName || "").toLowerCase();
  if (text.includes("suplement")) return "suplementos_pendentes";
  if (text.includes("acessor") || text.includes("equip") || text.includes("fitness")) return "acessorios_pendentes";
  return "demais_categorias_pendentes";
};

const ensureOut = (dir) => fs.mkdirSync(dir, { recursive: true });

const writeArtifacts = ({ baseName, outDirPath, payload, rows, txtContent }) => {
  const base = path.join(outDirPath, baseName);
  const stamped = path.join(outDirPath, `${baseName}-${ts}`);
  const json = `${base}.json`;
  const csv = `${base}.csv`;
  const txt = `${base}.txt`;
  const jsonTs = `${stamped}.json`;
  const csvTs = `${stamped}.csv`;
  const txtTs = `${stamped}.txt`;

  fs.writeFileSync(json, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(csv, `${toCsv(rows)}\n`, "utf8");
  fs.writeFileSync(txt, txtContent, "utf8");
  fs.writeFileSync(jsonTs, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(csvTs, `${toCsv(rows)}\n`, "utf8");
  fs.writeFileSync(txtTs, txtContent, "utf8");

  return {
    json,
    csv,
    txt,
    timestamped: { json: jsonTs, csv: csvTs, txt: txtTs },
  };
};

const main = async () => {
  const env = readRunnerEnv(envFile);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const rows = await client.rpc("list_unvalidated_affiliate_products", { p_limit: limit });
  const pending = Array.isArray(rows) ? rows : [];
  const productIds = pending.map((row) => row.id).filter(Boolean);

  const productRows = productIds.length
    ? await client.request(
        `/products?select=id,category_id&id=in.(${productIds.map((id) => encodeURIComponent(id)).join(",")})`,
        { method: "GET" },
      )
    : [];
  const categoryRows = await client.request(`/categories?select=id,name,slug`, { method: "GET" });

  const categoryById = new Map((Array.isArray(categoryRows) ? categoryRows : []).map((row) => [row.id, row]));
  const productById = new Map((Array.isArray(productRows) ? productRows : []).map((row) => [row.id, row]));

  const normalizedRows = pending.map((row) => {
    const product = productById.get(row.id);
    const category = categoryById.get(product?.category_id);
    const categoryName = category?.name || category?.slug || "sem_categoria";
    const block = classifyBlock(categoryName);
    return {
      block,
      product_id: row.id,
      nome: row.name,
      categoria: categoryName,
      status: row.status,
      motivo: row.reason_code,
      source_url: row.source_url || null,
      affiliate_link: row.affiliate_link || null,
      affiliate_validation_status: row.affiliate_validation_status || null,
      affiliate_validation_error: row.affiliate_validation_error || null,
      updated_at: row.updated_at || null,
    };
  });

  const blockOrder = ["suplementos_pendentes", "acessorios_pendentes", "demais_categorias_pendentes"];
  normalizedRows.sort((a, b) => {
    const ai = blockOrder.indexOf(a.block);
    const bi = blockOrder.indexOf(b.block);
    if (ai !== bi) return ai - bi;
    return String(a.updated_at || "").localeCompare(String(b.updated_at || ""));
  });

  const byBlock = Object.fromEntries(blockOrder.map((block) => [block, normalizedRows.filter((row) => row.block === block)]));

  const txtLines = [];
  for (const block of blockOrder) {
    txtLines.push(`# ${block}`);
    const urls = byBlock[block].map((row) => String(row.source_url || "").trim()).filter(Boolean);
    urls.forEach((url) => txtLines.push(url));
    txtLines.push("");
  }

  const payload = {
    ok: true,
    generated_at: new Date().toISOString(),
    totals: {
      limit,
      pending_total: normalizedRows.length,
      suplementos_pendentes: byBlock.suplementos_pendentes.length,
      acessorios_pendentes: byBlock.acessorios_pendentes.length,
      demais_categorias_pendentes: byBlock.demais_categorias_pendentes.length,
    },
    blocks: byBlock,
    rows: normalizedRows,
  };

  ensureOut(outDir);
  const outputs = writeArtifacts({
    baseName: "pending-affiliate-links",
    outDirPath: outDir,
    payload,
    rows: normalizedRows,
    txtContent: `${txtLines.join("\n")}\n`,
  });

  console.log(JSON.stringify({ ok: true, totals: payload.totals, outputs }, null, 2));
};

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
