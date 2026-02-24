const MIN_PIX_DIFF_ABS = 0.5;
const MIN_PIX_DIFF_RATIO = 0.005;
const MAX_LIST_PRICE_RATIO_STANDARD = 1.8;
const MAX_LIST_PRICE_RATIO_WITH_PIX = 4.0;
const MAX_LIST_PRICE_RATIO_WITH_PROMO_FLAG = 4.0;
const MIN_SCRAPER_BASE_PRICE_RATIO_VS_ANCHOR = 0.35;
const MIN_SCRAPER_BASE_PRICE_RATIO_VS_ANCHOR_MERCADO = 0.55;
const DEFAULT_PREVIOUS_PRICE_TTL_HOURS = 48;
const MIN_HISTORY_PROMO_PERCENT = 5;
const TRUSTED_LIST_PRICE_SOURCES = new Set([
  "auth",
  "public",
  "manual",
  "api",
  "api_base",
  "api_pix",
  "catalog",
  "catalog_ingest",
]);
const MAX_LIST_PRICE_STALE_HOURS_DEFAULT = 24;
const MAX_LIST_PRICE_STALE_HOURS_SCRAPER = 12;

const toFiniteNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeWithSingleSeparator = (input, separator) => {
  const parts = input.split(separator);
  if (parts.length <= 1) return input;
  const decimal = parts[parts.length - 1] ?? "";
  const integer = parts.slice(0, -1).join("");
  if (decimal.length > 0 && decimal.length <= 2) {
    return `${integer}.${decimal}`;
  }
  return parts.join("");
};

export const parseBRLCurrency = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  let raw = value.replace(/[^0-9,\.\s]/g, "").trim();
  if (!raw) return null;

  if (!/[,.]/.test(raw) && /^\d+(?:\s\d{3})*\s\d{2}$/.test(raw)) {
    raw = raw.replace(/\s(\d{2})$/, ",$1");
  }

  let cleaned = raw.replace(/\s+/g, "");
  if (!cleaned) return null;

  const commaCount = (cleaned.match(/,/g) ?? []).length;
  const dotCount = (cleaned.match(/\./g) ?? []).length;

  if (commaCount > 0 && dotCount > 0) {
    const decimalSeparator = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".") ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    cleaned = cleaned.replace(new RegExp(`\\${thousandsSeparator}`, "g"), "");
    if (decimalSeparator === ",") {
      cleaned = cleaned.replace(",", ".");
    }
  } else if (commaCount > 0) {
    cleaned = normalizeWithSingleSeparator(cleaned, ",");
  } else if (dotCount > 0) {
    cleaned = normalizeWithSingleSeparator(cleaned, ".");
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

export const hasMeaningfulPixDiscount = (price, pix) => {
  if (!(Number.isFinite(price) && Number.isFinite(pix))) return false;
  if (!(price > 0 && pix > 0 && pix < price)) return false;
  const diff = price - pix;
  const ratio = diff / price;
  return diff >= MIN_PIX_DIFF_ABS || ratio >= MIN_PIX_DIFF_RATIO;
};

const isTrustedPixSource = (source) => {
  if (!source) return true;
  const normalized = String(source).trim().toLowerCase();
  return normalized === "api" || normalized === "manual";
};

const isTrustedListPriceSource = (source) => {
  if (!source) return true;
  const normalized = String(source).trim().toLowerCase();
  return TRUSTED_LIST_PRICE_SOURCES.has(normalized);
};

const resolveListPriceMaxAgeHours = (source) => {
  const normalized = String(source ?? "").trim().toLowerCase();
  if (normalized === "scraper") return MAX_LIST_PRICE_STALE_HOURS_SCRAPER;
  return MAX_LIST_PRICE_STALE_HOURS_DEFAULT;
};

const isMercadoLivreMarketplace = (marketplace) => {
  const normalized = String(marketplace ?? "").trim().toLowerCase();
  return normalized.includes("mercado");
};

const resolveScraperBasePriceMinRatio = (product) =>
  isMercadoLivreMarketplace(product?.marketplace)
    ? MIN_SCRAPER_BASE_PRICE_RATIO_VS_ANCHOR_MERCADO
    : MIN_SCRAPER_BASE_PRICE_RATIO_VS_ANCHOR;

const resolveListPriceMaxRatio = (product, hasPixPrice) => {
  if (hasPixPrice) return MAX_LIST_PRICE_RATIO_WITH_PIX;
  const promoFlag = toFiniteNumber(product?.discount_percentage);
  if (promoFlag !== null && promoFlag >= 5 && promoFlag <= 95) {
    return MAX_LIST_PRICE_RATIO_WITH_PROMO_FLAG;
  }
  return MAX_LIST_PRICE_RATIO_STANDARD;
};

const canUseScraperPromoFallback = (product, source, originalPrice, finalPrice) => {
  const normalized = String(source ?? "").trim().toLowerCase();
  if (normalized !== "scraper") return false;
  if (isMercadoLivreMarketplace(product?.marketplace)) return false;
  if (product?.is_on_sale !== true) return false;

  const promoFlag = toFiniteNumber(product?.discount_percentage);
  if (!(promoFlag !== null && promoFlag >= 5 && promoFlag <= 95)) return false;
  if (!(Number.isFinite(originalPrice) && Number.isFinite(finalPrice))) return false;
  if (!(originalPrice > finalPrice && finalPrice > 0)) return false;

  const maxRatio = MAX_LIST_PRICE_RATIO_WITH_PROMO_FLAG;
  return originalPrice <= finalPrice * maxRatio;
};

const isListPriceFresh = (product, source) => {
  const reference =
    product?.last_price_verified_at ??
    product?.last_sync ??
    product?.updated_at ??
    null;
  if (!reference) return true;
  const checkedAt = new Date(reference).getTime();
  if (!Number.isFinite(checkedAt)) return true;
  const ageMs = Date.now() - checkedAt;
  return ageMs <= resolveListPriceMaxAgeHours(source) * 60 * 60 * 1000;
};

const parseDateMs = (value) => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const sanitizeBasePrice = (product, basePrice, originalPrice) => {
  if (!(basePrice !== null && basePrice > 0)) return basePrice;

  const source = String(product?.last_price_source ?? "").trim().toLowerCase();
  if (source !== "scraper") return basePrice;

  const anchors = [];
  if (Number.isFinite(originalPrice) && originalPrice > 0) anchors.push(originalPrice);

  const previous = toFiniteNumber(product?.previous_price);
  if (Number.isFinite(previous) && previous > 0) anchors.push(previous);

  if (anchors.length === 0) return basePrice;

  const anchor = Math.max(...anchors);
  if (!(anchor > 0)) return basePrice;

  const ratio = basePrice / anchor;
  if (ratio >= resolveScraperBasePriceMinRatio(product)) return basePrice;

  return anchor;
};

const resolveHistoryPreviousPrice = (product, finalPrice) => {
  const previous = toFiniteNumber(product?.previous_price);
  if (!(previous !== null && previous > finalPrice)) return null;

  const previousSource = String(product?.previous_price_source ?? "").trim().toLowerCase();
  if (previousSource !== "history") return null;

  const discountPercent = ((previous - finalPrice) / previous) * 100;
  if (!(Number.isFinite(discountPercent) && discountPercent >= MIN_HISTORY_PROMO_PERCENT)) {
    return null;
  }

  const nowMs = Date.now();
  const explicitExpiryMs = parseDateMs(product?.previous_price_expires_at);
  if (explicitExpiryMs !== null) {
    return explicitExpiryMs > nowMs ? previous : null;
  }

  const referenceMs =
    parseDateMs(product?.detected_at) ??
    parseDateMs(product?.last_price_verified_at) ??
    parseDateMs(product?.last_sync) ??
    parseDateMs(product?.updated_at);
  if (referenceMs === null) return previous;

  return nowMs - referenceMs <= DEFAULT_PREVIOUS_PRICE_TTL_HOURS * 60 * 60 * 1000
    ? previous
    : null;
};

export const resolveFinalPriceInfo = (product) => {
  const rawBasePrice = toFiniteNumber(product?.price);
  const originalPrice = toFiniteNumber(product?.original_price);
  const basePrice = sanitizeBasePrice(product, rawBasePrice, originalPrice);
  const pixRaw = toFiniteNumber(product?.pix_price);
  const pixSource = product?.pix_price_source ?? null;
  const lastPriceSource = product?.last_price_source ?? null;

  const pixPrice =
    basePrice !== null &&
    pixRaw !== null &&
    isTrustedPixSource(pixSource) &&
    hasMeaningfulPixDiscount(basePrice, pixRaw)
      ? pixRaw
      : null;

  const finalPrice = pixPrice ?? basePrice ?? 0;
  const listPriceMaxRatio = resolveListPriceMaxRatio(product, pixPrice !== null);
  const allowScraperPromoFallback = canUseScraperPromoFallback(
    product,
    lastPriceSource,
    originalPrice,
    finalPrice,
  );
  const canShowListPrice =
    (isTrustedListPriceSource(lastPriceSource) || allowScraperPromoFallback) &&
    isListPriceFresh(product, lastPriceSource);
  const listPrice =
    canShowListPrice &&
    originalPrice !== null &&
    originalPrice > finalPrice &&
    originalPrice <= finalPrice * listPriceMaxRatio
      ? originalPrice
      : null;

  const savings = listPrice !== null && listPrice > finalPrice ? listPrice - finalPrice : null;
  const discountPercent =
    savings !== null && listPrice !== null && listPrice > 0
      ? Math.round((savings / listPrice) * 100)
      : null;

  return {
    basePrice,
    originalPrice,
    pixPrice,
    finalPrice,
    listPrice,
    savings,
    discountPercent,
    usedPix: pixPrice !== null,
    finalPriceSource: pixPrice !== null ? "pix" : "standard",
  };
};

export const resolvePricePresentation = (product) => {
  const pricing = resolveFinalPriceInfo(product);
  const currentPrice = pricing.basePrice;
  const pixPrice = pricing.pixPrice;
  const listFromSource =
    pricing.listPrice !== null && pricing.listPrice > pricing.finalPrice ? pricing.listPrice : null;
  const listFromHistory = resolveHistoryPreviousPrice(product, pricing.finalPrice);
  const strikethroughPrice = listFromSource ?? listFromHistory;

  const hasPixSecondary =
    pixPrice !== null &&
    currentPrice !== null &&
    currentPrice > pixPrice;

  const displayPricePrimary = hasPixSecondary ? pixPrice : pricing.finalPrice;
  const displayPriceSecondary = hasPixSecondary ? currentPrice : null;
  const displayStrikethrough =
    strikethroughPrice !== null && strikethroughPrice > displayPricePrimary
      ? strikethroughPrice
      : null;

  const savings =
    displayStrikethrough !== null && displayStrikethrough > displayPricePrimary
      ? displayStrikethrough - displayPricePrimary
      : null;
  const discountPercent =
    savings !== null && displayStrikethrough !== null && displayStrikethrough > 0
      ? Math.round((savings / displayStrikethrough) * 100)
      : null;

  return {
    finalPrice: pricing.finalPrice,
    currentPrice,
    pixPrice,
    displayPricePrimary,
    displayPriceSecondary,
    displayStrikethrough,
    savings,
    discountPercent,
    showPixBadge: Boolean(pixPrice !== null),
    finalPriceSource: pricing.finalPriceSource,
  };
};
