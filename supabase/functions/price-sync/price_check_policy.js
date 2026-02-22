export const PRICE_PRIORITY = {
  HIGH: "HIGH",
  MED: "MED",
  LOW: "LOW",
};

export const PRICE_SOURCE = {
  API_PIX: "API_PIX",
  SCRAPER: "SCRAPER",
  API_BASE: "API_BASE",
};

const MAX_SCRAPER_TO_API_RATIO = 1.35;
const MIN_SCRAPER_TO_API_RATIO = 0.75;

const normalizeNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

export const priorityRank = (value) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === PRICE_PRIORITY.HIGH) return 0;
  if (normalized === PRICE_PRIORITY.MED) return 1;
  return 2;
};

export const resolvePriorityAndTtl = ({
  now = new Date(),
  createdAt,
  isFeatured,
  clicksCount,
  isOnSale,
  discountPercentage,
  productName,
  catalogPriority,
  ttlByPriority,
}) => {
  const ttlConfig = {
    [PRICE_PRIORITY.HIGH]: ttlByPriority?.HIGH ?? 60,
    [PRICE_PRIORITY.MED]: ttlByPriority?.MED ?? 360,
    [PRICE_PRIORITY.LOW]: ttlByPriority?.LOW ?? 1440,
  };
  const highVolatilityTtlMinutes = Math.max(
    15,
    Math.floor(
      Number(
        ttlByPriority?.HIGH_VOLATILITY ??
          ttlByPriority?.HIGH_VOLATILITY_MINUTES ??
          45,
      ),
    ),
  );

  const createdMs = createdAt ? new Date(createdAt).getTime() : Number.NaN;
  const ageMs = Number.isFinite(createdMs) ? now.getTime() - createdMs : Number.POSITIVE_INFINITY;
  const isNew = ageMs <= 24 * 60 * 60 * 1000;
  const normalizedName = String(productName ?? "").toLowerCase();
  const normalizedCatalogPriority = String(catalogPriority ?? "").trim().toUpperCase();
  const explicitCatalogPriority = [PRICE_PRIORITY.HIGH, PRICE_PRIORITY.MED, PRICE_PRIORITY.LOW].includes(
    normalizedCatalogPriority,
  )
    ? normalizedCatalogPriority
    : null;
  const isSupplement =
    normalizedName.includes("whey") ||
    normalizedName.includes("creatina") ||
    normalizedName.includes("pre treino") ||
    normalizedName.includes("suplement");
  const isHighVolatility =
    normalizedName.includes("smartwatch") ||
    normalizedName.includes("watch") ||
    normalizedName.includes("redmi") ||
    normalizedName.includes("xiaomi") ||
    normalizedName.includes("samsung galaxy") ||
    normalizedName.includes("iphone") ||
    normalizedName.includes("notebook");
  const hasPromotion =
    Boolean(isOnSale) ||
    (Number.isFinite(Number(discountPercentage)) && Number(discountPercentage) > 0);
  const highByClicks = Number.isFinite(Number(clicksCount)) && Number(clicksCount) >= 80;
  const veryHighByClicks = Number.isFinite(Number(clicksCount)) && Number(clicksCount) >= 120;

  let priority = PRICE_PRIORITY.MED;
  if (isNew || Boolean(isFeatured) || highByClicks || veryHighByClicks || isSupplement || hasPromotion || isHighVolatility) {
    priority = PRICE_PRIORITY.HIGH;
  } else if (explicitCatalogPriority) {
    priority = explicitCatalogPriority;
  }

  let ttlMinutes = ttlConfig[priority] ?? ttlConfig[PRICE_PRIORITY.MED];
  if (priority === PRICE_PRIORITY.HIGH && isHighVolatility) {
    ttlMinutes = Math.min(ttlMinutes, highVolatilityTtlMinutes);
  }
  return { priority, ttlMinutes };
};

export const computeNextCheckAt = ({ now = new Date(), ttlMinutes }) => {
  const safeTtl = Math.max(1, Math.floor(Number(ttlMinutes) || 1));
  return new Date(now.getTime() + safeTtl * 60 * 1000).toISOString();
};

export const resolveFinalPriceFromSignals = ({
  apiPrice,
  apiPixPrice,
  scrapedPrice,
  requireScraperWhenNoPix = true,
}) => {
  const api = normalizeNumber(apiPrice);
  const pix = normalizeNumber(apiPixPrice);
  const scraped = normalizeNumber(scrapedPrice);

  const hasApi = typeof api === "number" && api > 0;
  const hasPix = typeof pix === "number" && pix > 0 && (!hasApi || pix < api);
  const hasScraped = typeof scraped === "number" && scraped > 0;
  const scraperLooksSuspiciousVsApi =
    hasApi &&
    hasScraped &&
    !hasPix &&
    (scraped > api * MAX_SCRAPER_TO_API_RATIO || scraped < api * MIN_SCRAPER_TO_API_RATIO);

  if (hasPix) {
    return { finalPrice: pix, source: PRICE_SOURCE.API_PIX };
  }
  if (hasApi) {
    return { finalPrice: api, source: PRICE_SOURCE.API_BASE };
  }
  if (hasScraped && !scraperLooksSuspiciousVsApi) {
    return { finalPrice: scraped, source: PRICE_SOURCE.SCRAPER };
  }
  if (!requireScraperWhenNoPix && hasScraped) {
    return { finalPrice: scraped, source: PRICE_SOURCE.SCRAPER };
  }
  return { finalPrice: null, source: null };
};

export const detectPriceOutlier = ({
  previousPrice,
  newPrice,
  percentThreshold = 0.3,
  absoluteThreshold = 60,
}) => {
  const prev = normalizeNumber(previousPrice);
  const next = normalizeNumber(newPrice);
  if (!(typeof prev === "number" && prev > 0 && typeof next === "number" && next > 0)) {
    return {
      isOutlier: false,
      absoluteDelta: 0,
      percentDelta: 0,
    };
  }

  const absoluteDelta = Math.abs(next - prev);
  const percentDelta = absoluteDelta / prev;
  const isOutlier = percentDelta > percentThreshold || absoluteDelta > absoluteThreshold;
  return {
    isOutlier,
    absoluteDelta,
    percentDelta,
  };
};

export const computeBackoffUntil = ({
  failCount,
  now = new Date(),
  baseMs = 60_000,
  maxMs = 3_600_000,
  jitterRatio = 0.2,
  randomFn = Math.random,
}) => {
  const failures = Math.max(1, Math.floor(Number(failCount) || 1));
  const expBackoff = Math.min(maxMs, baseMs * Math.pow(2, failures - 1));
  const jitter = expBackoff * Math.max(0, Math.min(0.8, jitterRatio)) * randomFn();
  return new Date(now.getTime() + expBackoff + jitter).toISOString();
};

export const computeDomainThrottleDelayMs = ({
  now = new Date(),
  lastRequestAt,
  minIntervalSeconds = 10,
  maxIntervalSeconds = 20,
  randomFn = Math.random,
}) => {
  const minMs = Math.max(1, Math.floor(Number(minIntervalSeconds) * 1000));
  const maxMs = Math.max(minMs, Math.floor(Number(maxIntervalSeconds) * 1000));
  const targetGap = minMs + Math.floor((maxMs - minMs) * randomFn());
  if (!lastRequestAt) return 0;
  const last = new Date(lastRequestAt).getTime();
  const current = now.getTime();
  if (!Number.isFinite(last) || !Number.isFinite(current)) return 0;
  const elapsed = current - last;
  if (elapsed >= targetGap) return 0;
  return targetGap - elapsed;
};

export const updateDomainCircuitState = ({
  state,
  statusCode,
  now = new Date(),
  errorThreshold = 5,
  openSeconds = 900,
}) => {
  const next = {
    consecutiveErrors: Number(state?.consecutiveErrors) || 0,
    circuitOpenUntil: state?.circuitOpenUntil ?? null,
    lastStatusCode: statusCode ?? null,
    lastRequestAt: now.toISOString(),
  };

  const isError = statusCode === 429 || statusCode === 403 || statusCode === 0;
  if (isError) {
    next.consecutiveErrors += 1;
    if (next.consecutiveErrors >= Math.max(1, errorThreshold)) {
      next.circuitOpenUntil = new Date(
        now.getTime() + Math.max(30, openSeconds) * 1000,
      ).toISOString();
    }
    return next;
  }

  next.consecutiveErrors = 0;
  next.circuitOpenUntil = null;
  return next;
};

export const isCircuitOpen = (state, now = new Date()) => {
  const until = state?.circuitOpenUntil;
  if (!until) return false;
  const untilMs = new Date(until).getTime();
  return Number.isFinite(untilMs) && untilMs > now.getTime();
};

export const isRateLimitedStatus = (statusCode) => statusCode === 429 || statusCode === 403;
