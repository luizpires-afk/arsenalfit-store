const normalizeText = (value = "") =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeMlExternalId = (value) => {
  if (!value) return null;
  const match = String(value).match(/MLB[-_ ]?\d{6,14}/i);
  if (!match) return null;
  return match[0].toUpperCase().replace(/[-_ ]/g, "");
};

export const normalizeMlPermalink = (value) => {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    const host = url.host.toLowerCase();
    const isMercadoLivre =
      host.includes("mercadolivre.com") ||
      host.includes("mercadolibre.com") ||
      host.includes("mercadolivre.com.br");
    if (!isMercadoLivre) return null;
    const pathname = url.pathname.replace(/\/+$/, "");
    if (!pathname || pathname === "/") return null;
    return `${url.origin}${pathname}`;
  } catch {
    return null;
  }
};

const volumePattern =
  /\b(\d+(?:[.,]\d+)?\s?(?:kg|g|gr|gramas?|ml|l|litros?|caps|capsulas?|unid(?:ades)?|un))\b/i;

const extractVolumeToken = (value) => {
  const text = String(value ?? "");
  const match = text.match(volumePattern);
  return match ? normalizeText(match[1]) : null;
};

const normalizeBrand = (product) => {
  const direct =
    product?.brand ??
    product?.specifications?.brand ??
    product?.specifications?.marca ??
    null;
  const normalized = normalizeText(direct ?? "");
  return normalized || null;
};

export const resolveProductIdentifiers = (product) => {
  const externalId =
    normalizeMlExternalId(product?.external_id) ??
    normalizeMlExternalId(product?.source_url) ??
    normalizeMlExternalId(product?.affiliate_link) ??
    null;

  const permalink =
    normalizeMlPermalink(product?.source_url) ??
    normalizeMlPermalink(product?.affiliate_link) ??
    null;

  return { externalId, permalink };
};

const buildFallbackFingerprint = (product) => {
  const name = normalizeText(product?.name ?? "");
  const brand = normalizeBrand(product) ?? "";
  const volume = extractVolumeToken(product?.name ?? "");
  if (!name) return null;
  return `${name}|${brand}|${volume ?? ""}`;
};

export const resolveDuplicateKey = (product) => {
  const ids = resolveProductIdentifiers(product);
  if (ids.externalId) return `external:${ids.externalId}`;
  if (ids.permalink) return `permalink:${ids.permalink}`;
  const fingerprint = buildFallbackFingerprint(product);
  return fingerprint ? `fingerprint:${fingerprint}` : null;
};

const toTs = (value) => {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

export const scoreCanonicalCandidate = (product, monitorCount = 0) => {
  const hasImage = Boolean(product?.image_url) || (Array.isArray(product?.images) && product.images.length > 0);
  const descriptionLen = String(product?.description ?? "").trim().length;
  const hasDescription = descriptionLen >= 80;
  const hasSync = Boolean(product?.last_sync) || Boolean(product?.last_price_verified_at);
  const hasValidation =
    product?.affiliate_verified === true ||
    Boolean(product?.validated_at) ||
    (typeof product?.affiliate_link === "string" &&
      product.affiliate_link.toLowerCase().includes("mercadolivre.com/sec/"));
  const isManualCurated = Boolean(product?.is_featured) || Boolean(product?.description_manual_override);

  let score = 0;
  if (product?.is_active === true) score += 280;
  if (String(product?.status ?? "").toLowerCase() === "active") score += 120;
  if (hasValidation) score += 160;
  if (hasSync) score += 90;
  if (hasImage) score += 40;
  if (hasDescription) score += 30;
  if (isManualCurated) score += 40;
  score += Math.min(120, Math.max(0, Number(monitorCount) || 0) * 10);
  score += Math.min(80, Math.max(0, Number(product?.clicks_count) || 0) / 5);

  // Prefer older canonical row to preserve historical relations.
  const createdAtTs = toTs(product?.created_at);
  if (createdAtTs > 0) {
    score += Math.max(0, Math.min(40, Math.floor((Date.now() - createdAtTs) / (1000 * 60 * 60 * 24 * 30))));
  }
  return score;
};

export const pickCanonicalProduct = (products, monitorCountMap = new Map()) => {
  const list = Array.isArray(products) ? products : [];
  if (!list.length) return null;
  return [...list].sort((a, b) => {
    const scoreA = scoreCanonicalCandidate(a, monitorCountMap.get(a.id) ?? 0);
    const scoreB = scoreCanonicalCandidate(b, monitorCountMap.get(b.id) ?? 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    const createdA = toTs(a?.created_at);
    const createdB = toTs(b?.created_at);
    if (createdA !== createdB) return createdA - createdB;
    return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
  })[0];
};

export const classifyPriceHealth = (product) => {
  const price = Number(product?.price);
  const pix = Number(product?.pix_price);

  if (!Number.isFinite(price) || price <= 0) {
    return { status: "SUSPECT_PRICE", reason: "invalid_or_missing_price" };
  }
  if (Number.isFinite(pix) && pix > 0) {
    if (pix >= price) {
      return { status: "SUSPECT_PRICE", reason: "pix_not_below_final" };
    }
    if (pix <= price * 0.15) {
      return { status: "SUSPECT_PRICE", reason: "pix_extreme_gap" };
    }
  }
  return { status: "HEALTHY", reason: null };
};

export const classifyHealthStatus = ({
  product,
  identifiers,
  isDuplicate,
  priceCheckState,
  latestAnomalyNote,
  maxFailuresBeforeApiMissing = 3,
}) => {
  if (!identifiers?.externalId && !identifiers?.permalink) {
    return { status: "INVALID_SOURCE", reason: "missing_ml_identifier" };
  }

  if (isDuplicate) {
    return { status: "DUPLICATE", reason: "duplicate_non_canonical" };
  }

  const stateFailCount = Math.max(0, Number(priceCheckState?.fail_count ?? 0) || 0);
  const stateError = String(priceCheckState?.last_error_code ?? "").toLowerCase();
  const anomaly = String(latestAnomalyNote ?? "").toLowerCase();

  const apiMissingSignals = new Set([
    "http_404",
    "policy_blocked",
    "catalog_lookup_failed",
    "preferred_item_missing_in_catalog",
    "product_not_found_for_job",
  ]);

  if (stateFailCount >= maxFailuresBeforeApiMissing) {
    if (apiMissingSignals.has(stateError) || apiMissingSignals.has(anomaly)) {
      return { status: "API_MISSING", reason: stateError || anomaly || "api_missing" };
    }
    if (stateError.includes("scraper") || anomaly.includes("scraper")) {
      return { status: "SCRAPE_FAILED", reason: stateError || anomaly || "scrape_failed" };
    }
  }

  if (
    stateError === "suspect_outlier" ||
    (typeof priceCheckState?.suspect_price === "number" && Number.isFinite(priceCheckState.suspect_price))
  ) {
    return { status: "SUSPECT_PRICE", reason: "suspect_outlier" };
  }

  const priceHealth = classifyPriceHealth(product);
  if (priceHealth.status !== "HEALTHY") return priceHealth;

  return { status: "HEALTHY", reason: null };
};

export const shouldReactivateProduct = ({ product, healthStatus, isDuplicate }) => {
  if (!product || isDuplicate) return false;
  if (product.is_active === true) return false;
  if (String(product.status ?? "").toLowerCase() === "paused") return false;
  if (!["HEALTHY", "SUSPECT_PRICE"].includes(String(healthStatus ?? ""))) return false;

  const ids = resolveProductIdentifiers(product);
  if (!ids.externalId && !ids.permalink) return false;

  const hasAffiliateValidation =
    product.affiliate_verified === true ||
    Boolean(product.validated_at) ||
    (typeof product.affiliate_link === "string" &&
      product.affiliate_link.toLowerCase().includes("mercadolivre.com/sec/"));

  if (hasAffiliateValidation) return true;

  const wasBlocked = String(product.auto_disabled_reason ?? "").toLowerCase() === "blocked";
  const hasRecentSync = Boolean(product.last_sync) || Boolean(product.last_price_verified_at);
  if (wasBlocked && hasRecentSync) return true;

  // Older manually curated products can be recovered if they have valid source + price.
  const hasManualSignals = Boolean(product.description_manual_override) || Boolean(product.is_featured);
  const hasValidPrice = Number.isFinite(Number(product.price)) && Number(product.price) > 0;
  return hasManualSignals && hasValidPrice;
};
