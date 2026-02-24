const {
  readRunnerEnv,
  createSupabaseRestClient,
  isMercadoLivreSecLink,
} = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const limit = Math.max(10, Math.min(1500, Number(getArg("--limit", "500")) || 500));
const fetchLimitRaw = Number(getArg("--fetch-limit", "150"));
const fetchLimit = Math.max(0, Math.min(500, Number.isFinite(fetchLimitRaw) ? fetchLimitRaw : 150));
const recentHours = Math.max(1, Math.min(72, Number(getArg("--recent-hours", "24")) || 24));
const requestTimeoutMs = Math.max(5000, Math.min(40000, Number(getArg("--request-timeout-ms", "15000")) || 15000));
const suspiciousRetryAttempts = Math.max(0, Math.min(3, Number(getArg("--suspicious-retries", "2")) || 2));
const blockedMlItemsArg = String(getArg("--blocked-ml-items", process.env.BLOCKED_ML_ITEMS || "") || "");
const blockedMlItems = new Set(
  blockedMlItemsArg
    .split(",")
    .map((value) => String(value || "").trim().toUpperCase())
    .filter((value) => /^MLB\d{6,14}$/.test(value)),
);

const ALLOWED_PRICE_SOURCES = new Set(["catalog", "scraper", "catalog_ingest", "api_base", "api_pix"]);
const MIN_SCRAPER_TO_API_RATIO = 0.75;
const MAX_SCRAPER_TO_API_RATIO = 1.35;
const MIN_SCRAPER_TO_ORIGINAL_RATIO = 0.35;
const MIN_SCRAPER_TO_ROW_ANCHOR_RATIO = 0.30;
const NO_API_SCRAPER_DROP_GUARD_ABS = 40;
const NO_API_SCRAPER_DROP_GUARD_PCT = 0.25;
const NO_API_TRUSTED_STICKY_GUARD_ABS = 10;
const NO_API_TRUSTED_STICKY_GUARD_PCT = 0.05;
const GENERIC_ONLY_SPREAD_REJECT_RATIO = 1.2;
const TRUSTED_ROW_PRICE_SOURCES = new Set(["catalog", "catalog_ingest", "api_base", "api_pix", "manual", "auth", "public"]);
const TRUSTED_STICKY_SOURCES = new Set(["manual", "auth", "public", "api_base", "api_pix", "catalog_ingest"]);
const RECOVERABLE_STANDBY_STATUSES = new Set(["standby", "pending", "pending_validacao", "pending_validation"]);

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeMlItem = (value) => {
  const match = String(value || "").toUpperCase().match(/MLB\d{6,14}/);
  return match ? match[0] : null;
};

const extractMlItemIdFromUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return (
      normalizeMlItem(parsed.searchParams.get("item_id")) ||
      normalizeMlItem(parsed.searchParams.get("wid")) ||
      normalizeMlItem(parsed.pathname) ||
      normalizeMlItem(raw)
    );
  } catch {
    return normalizeMlItem(raw);
  }
};

const parseBrMoney = (value) => {
  const raw = String(value || "").trim().replace(/\s+/g, "");
  if (!raw) return null;
  if (/^\d{1,3}(?:\.\d{3})+,\d{2}$/.test(raw)) {
    const n = Number(raw.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (/^\d+,\d{2}$/.test(raw)) {
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(raw.replace(/,/g, "."));
  return Number.isFinite(n) ? n : null;
};

const stripHtml = (html) => {
  if (!html) return "";
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const isRecommendationContext = (text) => {
  const context = String(text || "").toLowerCase();
  return (
    context.includes("sua primeira compra") ||
    context.includes("produto também comprou") ||
    context.includes("patrocinado") ||
    context.includes("mais vendidos") ||
    context.includes("quem viu também") ||
    context.includes("esportes e fitness") ||
    context.includes("ofertas")
  );
};

const isMercadoCatalogProductUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    const host = String(parsed.host || "").toLowerCase();
    if (!host.includes("mercadolivre")) return false;
    return /^\/p\/MLB\d{6,14}/i.test(parsed.pathname || "");
  } catch {
    return false;
  }
};

const isScraperSuspiciousVsApi = (scrapedPrice, apiPrice) => {
  const scraped = toFiniteNumber(scrapedPrice);
  const api = toFiniteNumber(apiPrice);
  if (!(scraped && scraped > 0 && api && api > 0)) return false;
  return scraped < api * MIN_SCRAPER_TO_API_RATIO || scraped > api * MAX_SCRAPER_TO_API_RATIO;
};

const buildProductUrl = (row) => {
  const sourceUrl = String(row?.source_url || "").trim();
  const canonical = String(row?.canonical_offer_url || "").trim();
  const mlItem = normalizeMlItem(row?.ml_item_id || row?.external_id);
  const canonicalIsHttp = canonical && /^https?:\/\//i.test(canonical);
  const sourceIsHttp = sourceUrl && /^https?:\/\//i.test(sourceUrl);

  if (canonicalIsHttp && (mlItem || isMercadoCatalogProductUrl(sourceUrl))) {
    return canonical;
  }
  if (sourceIsHttp) return sourceUrl;
  if (canonicalIsHttp) return canonical;
  if (!mlItem) return null;
  const numeric = mlItem.replace(/^MLB/i, "");
  return `https://produto.mercadolivre.com.br/MLB-${numeric}-_JM`;
};

const collectNumericMatches = (html, pattern) => {
  const regex = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  const values = [];
  for (const match of html.matchAll(regex)) {
    const value = toFiniteNumber(match?.[1]);
    if (value && value > 0) values.push(value);
  }
  return values;
};

const resolveMedian = (values) => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
};

const uniquePositive = (values) => {
  const unique = new Set();
  for (const value of values || []) {
    if (!(Number.isFinite(value) && value > 0)) continue;
    unique.add(Number(value));
  }
  return Array.from(unique.values());
};

const hasWideSpread = (values, ratioThreshold = GENERIC_ONLY_SPREAD_REJECT_RATIO) => {
  const filtered = uniquePositive(values);
  if (filtered.length < 2) return false;
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  if (!(min > 0 && max > 0)) return false;
  return max / min >= ratioThreshold;
};

const extractBestPrice = (html, options = {}) => {
  const candidates = [];
  const referencePrice = toFiniteNumber(options?.referencePrice);
  const compactHtml = String(html || "").replace(/\s+/g, " ");
  const plainText = stripHtml(html);

  const pushCandidate = (raw, score) => {
    const parsed = typeof raw === "number" ? raw : parseBrMoney(raw);
    if (!(parsed && parsed > 0)) return;
    candidates.push({ value: parsed, score });
  };

  for (const match of compactHtml.matchAll(/itemprop="price"[^>]*content="([0-9]+(?:\.[0-9]+)?)"/gi)) {
    pushCandidate(match?.[1], 140);
  }

  for (const match of compactHtml.matchAll(/"price_amount"\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi)) {
    pushCandidate(match?.[1], 130);
  }

  for (const match of plainText.matchAll(/opç(?:õ|o)es de compra[^\.]{0,140}?a partir de\s*r\$\s*([0-9][0-9\s\.,]{0,16})/gi)) {
    pushCandidate(match?.[1], 135);
  }

  for (const match of compactHtml.matchAll(/"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi)) {
    const context = compactHtml.slice(Math.max(0, match.index - 120), Math.min(compactHtml.length, match.index + 140));
    if (isRecommendationContext(context)) continue;
    pushCandidate(match?.[1], 125);
  }

  const genericRegex = /r\$\s*([0-9][0-9\s\.,]{0,16})/gi;
  let generic;
  while ((generic = genericRegex.exec(plainText))) {
    const context = plainText.slice(Math.max(0, generic.index - 60), Math.min(plainText.length, genericRegex.lastIndex + 60)).toLowerCase();
    const isInstallment =
      context.includes("parcela") ||
      context.includes("parcelado") ||
      context.includes("sem juros") ||
      /\b\d{1,2}\s*x\b/.test(context);
    const isNonStandard =
      context.includes(" pix") ||
      context.includes("de r$") ||
      context.includes("economize") ||
      context.includes("agora") ||
      context.includes("off") ||
      context.includes("mais vendido") ||
      context.includes("reco") ||
      context.includes("polycard") ||
      context.includes("cupom") ||
      context.includes("coupon") ||
      isRecommendationContext(context);
    if (isInstallment || isNonStandard) continue;
    pushCandidate(generic?.[1], 85);
  }

  if (!candidates.length) return null;

  const bucket = new Map();
  for (const candidate of candidates) {
    const key = candidate.value.toFixed(2);
    if (!bucket.has(key)) {
      bucket.set(key, { value: candidate.value, score: candidate.score, count: 1 });
      continue;
    }
    const current = bucket.get(key);
    current.count += 1;
    if (candidate.score > current.score) current.score = candidate.score;
  }

  const ranked = Array.from(bucket.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (referencePrice && referencePrice > 0) {
      const aDistance = Math.abs(a.value - referencePrice) / referencePrice;
      const bDistance = Math.abs(b.value - referencePrice) / referencePrice;
      if (aDistance !== bDistance) return aDistance - bDistance;
    }
    if (b.count !== a.count) return b.count - a.count;
    return b.value - a.value;
  });

  return ranked[0]?.value ?? null;
};

const extractOriginalPrice = (html, currentPrice) => {
  const patterns = [
    /"original_price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi,
    /itemprop="highPrice"[^>]*content="([0-9]+(?:\.[0-9]+)?)"/gi,
    /"price_old"\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi,
  ];

  const values = [];
  for (const pattern of patterns) {
    values.push(...collectNumericMatches(html, pattern));
  }

  if (!values.length) return null;
  const candidates = values.filter((value) => value > currentPrice);
  if (!candidates.length) return null;
  return Math.max(...candidates);
};

const isScraperSuspiciousWithoutApi = (row, scrapedPrice, scrapedOriginalPrice) => {
  const scraped = toFiniteNumber(scrapedPrice);
  if (!(scraped && scraped > 0)) return true;

  const scrapedOriginal = toFiniteNumber(scrapedOriginalPrice);
  if (scrapedOriginal && scrapedOriginal > scraped) {
    if (scraped < scrapedOriginal * MIN_SCRAPER_TO_ORIGINAL_RATIO) return true;
  }

  const rowAnchors = [];
  const rowOriginal = toFiniteNumber(row?.original_price);
  if (rowOriginal && rowOriginal > 0) rowAnchors.push(rowOriginal);

  const rowPrevious = toFiniteNumber(row?.previous_price);
  if (rowPrevious && rowPrevious > 0) rowAnchors.push(rowPrevious);

  const rowPrice = toFiniteNumber(row?.price);
  const rowPriceSource = String(row?.last_price_source || "").toLowerCase();
  if (rowPrice && rowPrice > 0 && TRUSTED_ROW_PRICE_SOURCES.has(rowPriceSource)) {
    rowAnchors.push(rowPrice);
  }

  if (!rowAnchors.length) return false;
  const anchor = Math.max(...rowAnchors);
  return scraped < anchor * MIN_SCRAPER_TO_ROW_ANCHOR_RATIO;
};

const hasReliableScraperAnchorForRecovery = (row) => {
  const price = toFiniteNumber(row?.price);
  if (!(price && price > 0)) return false;

  const original = toFiniteNumber(row?.original_price);
  if (original && original > price && price >= original * MIN_SCRAPER_TO_ORIGINAL_RATIO) return true;

  const previous = toFiniteNumber(row?.previous_price);
  if (previous && previous > price && price >= previous * MIN_SCRAPER_TO_ORIGINAL_RATIO) return true;

  const mlItemId = normalizeMlItem(row?.ml_item_id || row?.external_id);
  const sourceMlItem = extractMlItemIdFromUrl(row?.source_url);
  const canonicalMlItem = extractMlItemIdFromUrl(row?.canonical_offer_url);
  const hasStructuralMlAnchor =
    Boolean(mlItemId) && (sourceMlItem === mlItemId || canonicalMlItem === mlItemId);

  const deactivationReason = String(row?.deactivation_reason || row?.auto_disabled_reason || "").toLowerCase();
  const isRecoverableReason =
    deactivationReason === "suspect_price_consecutive" ||
    deactivationReason === "untrusted_drop_unconfirmed" ||
    deactivationReason === "suspect_untrusted_drop" ||
    deactivationReason === "strict_stale_price_trace";

  if (hasStructuralMlAnchor && isRecoverableReason) return true;

  return false;
};

const buildNoApiGuardAnchor = (row) => {
  const anchors = [];

  const rowOriginal = toFiniteNumber(row?.original_price);
  if (rowOriginal && rowOriginal > 0) anchors.push(rowOriginal);

  const rowPrevious = toFiniteNumber(row?.previous_price);
  if (rowPrevious && rowPrevious > 0) anchors.push(rowPrevious);

  const rowPrice = toFiniteNumber(row?.price);
  const rowPriceSource = String(row?.last_price_source || "").toLowerCase();
  if (rowPrice && rowPrice > 0 && TRUSTED_ROW_PRICE_SOURCES.has(rowPriceSource)) {
    anchors.push(rowPrice);
  }

  if (!anchors.length) return null;
  return Math.max(...anchors);
};

const isAggressiveNoApiScraperDrop = (row, scrapedPrice) => {
  const scraped = toFiniteNumber(scrapedPrice);
  if (!(scraped && scraped > 0)) return true;

  const anchor = buildNoApiGuardAnchor(row);
  if (!(anchor && anchor > 0)) return false;

  const absoluteDrop = anchor - scraped;
  const percentDrop = anchor > 0 ? absoluteDrop / anchor : 0;

  return (
    absoluteDrop >= NO_API_SCRAPER_DROP_GUARD_ABS ||
    percentDrop >= NO_API_SCRAPER_DROP_GUARD_PCT
  );
};

const isTrustedNoApiStickyMismatch = (row, scrapedPrice) => {
  const scraped = toFiniteNumber(scrapedPrice);
  if (!(scraped && scraped > 0)) return true;

  const source = String(row?.last_price_source || "").toLowerCase();
  if (!TRUSTED_STICKY_SOURCES.has(source)) return false;

  const current = toFiniteNumber(row?.price);
  if (!(current && current > 0)) return false;

  const absoluteDelta = Math.abs(scraped - current);
  const percentDelta = current > 0 ? absoluteDelta / current : 0;

  return (
    absoluteDelta >= NO_API_TRUSTED_STICKY_GUARD_ABS ||
    percentDelta >= NO_API_TRUSTED_STICKY_GUARD_PCT
  );
};

const fetchHtmlPrice = async (url, timeoutMs, options = {}) => {
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
    const price = extractBestPrice(html, { referencePrice: options?.referencePrice ?? null });
    const originalPrice = price ? extractOriginalPrice(html, price) : null;

    const itempropValues = uniquePositive(
      collectNumericMatches(html, /itemprop="price"[^>]*content="([0-9]+(?:\.[0-9]+)?)"/gi),
    );
    const priceAmountValues = uniquePositive(
      collectNumericMatches(html, /"price_amount"\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi),
    );
    const genericValues = uniquePositive([
      ...collectNumericMatches(html, /"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi),
      ...collectNumericMatches(html, /"amount"\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*"currency_id"\s*:\s*"BRL"/gi),
    ]);
    const genericOnly = itempropValues.length === 0 && priceAmountValues.length === 0;
    const unstableGeneric = genericOnly && hasWideSpread(genericValues);

    if (!(price && price > 0)) {
      return { ok: false, status: response.status, error: "price_not_found" };
    }

    return {
      ok: true,
      status: response.status,
      price,
      originalPrice,
      genericOnly,
      unstableGeneric,
      candidateCount: genericValues.length + priceAmountValues.length + itempropValues.length,
    };
  } catch (error) {
    return { ok: false, status: 0, error: error?.message || String(error) };
  } finally {
    clearTimeout(timer);
  }
};

const fetchApiItemPricing = async (mlItemId, timeoutMs) => {
  if (!mlItemId) return { ok: false, status: 0, error: "missing_ml_item" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://api.mercadolibre.com/items/${encodeURIComponent(mlItemId)}`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      return { ok: false, status: response.status, error: `http_${response.status}` };
    }

    const body = await response.json();
    const price = toFiniteNumber(body?.price);
    const originalPrice = toFiniteNumber(body?.original_price);
    if (!(price && price > 0)) {
      return { ok: false, status: response.status, error: "api_price_not_found" };
    }

    return {
      ok: true,
      status: response.status,
      price,
      originalPrice: originalPrice && originalPrice > price ? originalPrice : null,
    };
  } catch (error) {
    return { ok: false, status: 0, error: error?.message || String(error) };
  } finally {
    clearTimeout(timer);
  }
};

const retrySuspiciousScraper = async ({ row, url, initialScraped, timeoutMs }) => {
  if (!initialScraped?.ok || !(initialScraped.price > 0)) return initialScraped;
  const requiresRetry =
    isScraperSuspiciousWithoutApi(row, initialScraped.price, initialScraped.originalPrice) ||
    Boolean(initialScraped.unstableGeneric);
  if (!requiresRetry) {
    return initialScraped;
  }
  if (!(url && suspiciousRetryAttempts > 0)) return initialScraped;

  const candidates = [initialScraped];
  for (let attempt = 0; attempt < suspiciousRetryAttempts; attempt += 1) {
    const retry = await fetchHtmlPrice(url, timeoutMs, { referencePrice: row?.price ?? null });
    if (retry?.ok && retry.price > 0) candidates.push(retry);
  }

  const prices = candidates.map((item) => toFiniteNumber(item?.price)).filter((value) => value && value > 0);
  if (!prices.length) return initialScraped;

  const mergedPrice = resolveMedian(prices);
  const originals = candidates
    .map((item) => toFiniteNumber(item?.originalPrice))
    .filter((value) => value && mergedPrice && value > mergedPrice);
  const mergedOriginal = originals.length ? Math.max(...originals) : null;
  const mergedUnstableGeneric = hasWideSpread(prices);

  return {
    ok: true,
    status: initialScraped.status,
    price: mergedPrice,
    originalPrice: mergedOriginal,
    genericOnly: candidates.every((item) => Boolean(item?.genericOnly)),
    unstableGeneric: mergedUnstableGeneric,
    candidateCount: prices.length,
  };
};

const rankForPrimary = (row) => {
  const status = String(row?.status || "").toLowerCase();
  const activeBonus = status === "active" && row?.is_active ? 100 : 0;
  const healthBonus = String(row?.data_health_status || "").toUpperCase() === "HEALTHY" ? 40 : 0;
  const secBonus = isMercadoLivreSecLink(String(row?.affiliate_link || "")) ? 20 : 0;
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
    `/products?select=id,name,status,is_active,data_health_status,price,original_price,previous_price,price_mismatch_status,last_price_source,last_price_verified_at,ml_item_id,external_id,source_url,canonical_offer_url,affiliate_link,auto_disabled_reason,deactivation_reason,gender,affiliate_verified,updated_at&marketplace=eq.mercadolivre&removed_at=is.null&limit=${limit}`,
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
  let fetchApiFallback = 0;
  let fetchScraperRejected = 0;
  let fetchScraperRejectedNoApiGuard = 0;
  let fetchScraperRejectedAggressiveDrop = 0;
  let fetchScraperRejectedTrustedSticky = 0;
  let fetchScraperRejectedUnstableGeneric = 0;
  let blockedMlItemsDemoted = 0;

  if (blockedMlItems.size > 0) {
    for (const row of rows) {
      const mlItem = normalizeMlItem(row.ml_item_id || row.external_id);
      if (!mlItem || !blockedMlItems.has(mlItem)) continue;
      const isActive = String(row.status || "").toLowerCase() === "active" && Boolean(row.is_active);
      if (!isActive) continue;
      await client.patch(`/products?id=eq.${encodeURIComponent(row.id)}`, {
        status: "standby",
        is_active: false,
        data_health_status: "NEEDS_REVIEW",
        deactivation_reason: "blocked_ml_item_guard",
        auto_disabled_reason: "blocked_ml_item_guard",
        auto_disabled_at: nowIso,
        last_health_check_at: nowIso,
        updated_at: nowIso,
      });
      blockedMlItemsDemoted += 1;
    }
  }

  for (const row of primaries.slice(0, fetchLimit)) {
    const url = buildProductUrl(row);
    const mlItem = normalizeMlItem(row.ml_item_id || row.external_id);
    if (!url && !mlItem) continue;
    if (mlItem && blockedMlItems.has(mlItem)) continue;

    fetchProcessed += 1;
    const [initialScraped, apiPricing] = await Promise.all([
      url
        ? fetchHtmlPrice(url, requestTimeoutMs, { referencePrice: row.price ?? null })
        : Promise.resolve({ ok: false, status: 0, error: "missing_url" }),
      mlItem
        ? fetchApiItemPricing(mlItem, requestTimeoutMs)
        : Promise.resolve({ ok: false, status: 0, error: "missing_ml_item" }),
    ]);

    const scraped =
      initialScraped.ok && !apiPricing.ok
        ? await retrySuspiciousScraper({
            row,
            url,
            initialScraped,
            timeoutMs: requestTimeoutMs,
          })
        : initialScraped;

    const hasScraped = scraped.ok && scraped.price > 0;
    const hasApi = apiPricing.ok && apiPricing.price > 0;
    if (!hasScraped && !hasApi) {
      fetchFailed += 1;
      continue;
    }

    if (hasScraped && !hasApi && scraped.unstableGeneric) {
      fetchScraperRejected += 1;
      fetchScraperRejectedUnstableGeneric += 1;
      fetchFailed += 1;
      continue;
    }

    const scraperSuspiciousNoApi =
      hasScraped &&
      !hasApi &&
      isScraperSuspiciousWithoutApi(row, scraped.price, scraped.originalPrice);
    if (scraperSuspiciousNoApi) {
      fetchScraperRejected += 1;
      fetchScraperRejectedNoApiGuard += 1;
      fetchFailed += 1;
      continue;
    }

    const scraperAggressiveNoApiDrop =
      hasScraped &&
      !hasApi &&
      isAggressiveNoApiScraperDrop(row, scraped.price);
    if (scraperAggressiveNoApiDrop) {
      fetchScraperRejected += 1;
      fetchScraperRejectedNoApiGuard += 1;
      fetchScraperRejectedAggressiveDrop += 1;
      fetchFailed += 1;
      continue;
    }

    const trustedNoApiStickyMismatch =
      hasScraped &&
      !hasApi &&
      isTrustedNoApiStickyMismatch(row, scraped.price);
    if (trustedNoApiStickyMismatch) {
      fetchScraperRejected += 1;
      fetchScraperRejectedNoApiGuard += 1;
      fetchScraperRejectedTrustedSticky += 1;
      fetchFailed += 1;
      continue;
    }

    const useApiFallback = hasApi && (!hasScraped || isScraperSuspiciousVsApi(scraped.price, apiPricing.price));
    if (useApiFallback && hasScraped) {
      fetchScraperRejected += 1;
    }

    const chosenPrice = useApiFallback ? apiPricing.price : scraped.price;
    const chosenSource = useApiFallback ? "api_base" : "scraper";
    const chosenOriginal = useApiFallback ? apiPricing.originalPrice : scraped.originalPrice;

    const updates = {
      price: chosenPrice,
      last_price_source: chosenSource,
      last_price_verified_at: nowIso,
      updated_at: nowIso,
      last_health_check_at: nowIso,
    };

    if (chosenOriginal && chosenOriginal > chosenPrice) {
      updates.original_price = chosenOriginal;
      updates.previous_price = chosenOriginal;
    } else if (useApiFallback && row.original_price && row.original_price > chosenPrice) {
      updates.original_price = row.original_price;
      if (row.previous_price && row.previous_price > chosenPrice) {
        updates.previous_price = row.previous_price;
      }
    }

    await client.patch(`/products?id=eq.${encodeURIComponent(row.id)}`, updates);
    fetchUpdated += 1;
    if (useApiFallback) fetchApiFallback += 1;
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
    if (!RECOVERABLE_STANDBY_STATUSES.has(status) || row.is_active) continue;

    const hasSec = isMercadoLivreSecLink(String(row.affiliate_link || ""));
    const hasMlItem = Boolean(normalizeMlItem(row.ml_item_id || row.external_id));
    const source = String(row.last_price_source || "").toLowerCase();
    const mlItem = normalizeMlItem(row.ml_item_id || row.external_id);
    const verifiedAt = row.last_price_verified_at ? new Date(row.last_price_verified_at).getTime() : null;
    const recentEnough = Number.isFinite(verifiedAt) ? nowMs - verifiedAt <= recentWindowMs : false;
    const mismatchOpen = String(row.price_mismatch_status || "NONE").toUpperCase() === "OPEN" || openSet.has(row.id);

    if (!hasSec || !hasMlItem || mismatchOpen || !recentEnough || !ALLOWED_PRICE_SOURCES.has(source)) {
      continue;
    }
    if (mlItem && blockedMlItems.has(mlItem)) {
      continue;
    }

    if (source === "scraper" && !hasReliableScraperAnchorForRecovery(row)) {
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
      fetch_api_fallback: fetchApiFallback,
      fetch_scraper_rejected_by_api_guard: fetchScraperRejected,
      fetch_scraper_rejected_by_no_api_guard: fetchScraperRejectedNoApiGuard,
      fetch_scraper_rejected_by_aggressive_drop_guard: fetchScraperRejectedAggressiveDrop,
      fetch_scraper_rejected_by_trusted_sticky_guard: fetchScraperRejectedTrustedSticky,
      fetch_scraper_rejected_unstable_generic: fetchScraperRejectedUnstableGeneric,
      blocked_ml_items_demoted: blockedMlItemsDemoted,
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
