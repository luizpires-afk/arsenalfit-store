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

const toInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
};

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const limit = Math.max(1, Math.min(120, toInt(getArg("--limit", "15"), 15)));
const outPrefix = getArg("--out-prefix", "docs/daily-strict-sources");

const CATEGORY_ORDER = ["suplementos", "acessorios", "roupas_masc", "roupas_fem", "equipamentos"];
const buildTargets = (total) => {
  if (total >= 60) {
    return {
      suplementos: 10,
      acessorios: 13,
      roupas_masc: 12,
      roupas_fem: 12,
      equipamentos: 13,
    };
  }
  if (total >= 30) {
    return {
      suplementos: 18,
      acessorios: 4,
      roupas_masc: 3,
      roupas_fem: 2,
      equipamentos: 3,
    };
  }
  if (total >= 15) {
    return {
      suplementos: 5,
      acessorios: 4,
      roupas_masc: 2,
      roupas_fem: 2,
      equipamentos: 2,
    };
  }
  const supplements = Math.max(1, Math.floor(total * 0.6));
  const remaining = Math.max(0, total - supplements);
  const base = {
    suplementos: supplements,
    acessorios: 0,
    roupas_masc: 0,
    roupas_fem: 0,
    equipamentos: 0,
  };
  const restOrder = ["acessorios", "equipamentos", "roupas_masc", "roupas_fem"];
  let idx = 0;
  for (let i = 0; i < remaining; i += 1) {
    const key = restOrder[idx % restOrder.length];
    base[key] += 1;
    idx += 1;
  }
  return base;
};

const normalizeCategory = (value) => String(value || "").trim().toLowerCase();

const normalizeSourceUrlKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin.toLowerCase()}${pathname.toLowerCase()}`;
  } catch {
    return raw.toLowerCase().split("#")[0].split("?")[0].replace(/\/+$/, "");
  }
};

const normalizeItemKey = (value) => String(value || "").trim().toUpperCase();

const inferSiteCategory = (row, categoryMap = new Map()) => {
  const categoryFromDb = categoryMap.get(String(row?.category_id || "")) || "";
  if (categoryFromDb === "suplementos" || categoryFromDb === "vitaminas") return "suplementos";
  if (categoryFromDb === "acessorios") return "acessorios";
  if (categoryFromDb === "equipamentos") return "equipamentos";
  if (categoryFromDb === "roupas") {
    const text = `${row?.name || ""} ${row?.slug || ""}`.toLowerCase();
    if (/feminin|feminina|mulher|top|legging/.test(text)) return "roupas_fem";
    return "roupas_masc";
  }

  const raw = `${row?.name || ""} ${row?.category_id || ""} ${row?.slug || ""}`.toLowerCase();
  if (/whey|creatina|pre treino|pre-treino|suplement|protein|amino|vitamin/.test(raw)) {
    return "suplementos";
  }
  if (/bermuda|camiseta|legging|top fitness|regata|short/.test(raw)) {
    if (/feminin|fem|mulher/.test(raw)) return "roupas_fem";
    return "roupas_masc";
  }
  if (/halter|elastica|faixa|corda|roda abdominal|dumbbell|academia/.test(raw)) {
    return "equipamentos";
  }
  if (/smartwatch|squeeze|shaker|garrafa|acessor/.test(raw)) {
    return "acessorios";
  }
  return "acessorios";
};

const parseDateMs = (value) => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const hasValidPromo = (row) => {
  const price = Number(row?.price);
  if (!(Number.isFinite(price) && price > 0)) return false;

  const original = Number(row?.original_price);
  if (Number.isFinite(original) && original > price) return true;

  const previous = Number(row?.previous_price);
  if (!(Number.isFinite(previous) && previous > price)) return false;

  const expiryMs = parseDateMs(row?.previous_price_expires_at);
  if (expiryMs === null) return true;
  return expiryMs > Date.now();
};

const rankScore = (row) => {
  const clicks = Number(row?.clicks_count || 0);
  const featured = row?.is_featured ? 40 : 0;
  const freeShipping = row?.free_shipping ? 30 : 0;
  const healthStatus = String(row?.data_health_status || "").toUpperCase();
  const healthy = healthStatus === "HEALTHY" ? 20 : healthStatus === "NEEDS_REVIEW" ? 5 : 0;
  const promo = hasValidPromo(row) ? 25 : 0;
  const hasApiLikeSource = ["API_BASE", "API_PIX", "catalog", "catalog_ingest"].includes(
    String(row?.last_price_source || "").trim(),
  )
    ? 10
    : 0;
  return clicks * 5 + featured + freeShipping + healthy + promo + hasApiLikeSource;
};

const main = async () => {
  const env = readRunnerEnv(envFile);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  }

  const TARGETS = buildTargets(limit);
  const CATEGORY_CAPS = limit >= 60
    ? {
        suplementos: TARGETS.suplementos,
      }
    : {};

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const categories = await client.request("/categories?select=id,slug", { method: "GET" });
  const categoryMap = new Map(
    (Array.isArray(categories) ? categories : []).map((row) => [
      String(row?.id || ""),
      normalizeCategory(row?.slug),
    ]),
  );

  const rows = await client.request(
    "/products?select=id,name,category_id,slug,status,is_active,data_health_status,ml_item_id,source_url,affiliate_link,canonical_offer_url,price,original_price,previous_price,previous_price_source,previous_price_expires_at,last_price_source,last_price_verified_at,free_shipping,clicks_count,is_featured,updated_at&marketplace=eq.mercadolivre&removed_at=is.null&status=eq.standby&order=updated_at.desc&limit=2000",
    { method: "GET" },
  );

  const candidates = (Array.isArray(rows) ? rows : [])
    .filter((row) => String(row?.status || "").toLowerCase() === "standby")
    .filter((row) => !row?.is_active)
    .filter((row) => ["HEALTHY", "NEEDS_REVIEW"].includes(String(row?.data_health_status || "").toUpperCase()))
    .filter((row) => row?.free_shipping === true)
    .filter((row) => Boolean(String(row?.source_url || "").trim()))
    .filter((row) => Boolean(String(row?.ml_item_id || "").trim()))
    .filter((row) => Boolean(String(row?.last_price_source || "").trim()))
    .filter((row) => Number(row?.price) > 0)
    .map((row) => ({
      ...row,
      site_category: normalizeCategory(inferSiteCategory(row, categoryMap)),
      source_url_key: normalizeSourceUrlKey(row?.source_url),
      item_key: normalizeItemKey(row?.ml_item_id),
      score: rankScore(row),
    }))
    .filter((row) => Boolean(row.source_url_key))
    .filter((row) => Boolean(row.item_key))
    .sort((a, b) => (b.score - a.score) || (Number(b.clicks_count || 0) - Number(a.clicks_count || 0)));

  const byCategory = new Map();
  for (const category of CATEGORY_ORDER) byCategory.set(category, []);
  for (const row of candidates) {
    const key = CATEGORY_ORDER.includes(row.site_category) ? row.site_category : null;
    if (key) byCategory.get(key).push(row);
  }

  const selected = [];
  const used = new Set();
  const usedSourceUrls = new Set();
  const usedItems = new Set();

  for (const category of CATEGORY_ORDER) {
    const target = TARGETS[category] || 0;
    const pool = byCategory.get(category) || [];
    for (const row of pool) {
      if (selected.length >= limit) break;
      if (used.has(row.id)) continue;
      if (usedSourceUrls.has(row.source_url_key)) continue;
      if (usedItems.has(row.item_key)) continue;
      if (selected.filter((item) => item.site_category === category).length >= target) continue;
      selected.push(row);
      used.add(row.id);
      usedSourceUrls.add(row.source_url_key);
      usedItems.add(row.item_key);
    }
  }

  if (selected.length < limit) {
    for (const row of candidates) {
      if (selected.length >= limit) break;
      if (used.has(row.id)) continue;
      if (usedSourceUrls.has(row.source_url_key)) continue;
      if (usedItems.has(row.item_key)) continue;
      const cap = CATEGORY_CAPS[row.site_category];
      if (Number.isFinite(cap)) {
        const alreadySelected = selected.filter((item) => item.site_category === row.site_category).length;
        if (alreadySelected >= cap) continue;
      }
      selected.push(row);
      used.add(row.id);
      usedSourceUrls.add(row.source_url_key);
      usedItems.add(row.item_key);
    }
  }

  const outputRows = selected.slice(0, limit).map((row, index) => ({
    position: index + 1,
    id: row.id,
    name: row.name,
    site_category: row.site_category,
    ml_item_id: row.ml_item_id,
    price: row.price,
    original_price: row.original_price,
    previous_price: row.previous_price,
    previous_price_source: row.previous_price_source,
    previous_price_expires_at: row.previous_price_expires_at,
    last_price_source: row.last_price_source,
    free_shipping: row.free_shipping,
    clicks_count: row.clicks_count,
    source_url: row.source_url,
  }));

  const summary = {
    generated_at: new Date().toISOString(),
    requested_limit: limit,
    selected_total: outputRows.length,
    candidate_total: candidates.length,
    target_by_category: TARGETS,
    by_category_selected: CATEGORY_ORDER.reduce((acc, key) => {
      acc[key] = outputRows.filter((row) => row.site_category === key).length;
      return acc;
    }, {}),
  };

  const txtPath = path.resolve(`${outPrefix}.txt`);
  const jsonPath = path.resolve(`${outPrefix}.json`);
  const csvPath = path.resolve(`${outPrefix}.csv`);

  fs.mkdirSync(path.dirname(txtPath), { recursive: true });
  fs.writeFileSync(txtPath, outputRows.map((row) => row.source_url).join("\n") + (outputRows.length ? "\n" : ""), "utf8");
  fs.writeFileSync(jsonPath, JSON.stringify({ summary, rows: outputRows }, null, 2), "utf8");
  fs.writeFileSync(csvPath, toCsv(outputRows), "utf8");

  console.log(JSON.stringify({ summary, files: { txt: txtPath, json: jsonPath, csv: csvPath } }, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
