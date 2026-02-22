const { readRunnerEnv, createSupabaseRestClient } = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const limit = Math.max(10, Math.min(1500, Number(getArg("--limit", "500")) || 500));
const fetchLimit = Math.max(0, Math.min(500, Number(getArg("--fetch-limit", "150")) || 150));
const recentHours = Math.max(1, Math.min(72, Number(getArg("--recent-hours", "24")) || 24));
const requestTimeoutMs = Math.max(5000, Math.min(40000, Number(getArg("--request-timeout-ms", "15000")) || 15000));

const SEC_PATTERN = /^https?:\/\/(www\.)?mercadolivre\.com\/sec\//i;
const ALLOWED_PRICE_SOURCES = new Set(["catalog", "scraper", "catalog_ingest", "api_base", "api_pix"]);

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeMlItem = (value) => {
  const match = String(value || "").toUpperCase().match(/MLB\d{6,14}/);
  return match ? match[0] : null;
};

const buildProductUrl = (row) => {
  const sourceUrl = String(row?.source_url || "").trim();
  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) return sourceUrl;
  const canonical = String(row?.canonical_offer_url || "").trim();
  if (canonical && /^https?:\/\//i.test(canonical)) return canonical;
  const mlItem = normalizeMlItem(row?.ml_item_id || row?.external_id);
  if (!mlItem) return null;
  const numeric = mlItem.replace(/^MLB/i, "");
  return `https://produto.mercadolivre.com.br/MLB-${numeric}-_JM`;
};

const extractBestPrice = (html) => {
  const patterns = [
    /itemprop="price"[^>]*content="([0-9]+(?:\.[0-9]+)?)"/i,
    /"price_amount"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
    /"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
    /"amount"\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*"currency_id"\s*:\s*"BRL"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const value = toFiniteNumber(match?.[1]);
    if (value && value > 0) return value;
  }
  return null;
};

const extractOriginalPrice = (html, currentPrice) => {
  const patterns = [
    /"original_price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
    /itemprop="highPrice"[^>]*content="([0-9]+(?:\.[0-9]+)?)"/i,
    /"price_old"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const value = toFiniteNumber(match?.[1]);
    if (value && currentPrice && value > currentPrice) return value;
  }
  return null;
};

const fetchHtmlPrice = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      return { ok: false, status: response.status, error: `http_${response.status}` };
    }

    const html = await response.text();
    const price = extractBestPrice(html);
    const originalPrice = price ? extractOriginalPrice(html, price) : null;

    if (!(price && price > 0)) {
      return { ok: false, status: response.status, error: "price_not_found" };
    }

    return { ok: true, status: response.status, price, originalPrice };
  } catch (error) {
    return { ok: false, status: 0, error: error?.message || String(error) };
  } finally {
    clearTimeout(timer);
  }
};

const rankForPrimary = (row) => {
  const status = String(row?.status || "").toLowerCase();
  const activeBonus = status === "active" && row?.is_active ? 100 : 0;
  const healthBonus = String(row?.data_health_status || "").toUpperCase() === "HEALTHY" ? 40 : 0;
  const secBonus = SEC_PATTERN.test(String(row?.affiliate_link || "")) ? 20 : 0;
  const verifiedAt = row?.last_price_verified_at ? new Date(row.last_price_verified_at).getTime() : 0;
  const recency = Number.isFinite(verifiedAt) ? Math.floor(verifiedAt / 1000) : 0;
  return activeBonus + healthBonus + secBonus + recency;
};

const main = async () => {
  const env = readRunnerEnv(envFile);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const rows = await client.fetchPagedRows(
    `/products?select=id,name,status,is_active,data_health_status,price,original_price,price_mismatch_status,last_price_source,last_price_verified_at,ml_item_id,external_id,source_url,canonical_offer_url,affiliate_link,auto_disabled_reason,deactivation_reason,gender,affiliate_verified,updated_at&marketplace=eq.mercadolivre&removed_at=is.null&limit=${limit}`,
    1000,
  );

  const groups = new Map();
  for (const row of rows) {
    const mlItem = normalizeMlItem(row.ml_item_id || row.external_id);
    if (!mlItem) continue;
    if (!groups.has(mlItem)) groups.set(mlItem, []);
    groups.get(mlItem).push(row);
  }

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const recentWindowMs = recentHours * 60 * 60 * 1000;

  let duplicateGroups = 0;
  let duplicateDemoted = 0;
  const primaries = [];

  for (const [mlItem, members] of groups.entries()) {
    const ordered = [...members].sort((a, b) => rankForPrimary(b) - rankForPrimary(a));
    const primary = ordered[0];
    primaries.push(primary);

    const activeMembers = ordered.filter(
      (row) => String(row.status || "").toLowerCase() === "active" && Boolean(row.is_active),
    );
    if (activeMembers.length > 1) {
      duplicateGroups += 1;
      for (const row of activeMembers.slice(1)) {
        await client.patch(`/products?id=eq.${encodeURIComponent(row.id)}`, {
          status: "standby",
          is_active: false,
          data_health_status: "NEEDS_REVIEW",
          deactivation_reason: "duplicate_ml_item_guard",
          auto_disabled_reason: "duplicate_ml_item_guard",
          auto_disabled_at: nowIso,
          last_health_check_at: nowIso,
          updated_at: nowIso,
        });
        duplicateDemoted += 1;
      }
    }
  }

  let fetchProcessed = 0;
  let fetchUpdated = 0;
  let fetchFailed = 0;

  for (const row of primaries.slice(0, fetchLimit)) {
    const url = buildProductUrl(row);
    if (!url) continue;

    fetchProcessed += 1;
    const scraped = await fetchHtmlPrice(url, requestTimeoutMs);
    if (!scraped.ok) {
      fetchFailed += 1;
      continue;
    }

    const updates = {
      price: scraped.price,
      last_price_source: "scraper",
      last_price_verified_at: nowIso,
      updated_at: nowIso,
      last_health_check_at: nowIso,
    };

    if (scraped.originalPrice && scraped.originalPrice > scraped.price) {
      updates.original_price = scraped.originalPrice;
      updates.previous_price = scraped.originalPrice;
    } else {
      updates.original_price = null;
      updates.previous_price = null;
    }

    await client.patch(`/products?id=eq.${encodeURIComponent(row.id)}`, updates);
    fetchUpdated += 1;
  }

  const openCases = await client.fetchPagedRows(
    "/price_mismatch_cases?select=product_id,status&status=eq.OPEN",
    1000,
  );
  const openSet = new Set(openCases.map((row) => row.product_id));

  let recovered = 0;
  let normalized = 0;
  const recoveredIds = [];

  for (const row of primaries) {
    const status = String(row.status || "").toLowerCase();
    if (status !== "standby" || row.is_active) continue;

    const hasSec = SEC_PATTERN.test(String(row.affiliate_link || ""));
    const hasMlItem = Boolean(normalizeMlItem(row.ml_item_id || row.external_id));
    const source = String(row.last_price_source || "").toLowerCase();
    const verifiedAt = row.last_price_verified_at ? new Date(row.last_price_verified_at).getTime() : null;
    const recentEnough = Number.isFinite(verifiedAt) ? nowMs - verifiedAt <= recentWindowMs : false;
    const mismatchOpen = String(row.price_mismatch_status || "NONE").toUpperCase() === "OPEN" || openSet.has(row.id);

    if (!hasSec || !hasMlItem || mismatchOpen || !recentEnough || !ALLOWED_PRICE_SOURCES.has(source)) {
      continue;
    }

    const patch = {
      status: "active",
      is_active: true,
      deactivation_reason: null,
      auto_disabled_reason: null,
      auto_disabled_at: null,
      last_health_check_at: nowIso,
      updated_at: nowIso,
    };

    if (String(row.data_health_status || "").toUpperCase() !== "HEALTHY") {
      patch.data_health_status = "HEALTHY";
      normalized += 1;
    }

    await client.patch(`/products?id=eq.${encodeURIComponent(row.id)}`, patch);
    recovered += 1;
    recoveredIds.push(row.id);
  }

  const postRows = await client.fetchPagedRows(
    "/products?select=id,name,status,is_active,data_health_status,gender&marketplace=eq.mercadolivre&removed_at=is.null",
    1000,
  );

  const clothing = postRows.filter((row) => {
    const text = `${row.name || ""} ${row.gender || ""}`.toLowerCase();
    return /roupa|bermuda|camiseta|legging|top|short|feminina|masculina/.test(text);
  });

  const male = clothing.filter((row) => /masc|masculin|homem/.test(`${row.gender || ""} ${row.name || ""}`.toLowerCase()));
  const female = clothing.filter((row) => /fem|feminin|mulher|legging|top/.test(`${row.gender || ""} ${row.name || ""}`.toLowerCase()));

  const summary = {
    ok: true,
    totals: {
      candidates: rows.length,
      unique_ml_items: groups.size,
      duplicate_groups: duplicateGroups,
      duplicate_demoted: duplicateDemoted,
      fetch_processed: fetchProcessed,
      fetch_updated: fetchUpdated,
      fetch_failed: fetchFailed,
      recovered,
      normalized,
    },
    clothing: {
      total: clothing.length,
      active: clothing.filter((row) => String(row.status || "").toLowerCase() === "active" && row.is_active).length,
      standby: clothing.filter((row) => String(row.status || "").toLowerCase() === "standby").length,
      male_total: male.length,
      male_active: male.filter((row) => String(row.status || "").toLowerCase() === "active" && row.is_active).length,
      female_total: female.length,
      female_active: female.filter((row) => String(row.status || "").toLowerCase() === "active" && row.is_active).length,
    },
    recovered_sample: recoveredIds.slice(0, 30),
  };

  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
