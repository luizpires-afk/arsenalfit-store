const fs = require("fs");
const path = require("path");
const {
  readRunnerEnv,
  createSupabaseRestClient,
  toCsv,
} = require("./_supabase_runner_utils.cjs");

const MLB_REGEX = /MLB\d{6,14}/i;
const TRUSTED_PRICE_SOURCES = new Set(["api", "api_base", "api_pix", "catalog", "catalog_ingest"]);

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
const maxPriceAgeHours = Math.max(1, toInt(getArg("--max-price-age-hours", "24"), 24));
const maxPromoRatio = Number(getArg("--max-promo-ratio", "4")) || 4;
const apiWaitMs = Math.max(0, toInt(getArg("--api-wait-ms", "120"), 120));
const requireApiCheck = String(getArg("--require-api-check", "true")).trim().toLowerCase() !== "false";
const failIfInsufficientSafe = String(getArg("--fail-if-insufficient-safe", "true")).trim().toLowerCase() !== "false";

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  let text = fs.readFileSync(path.resolve(filePath), "utf8");
  text = text.replace(/^\uFEFF/, "");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    out[key] = value;
  }
  return out;
};

const resolveMeliAccessToken = (envFilePath) => {
  const envFileVars = parseEnvFile(envFilePath);
  const supabaseVars = parseEnvFile("supabase/.env");
  const rootVars = parseEnvFile(".env");
  return (
    process.env.MELI_ACCESS_TOKEN ||
    envFileVars.MELI_ACCESS_TOKEN ||
    supabaseVars.MELI_ACCESS_TOKEN ||
    rootVars.MELI_ACCESS_TOKEN ||
    null
  );
};

const normalizeMlItem = (value) => {
  if (!value) return null;
  const match = String(value).toUpperCase().match(MLB_REGEX);
  return match?.[0] ?? null;
};

const extractMlItemFromUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const fromPath = normalizeMlItem(parsed.pathname);
    if (fromPath) return fromPath;
    const keys = ["item_id", "wid", "id", "item"];
    for (const key of keys) {
      const fromParam = normalizeMlItem(parsed.searchParams.get(key));
      if (fromParam) return fromParam;
    }
  } catch {
    return normalizeMlItem(raw);
  }
  return normalizeMlItem(raw);
};

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

const isPriceFresh = (row, maxAgeHours) => {
  const reference = row?.last_price_verified_at || row?.updated_at || null;
  const refMs = parseDateMs(reference);
  if (refMs === null) return false;
  return Date.now() - refMs <= maxAgeHours * 60 * 60 * 1000;
};

const hasConsistentMlIdentity = (row) => {
  const mlItemId = normalizeMlItem(row?.ml_item_id);
  if (!mlItemId) return false;

  const fromSource = extractMlItemFromUrl(row?.source_url);
  const fromCanonical = extractMlItemFromUrl(row?.canonical_offer_url);
  const fromAffiliate = extractMlItemFromUrl(row?.affiliate_link);
  const resolved = [fromSource, fromCanonical, fromAffiliate].filter(Boolean);
  if (resolved.length === 0) return true;
  return resolved.every((value) => value === mlItemId);
};

const hasSafePromoShape = (row, maxRatio) => {
  const price = Number(row?.price);
  if (!(Number.isFinite(price) && price > 0)) return false;

  const original = Number(row?.original_price);
  if (Number.isFinite(original) && original > 0) {
    if (original <= price) return false;
    if (original > price * maxRatio) return false;
  }

  const previous = Number(row?.previous_price);
  if (Number.isFinite(previous) && previous > 0) {
    if (previous <= price) return false;
    if (previous > price * maxRatio) return false;
  }

  return true;
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
    "/products?select=id,name,category_id,slug,status,is_active,data_health_status,price_mismatch_status,ml_item_id,source_url,affiliate_link,canonical_offer_url,price,original_price,previous_price,previous_price_source,previous_price_expires_at,last_price_source,last_price_verified_at,free_shipping,clicks_count,is_featured,updated_at&marketplace=eq.mercadolivre&removed_at=is.null&status=eq.standby&order=updated_at.desc&limit=2000",
    { method: "GET" },
  );

  const meliAccessToken = resolveMeliAccessToken(envFile);
  const apiProbeCache = new Map();
  const checkMlApiAccess = async (row) => {
    const mlItemId = normalizeMlItem(row?.ml_item_id);
    if (!mlItemId) return { ok: false, reason: "missing_ml_item" };
    if (!requireApiCheck) return { ok: true, status: null };
    if (!meliAccessToken) return { ok: false, reason: "missing_meli_access_token" };

    if (apiProbeCache.has(mlItemId)) return apiProbeCache.get(mlItemId);

    let result = { ok: false, reason: "api_unknown" };
    try {
      const resp = await fetch(`https://api.mercadolibre.com/items/${encodeURIComponent(mlItemId)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${meliAccessToken}`,
          Accept: "application/json",
          "User-Agent": "arsenalfit-safe-export/1.0",
        },
      });
      result = resp.ok
        ? { ok: true, status: resp.status }
        : { ok: false, reason: `api_http_${resp.status}`, status: resp.status };
    } catch (error) {
      result = { ok: false, reason: `api_error:${error?.message || String(error)}` };
    }

    apiProbeCache.set(mlItemId, result);
    if (apiWaitMs > 0) await sleep(apiWaitMs);
    return result;
  };

  const rejectedBaseReasons = {};
  const rejectBase = (reason) => {
    rejectedBaseReasons[reason] = (rejectedBaseReasons[reason] || 0) + 1;
  };

  const candidates = (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      if (String(row?.status || "").toLowerCase() !== "standby") {
        rejectBase("not_standby");
        return false;
      }
      if (row?.is_active) {
        rejectBase("active_row");
        return false;
      }
      if (String(row?.data_health_status || "").toUpperCase() !== "HEALTHY") {
        rejectBase("health_not_healthy");
        return false;
      }
      if (String(row?.price_mismatch_status || "NONE").toUpperCase() === "OPEN") {
        rejectBase("price_mismatch_open");
        return false;
      }
      if (row?.free_shipping !== true) {
        rejectBase("free_shipping_required");
        return false;
      }
      if (!Boolean(String(row?.source_url || "").trim())) {
        rejectBase("missing_source_url");
        return false;
      }
      if (!Boolean(String(row?.ml_item_id || "").trim())) {
        rejectBase("missing_ml_item");
        return false;
      }
      const source = String(row?.last_price_source || "").trim().toLowerCase();
      if (!TRUSTED_PRICE_SOURCES.has(source)) {
        rejectBase("untrusted_price_source");
        return false;
      }
      if (!isPriceFresh(row, maxPriceAgeHours)) {
        rejectBase("stale_price");
        return false;
      }
      if (!hasSafePromoShape(row, maxPromoRatio)) {
        rejectBase("unsafe_promo_shape");
        return false;
      }
      if (!hasConsistentMlIdentity(row)) {
        rejectBase("ml_identity_mismatch");
        return false;
      }
      if (!(Number(row?.price) > 0)) {
        rejectBase("invalid_price");
        return false;
      }
      return true;
    })
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
  const rejectedApiReasons = {};
  const rejectApi = (reason) => {
    rejectedApiReasons[reason] = (rejectedApiReasons[reason] || 0) + 1;
  };

  for (const category of CATEGORY_ORDER) {
    const target = TARGETS[category] || 0;
    const pool = byCategory.get(category) || [];
    for (const row of pool) {
      if (selected.length >= limit) break;
      if (used.has(row.id)) continue;
      if (usedSourceUrls.has(row.source_url_key)) continue;
      if (usedItems.has(row.item_key)) continue;
      if (selected.filter((item) => item.site_category === category).length >= target) continue;
      const apiCheck = await checkMlApiAccess(row);
      if (!apiCheck.ok) {
        rejectApi(apiCheck.reason || "api_rejected");
        continue;
      }
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
      const apiCheck = await checkMlApiAccess(row);
      if (!apiCheck.ok) {
        rejectApi(apiCheck.reason || "api_rejected");
        continue;
      }
      selected.push(row);
      used.add(row.id);
      usedSourceUrls.add(row.source_url_key);
      usedItems.add(row.item_key);
    }
  }

  if (selected.length < limit && failIfInsufficientSafe) {
    const reasonPayload = {
      selected_safe_total: selected.length,
      required_limit: limit,
      base_filter_rejections: rejectedBaseReasons,
      api_rejections: rejectedApiReasons,
      require_api_check: requireApiCheck,
    };
    throw new Error(`safe_candidates_insufficient:${JSON.stringify(reasonPayload)}`);
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
    safety_policy: {
      require_api_check: requireApiCheck,
      fail_if_insufficient_safe: failIfInsufficientSafe,
      max_price_age_hours: maxPriceAgeHours,
      max_promo_ratio: maxPromoRatio,
      trusted_price_sources: Array.from(TRUSTED_PRICE_SOURCES),
    },
    rejected: {
      base_filter_reasons: rejectedBaseReasons,
      api_reasons: rejectedApiReasons,
    },
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
