// @ts-ignore - Remote module resolution is handled by Deno at runtime.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  PRICE_SOURCE,
  resolvePriorityAndTtl,
  computeNextCheckAt,
  resolveFinalPriceFromSignals,
  detectPriceOutlier,
  computeBackoffUntil,
  computeDomainThrottleDelayMs,
  updateDomainCircuitState,
  isCircuitOpen,
} from "./price_check_policy.js";

const Deno = (globalThis as unknown as {
  Deno: {
    env: { get: (key: string) => string | undefined };
    serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  };
}).Deno;

const HOURS_6_MS = 6 * 60 * 60 * 1000;
const HOURS_12_MS = 12 * 60 * 60 * 1000;
const HOURS_2_MS = 2 * 60 * 60 * 1000;
const HOURS_24_MS = 24 * 60 * 60 * 1000;
const SCHEDULE_GRACE_MS = 5 * 60 * 1000;

const API_BASE = "https://api.mercadolibre.com";
const ITEMS_BASE = `${API_BASE}/items/`;
const OAUTH_URL = `${API_BASE}/oauth/token`;

const DEFAULT_TIMEOUT_MS = 8000;
const AUTH_TIMEOUT_MS = 5000;
const DEFAULT_BATCH_SIZE = Number(Deno?.env?.get?.("PRICE_SYNC_BATCH_SIZE") ?? "40");
const MAX_BATCH_SIZE = Number(Deno?.env?.get?.("PRICE_SYNC_BATCH_SIZE_MAX") ?? "200");
const DEFAULT_MAX_RUNTIME_MS = Number(Deno?.env?.get?.("PRICE_SYNC_MAX_RUNTIME_MS") ?? "85000");
const DEFAULT_MAX_CONTINUATIONS = Number(Deno?.env?.get?.("PRICE_SYNC_MAX_CONTINUATIONS") ?? "3");
const HARD_MAX_CONTINUATIONS = Number(
  Deno?.env?.get?.("PRICE_SYNC_HARD_MAX_CONTINUATIONS") ?? "8",
);
const PRICE_SYNC_QUEUE_ENABLED =
  (Deno?.env?.get?.("PRICE_SYNC_QUEUE_ENABLED") ?? "true").toLowerCase() !== "false";
const SYNC_LOCK_KEY = Deno?.env?.get?.("PRICE_SYNC_LOCK_KEY") ?? "price_sync_edge";
const DEFAULT_LOCK_TTL_SECONDS = Number(
  Deno?.env?.get?.("PRICE_SYNC_LOCK_TTL_SECONDS") ?? "900",
);
const PRICE_SYNC_RATE_MIN_INTERVAL_SECONDS = Number(
  Deno?.env?.get?.("PRICE_SYNC_RATE_MIN_INTERVAL_SECONDS") ?? "8",
);
const PRICE_SYNC_RATE_MAX_INTERVAL_SECONDS = Number(
  Deno?.env?.get?.("PRICE_SYNC_RATE_MAX_INTERVAL_SECONDS") ?? "12",
);
const PRICE_SYNC_DOMAIN = Deno?.env?.get?.("PRICE_SYNC_DOMAIN") ?? "mercadolivre.com.br";
const PRICE_SYNC_CIRCUIT_ERROR_THRESHOLD = Number(
  Deno?.env?.get?.("PRICE_SYNC_CIRCUIT_ERROR_THRESHOLD") ?? "5",
);
const PRICE_SYNC_CIRCUIT_OPEN_SECONDS = Number(
  Deno?.env?.get?.("PRICE_SYNC_CIRCUIT_OPEN_SECONDS") ?? "900",
);
const PRICE_SYNC_OUTLIER_PERCENT_THRESHOLD = Number(
  Deno?.env?.get?.("PRICE_SYNC_OUTLIER_PERCENT_THRESHOLD") ?? "0.3",
);
const PRICE_SYNC_OUTLIER_ABS_THRESHOLD = Number(
  Deno?.env?.get?.("PRICE_SYNC_OUTLIER_ABS_THRESHOLD") ?? "60",
);
const PRICE_SYNC_OUTLIER_RECHECK_MINUTES = Number(
  Deno?.env?.get?.("PRICE_SYNC_OUTLIER_RECHECK_MINUTES") ?? "10",
);
const PRICE_SYNC_UNTRUSTED_DROP_PERCENT_THRESHOLD = Number(
  Deno?.env?.get?.("PRICE_SYNC_UNTRUSTED_DROP_PERCENT_THRESHOLD") ?? "0.25",
);
const PRICE_SYNC_UNTRUSTED_DROP_ABS_THRESHOLD = Number(
  Deno?.env?.get?.("PRICE_SYNC_UNTRUSTED_DROP_ABS_THRESHOLD") ?? "40",
);
const PRICE_SYNC_FREEZE_HOURS_DEFAULT = Number(
  Deno?.env?.get?.("PRICE_SYNC_FREEZE_HOURS") ?? "4",
);
const PRICE_SYNC_FREEZE_RECHECK_MINUTES_DEFAULT = Number(
  Deno?.env?.get?.("PRICE_SYNC_FREEZE_RECHECK_MINUTES") ?? "10",
);
const PREVIOUS_PRICE_HISTORY_TTL_HOURS = Number(
  Deno?.env?.get?.("PRICE_SYNC_PREVIOUS_PRICE_TTL_HOURS") ?? "48",
);
const PRICE_SYNC_TTL_HIGH_VOLATILITY_MINUTES = Number(
  Deno?.env?.get?.("PRICE_SYNC_TTL_HIGH_VOLATILITY_MINUTES") ?? "45",
);
const ENABLE_PIX_PRICE =
  (Deno?.env?.get?.("PIX_PRICE_ENABLED") ?? "true").toLowerCase() !== "false";
const SCRAPER_API_KEY = Deno?.env?.get?.("SCRAPER_API_KEY") ?? null;
const SCRAPER_API_URL = Deno?.env?.get?.("SCRAPER_API_URL") ?? "https://api.scraperapi.com";
const SCRAPER_API_URL_TEMPLATE = Deno?.env?.get?.("SCRAPER_API_URL_TEMPLATE") ?? null;
const SCRAPER_ENABLED =
  (Deno?.env?.get?.("SCRAPER_ENABLED") ?? (SCRAPER_API_KEY ? "true" : "false")).toLowerCase() ===
  "true";
const SCRAPER_TIMEOUT_MS = Number(Deno?.env?.get?.("SCRAPER_TIMEOUT_MS") ?? "8000");
const SCRAPER_DELAY_MS = Number(Deno?.env?.get?.("SCRAPER_DELAY_MS") ?? "900");
const ITEM_DELAY_MIN_MS = Number(Deno?.env?.get?.("PRICE_SYNC_ITEM_DELAY_MIN_MS") ?? "120");
const ITEM_DELAY_MAX_MS = Number(Deno?.env?.get?.("PRICE_SYNC_ITEM_DELAY_MAX_MS") ?? "220");
const MAX_SCRAPER_FALLBACKS_PER_RUN = Number(
  Deno?.env?.get?.("PRICE_SYNC_MAX_SCRAPER_FALLBACKS") ?? "8",
);
const PIX_MIN_RATIO_VS_STANDARD = Number(
  Deno?.env?.get?.("PIX_MIN_RATIO_VS_STANDARD") ?? "0.2",
);
const PIX_SCRAPER_MIN_RATIO_VS_STANDARD = Number(
  Deno?.env?.get?.("PIX_SCRAPER_MIN_RATIO_VS_STANDARD") ?? "0.75",
);
const PIX_TEXT_REFERENCE_GAP_MAX = Number(
  Deno?.env?.get?.("PIX_TEXT_REFERENCE_GAP_MAX") ?? "0.15",
);
const PIX_SCRAPER_MIN_DISCOUNT_ABS = Number(
  Deno?.env?.get?.("PIX_SCRAPER_MIN_DISCOUNT_ABS") ?? "0.5",
);
const PIX_SCRAPER_MIN_DISCOUNT_PERCENT = Number(
  Deno?.env?.get?.("PIX_SCRAPER_MIN_DISCOUNT_PERCENT") ?? "0.005",
);
const UNTRUSTED_PRICE_MIN_RATIO = Number(
  Deno?.env?.get?.("UNTRUSTED_PRICE_MIN_RATIO") ?? "0.55",
);
const UNTRUSTED_PRICE_MAX_RATIO = Number(
  Deno?.env?.get?.("UNTRUSTED_PRICE_MAX_RATIO") ?? "1.8",
);
const PRICE_SYNC_STRICT_OFFER_MATCH =
  (Deno?.env?.get?.("PRICE_SYNC_STRICT_OFFER_MATCH") ?? "true").toLowerCase() !== "false";
const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
};
const toNonNegativeInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};
const toBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
};

const addMs = (now: Date, ms: number) => new Date(now.getTime() + ms);
const parseDateMs = (value: unknown) => {
  if (!value) return null;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : null;
};

type MeliFetchResult = {
  response: Response | null;
  body: any;
  status: number;
  etag?: string | null;
};

type PriceChangeRow = {
  run_id: string;
  product_id: string;
  marketplace: string | null;
  external_id: string | null;
  old_price: number | null;
  new_price: number;
  discount_percentage: number | null;
  is_on_sale: boolean | null;
  source: "auth" | "public" | "catalog" | "scraper";
};

type PriceCheckJobRow = {
  job_id: number;
  product_id: string;
  domain: string;
  attempts: number;
  queued_at: string;
  available_at: string;
  meta?: Record<string, unknown> | null;
};

type DomainState = {
  domain: string;
  last_request_at: string | null;
  consecutive_errors: number;
  circuit_open_until: string | null;
  last_status_code: number | null;
};

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const maskEtag = async (etag?: string | null) => {
  if (!etag || typeof etag !== "string") return null;
  const data = new TextEncoder().encode(etag);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return { len: etag.length, hash: toHex(digest).slice(0, 8) };
};

const mapStatus = (data: Record<string, unknown>) => {
  const rawStatus = String((data as any)?.status || "").toLowerCase();
  const availableRaw = (data as any)?.available_quantity;
  const available = typeof availableRaw === "number" ? availableRaw : null;

  if (rawStatus === "paused") return "paused";
  if (rawStatus === "closed" || rawStatus === "inactive") return "out_of_stock";
  if (available !== null && available <= 0) return "out_of_stock";
  return "active";
};

const parseJsonSafe = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const normalizeExternalId = (value: unknown) => {
  if (!value) return null;
  const str = String(value);
  const match = str.match(/MLB\d{6,12}/i);
  if (!match) return null;
  return match[0].toUpperCase();
};

const extractCatalogIdFromUrl = (value?: string | null) => {
  if (!value) return null;
  const str = String(value);
  const match = str.match(/\/p\/(MLB\d{6,12})/i);
  if (!match) return null;
  return match[1].toUpperCase();
};

const extractItemIdFromUrl = (value?: string | null) => {
  if (!value) return null;
  const str = String(value);
  const patterns = [
    /wid(?:=|%3D)\s*(MLB\d{6,12})/i,
    /item_id(?:=|%3A|:)\s*(MLB\d{6,12})/i,
    /pdp_filters=[^&#]*item_id(?:%3A|:)\s*(MLB\d{6,12})/i,
  ];
  for (const pattern of patterns) {
    const match = str.match(pattern);
    if (match && match[1]) return match[1].toUpperCase();
  }
  return null;
};

const sanitizeOAuthPayload = (data: Record<string, unknown>) => ({
  error: (data as any)?.error ?? null,
  message: (data as any)?.message ?? null,
  error_description: (data as any)?.error_description ?? null,
  expires_in: (data as any)?.expires_in ?? null,
  has_access_token: Boolean((data as any)?.access_token),
  has_refresh_token: Boolean((data as any)?.refresh_token),
});

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const extractCatalogPriority = (specifications: unknown): "HIGH" | "MED" | "LOW" | null => {
  if (!specifications || typeof specifications !== "object" || Array.isArray(specifications)) return null;
  const root = specifications as Record<string, unknown>;
  const curation =
    root.catalog_curation && typeof root.catalog_curation === "object" && !Array.isArray(root.catalog_curation)
      ? (root.catalog_curation as Record<string, unknown>)
      : null;
  const raw = String(curation?.priority ?? root.priority ?? "").trim().toUpperCase();
  if (raw === "HIGH" || raw === "MED" || raw === "LOW") return raw;
  return null;
};

const parseMoney = (value: string): number | null => {
  if (!value) return null;

  let raw = value.replace(/[^0-9,\.\s]/g, "").trim();
  if (!raw) return null;

  // Handle formats like "83 75" or "1 299 00" where decimals are split by space.
  if (!/[,.]/.test(raw) && /^\d+(?:\s\d{3})*\s\d{2}$/.test(raw)) {
    raw = raw.replace(/\s(\d{2})$/, ",$1");
  }

  let cleaned = raw.replace(/\s+/g, "");
  if (!cleaned) return null;

  const commaCount = (cleaned.match(/,/g) ?? []).length;
  const dotCount = (cleaned.match(/\./g) ?? []).length;

  const normalizeSingleSeparator = (input: string, separator: "," | ".") => {
    const parts = input.split(separator);
    if (parts.length <= 1) return input;
    const decimal = parts[parts.length - 1] ?? "";
    const integer = parts.slice(0, -1).join("");
    if (decimal.length > 0 && decimal.length <= 2) {
      return `${integer}.${decimal}`;
    }
    return parts.join("");
  };

  if (commaCount > 0 && dotCount > 0) {
    const decimalSeparator = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".") ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    cleaned = cleaned.replace(new RegExp(`\\${thousandsSeparator}`, "g"), "");
    if (decimalSeparator === ",") {
      cleaned = cleaned.replace(",", ".");
    }
  } else if (commaCount > 0) {
    cleaned = normalizeSingleSeparator(cleaned, ",");
  } else if (dotCount > 0) {
    cleaned = normalizeSingleSeparator(cleaned, ".");
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const pickBestPixCandidate = (
  values: Array<number | null>,
  referencePrice?: number | null,
  options?: { minRatio?: number; requireMeaningfulDiscount?: boolean },
): number | null => {
  const filtered = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  if (!filtered.length) return null;

  if (
    typeof referencePrice === "number" &&
    Number.isFinite(referencePrice) &&
    referencePrice > 0
  ) {
    const minRatioRaw =
      typeof options?.minRatio === "number" && Number.isFinite(options.minRatio)
        ? options.minRatio
        : PIX_MIN_RATIO_VS_STANDARD;
    const minRatio = Math.min(0.95, Math.max(0, minRatioRaw));
    const minAllowed = referencePrice * minRatio;
    const comparable = filtered.filter((value) => {
      if (!(value < referencePrice && value >= minAllowed)) return false;
      if (!options?.requireMeaningfulDiscount) return true;
      return hasMeaningfulScraperPixDiscount(value, referencePrice);
    });
    if (!comparable.length) return null;
    return Math.max(...comparable);
  }

  return Math.min(...filtered);
};

const hasMeaningfulScraperPixDiscount = (
  pix: number,
  standard: number,
) => {
  if (!(Number.isFinite(pix) && Number.isFinite(standard))) return false;
  if (!(pix > 0 && standard > 0 && pix < standard)) return false;
  const absDiff = standard - pix;
  const pctDiff = absDiff / standard;
  const minAbs = Math.max(0, Number.isFinite(PIX_SCRAPER_MIN_DISCOUNT_ABS) ? PIX_SCRAPER_MIN_DISCOUNT_ABS : 0.5);
  const minPct = Math.max(
    0,
    Math.min(0.5, Number.isFinite(PIX_SCRAPER_MIN_DISCOUNT_PERCENT) ? PIX_SCRAPER_MIN_DISCOUNT_PERCENT : 0.005),
  );
  return absDiff >= minAbs || pctDiff >= minPct;
};

const shouldKeepStoredPixForPrice = (
  pix: number | null,
  source: string | null | undefined,
  standard: number,
) => {
  if (!(typeof standard === "number" && Number.isFinite(standard) && standard > 0)) return false;
  if (!(typeof pix === "number" && Number.isFinite(pix) && pix > 0 && pix < standard)) return false;
  return source === "manual" || source === "api";
};

const isTrustedPriceSource = (source: string | null | undefined) =>
  source === "auth" || source === "public";

const stabilizeIncomingPriceForSource = (
  incomingPrice: number,
  currentPrice: number | null,
  source: string | null | undefined,
) => {
  if (!Number.isFinite(incomingPrice) || incomingPrice <= 0) return incomingPrice;
  if (!(typeof currentPrice === "number" && Number.isFinite(currentPrice) && currentPrice > 0)) {
    return incomingPrice;
  }
  if (isTrustedPriceSource(source)) return incomingPrice;

  const minRatio = clamp(
    Number.isFinite(UNTRUSTED_PRICE_MIN_RATIO) ? UNTRUSTED_PRICE_MIN_RATIO : 0.55,
    0.1,
    1,
  );
  const maxRatio = clamp(
    Number.isFinite(UNTRUSTED_PRICE_MAX_RATIO) ? UNTRUSTED_PRICE_MAX_RATIO : 1.8,
    1,
    5,
  );
  const ratio = incomingPrice / currentPrice;
  if (ratio < minRatio || ratio > maxRatio) return currentPrice;
  return incomingPrice;
};

const resolveOriginalPrice = (params: {
  incomingOriginal: number | null | undefined;
  storedOriginal: number | null | undefined;
  price: number;
  source: string | null | undefined;
}) => {
  const source = String(params.source ?? "").trim().toLowerCase();
  const canTrustOriginalFromSource = source === "auth" || source === "public";
  const canTrustScraperOriginal = source === "scraper";
  const normalizedIncoming = toNumber(params.incomingOriginal);
  const normalizeOriginalByRules = (
    candidate: number,
    price: number,
    options?: { minDiscountRatio?: number; maxDiscountRatio?: number; maxRatio?: number },
  ) => {
    if (!(Number.isFinite(candidate) && Number.isFinite(price) && candidate > 0 && price > 0)) return null;
    if (candidate <= price) return null;
    const discountRatio = (candidate - price) / candidate;
    const minDiscountRatio = Math.max(0, options?.minDiscountRatio ?? 0.005);
    const maxDiscountRatio = Math.min(0.95, Math.max(minDiscountRatio, options?.maxDiscountRatio ?? 0.9));
    const maxRatio = Math.max(1.1, options?.maxRatio ?? 5);
    if (discountRatio < minDiscountRatio || discountRatio > maxDiscountRatio) return null;
    if (candidate > price * maxRatio) return null;
    return candidate;
  };
  if (
    canTrustOriginalFromSource &&
    typeof normalizedIncoming === "number" &&
    Number.isFinite(normalizedIncoming)
  ) {
    const trustedOriginal = normalizeOriginalByRules(normalizedIncoming, params.price, {
      minDiscountRatio: 0.005,
      maxDiscountRatio: 0.9,
      maxRatio: 5,
    });
    if (trustedOriginal !== null) return trustedOriginal;
  }

  if (
    canTrustScraperOriginal &&
    typeof normalizedIncoming === "number" &&
    Number.isFinite(normalizedIncoming)
  ) {
    const scraperOriginal = normalizeOriginalByRules(normalizedIncoming, params.price, {
      minDiscountRatio: 0.02,
      maxDiscountRatio: 0.75,
      maxRatio: 1.8,
    });
    if (scraperOriginal !== null) return scraperOriginal;
  }

  if (!canTrustOriginalFromSource && !canTrustScraperOriginal) {
    // For scraper/catalog derived prices, never carry stale original_price.
    return null;
  }

  const normalizedStored = toNumber(params.storedOriginal);
  if (
    !(typeof normalizedStored === "number" && Number.isFinite(normalizedStored) && normalizedStored > params.price)
  ) {
    return null;
  }

  // Trusted source but no incoming original_price: do not keep old promotional anchor,
  // otherwise stale discounts can persist after promotion ends.
  return null;
};

const normalizeHistoryPromoAnchor = (
  candidateValue: unknown,
  finalPrice: number,
  options?: { minDiscountRatio?: number; maxDiscountRatio?: number; maxRatio?: number },
): number | null => {
  const candidate = toNumber(candidateValue);
  if (!(Number.isFinite(candidate) && Number.isFinite(finalPrice) && candidate > 0 && finalPrice > 0)) {
    return null;
  }
  if (candidate <= finalPrice) return null;

  const discountRatio = (candidate - finalPrice) / candidate;
  const minDiscountRatio = Math.max(0, options?.minDiscountRatio ?? 0.02);
  const maxDiscountRatio = Math.min(0.95, Math.max(minDiscountRatio, options?.maxDiscountRatio ?? 0.75));
  const maxRatio = Math.max(1.1, options?.maxRatio ?? 1.9);

  if (discountRatio < minDiscountRatio || discountRatio > maxDiscountRatio) return null;
  if (candidate > finalPrice * maxRatio) return null;
  return candidate;
};

const stripHtml = (html: string): string => {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
};

const buildScraperUrl = (targetUrl: string) => {
  if (!SCRAPER_API_KEY && !SCRAPER_API_URL_TEMPLATE) return targetUrl;
  if (SCRAPER_API_URL_TEMPLATE) {
    return SCRAPER_API_URL_TEMPLATE
      .replace("{api_key}", encodeURIComponent(SCRAPER_API_KEY ?? ""))
      .replace("{url}", encodeURIComponent(targetUrl));
  }
  const base = SCRAPER_API_URL?.replace(/\/$/, "") ?? "https://api.scraperapi.com";
  const url = new URL(base);
  if (SCRAPER_API_KEY) {
    url.searchParams.set("api_key", SCRAPER_API_KEY);
  }
  url.searchParams.set("url", targetUrl);
  return url.toString();
};

const extractPixPriceFromHtml = (
  html: string,
  referencePrice?: number | null,
): number | null => {
  if (!html) return null;

  const candidates: Array<number | null> = [];
  const jsonPatterns = [
    /"payment_method_id"\s*:\s*"pix"[^}]{0,500}?(?:"amount"|"price"|"value"|"regular_amount")\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
    /"payment_method"\s*:\s*"pix"[^}]{0,500}?(?:"amount"|"price"|"value"|"regular_amount")\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
    /"pix"\s*:\s*{[^}]{0,300}?"amount"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
    /"pix"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
  ];

  for (const pattern of jsonPatterns) {
    const regex = new RegExp(pattern.source, `${pattern.flags.replace(/g/g, "")}g`);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html))) {
      if (!match[1]) continue;
      const numeric = parseMoney(match[1]) ?? toNumber(match[1]);
      if (numeric !== null) candidates.push(numeric);
    }
  }

  const normalizedReference =
    typeof referencePrice === "number" && Number.isFinite(referencePrice) && referencePrice > 0
      ? referencePrice
      : null;
  const maxReferenceGap = Math.min(
    0.5,
    Math.max(0.05, Number.isFinite(PIX_TEXT_REFERENCE_GAP_MAX) ? PIX_TEXT_REFERENCE_GAP_MAX : 0.15),
  );

  // Highest confidence: explicit phrase that includes both pix and regular price.
  const pairPatterns: Array<{ re: RegExp; pixGroup: number; standardGroup: number }> = [
    {
      re: /r\$\s*([0-9][0-9\s\.,]{0,16})[^<>{}\n]{0,80}?no\s*pix[^<>{}\n]{0,80}?ou\s*r\$\s*([0-9][0-9\s\.,]{0,16})\s*em\s*outros\s*meios/gi,
      pixGroup: 1,
      standardGroup: 2,
    },
    {
      re: /no\s*pix[^<>{}\n]{0,40}?r\$\s*([0-9][0-9\s\.,]{0,16})[^<>{}\n]{0,80}?ou\s*r\$\s*([0-9][0-9\s\.,]{0,16})\s*em\s*outros\s*meios/gi,
      pixGroup: 1,
      standardGroup: 2,
    },
  ];

  const pairCandidates: number[] = [];
  for (const { re, pixGroup, standardGroup } of pairPatterns) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html))) {
      const pixRaw = match[pixGroup] ?? "";
      const standardRaw = match[standardGroup] ?? "";
      const pix = parseMoney(pixRaw);
      const standard = parseMoney(standardRaw);
      if (pix === null || standard === null) continue;
      if (!(pix > 0 && standard > 0 && pix < standard)) continue;
      if (
        normalizedReference !== null &&
        Math.abs(standard - normalizedReference) / normalizedReference > maxReferenceGap
      ) {
        continue;
      }
      pairCandidates.push(pix);
    }
  }

  const fromPair = pickBestPixCandidate(pairCandidates, normalizedReference, {
    minRatio: PIX_SCRAPER_MIN_RATIO_VS_STANDARD,
    requireMeaningfulDiscount: true,
  });
  if (fromPair !== null) return fromPair;

  const pixNearPriceRegexes = [
    /(?:no|via|com|pagamento(?:\s+no)?|a\s+vista(?:\s+no)?)\s*pix[^0-9r$]{0,40}r\$\s*([0-9][0-9\s\.,]{0,16})/gi,
    /r\$\s*([0-9][0-9\s\.,]{0,16})[^0-9]{0,40}(?:no|via|com|pagamento(?:\s+no)?|a\s+vista(?:\s+no)?)\s*pix/gi,
  ];

  const collectByRegex = (source: string) => {
    for (const pattern of pixNearPriceRegexes) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source))) {
        if (!match[1]) continue;
        const parsed = parseMoney(match[1]);
        if (parsed !== null) candidates.push(parsed);
      }
    }
  };

  const compactHtml = html.replace(/\s+/g, " ");
  const plainText = stripHtml(html);

  collectByRegex(compactHtml);
  collectByRegex(plainText);

  return pickBestPixCandidate(candidates, referencePrice, {
    minRatio: PIX_SCRAPER_MIN_RATIO_VS_STANDARD,
    requireMeaningfulDiscount: true,
  });
};

const collectPriceCandidates = (value: unknown, out: number[]) => {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectPriceCandidates(item, out);
    return;
  }
  if (typeof value !== "object") return;

  const obj = value as Record<string, unknown>;
  for (const [key, val] of Object.entries(obj)) {
    if (key === "price" || key === "lowPrice" || key === "highPrice") {
      const parsed = toNumber(val);
      if (parsed !== null) out.push(parsed);
    }
    collectPriceCandidates(val, out);
  }
};

const extractStandardPriceFromHtml = (
  html: string,
  referencePrice?: number | null,
): number | null => {
  if (!html) return null;

  const candidates: Array<{ value: number; score: number }> = [];
  const pushCandidate = (raw: unknown, score: number) => {
    const parsed = typeof raw === "number" ? raw : parseMoney(String(raw ?? "")) ?? toNumber(raw);
    if (!(typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0)) return;
    candidates.push({ value: parsed, score });
  };

  const compactHtml = html.replace(/\s+/g, " ");
  const plainText = stripHtml(html);
  const isRecommendationContext = (context: string) => {
    const normalized = context.toLowerCase();
    return (
      normalized.includes("sua primeira compra") ||
      normalized.includes("produto também comprou") ||
      normalized.includes("patrocinado") ||
      normalized.includes("mais vendidos") ||
      normalized.includes("esportes e fitness") ||
      normalized.includes("quem viu também") ||
      normalized.includes("ofertas")
    );
  };
  const normalizedReference =
    typeof referencePrice === "number" && Number.isFinite(referencePrice) && referencePrice > 0
      ? referencePrice
      : null;

  // Highest confidence for Mercado Livre: explicit pair "pix ... ou R$ X em outros meios".
  const explicitStandardPatterns = [
    /(?:ou\s*)?r\$\s*([0-9][0-9\s\.,]{0,16})\s*em\s*outros\s*meios/gi,
    /(?:por|preco|valor)\s*r\$\s*([0-9][0-9\s\.,]{0,16})\s*(?:em\s*outros\s*meios)?/gi,
    /"total_price"\s*:\s*{[^}]{0,240}?"value"\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi,
  ];
  for (const pattern of explicitStandardPatterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(compactHtml))) {
      if (!match[1]) continue;
      pushCandidate(match[1], 120);
    }
  }

  const fromPriceOptionsRegex = /opç(?:õ|o)es de compra[^\.]{0,140}?a partir de\s*r\$\s*([0-9][0-9\s\.,]{0,16})/gi;
  fromPriceOptionsRegex.lastIndex = 0;
  let optionsMatch: RegExpExecArray | null;
  while ((optionsMatch = fromPriceOptionsRegex.exec(plainText))) {
    if (!optionsMatch[1]) continue;
    pushCandidate(optionsMatch[1], 130);
  }

  // Common HTML split for integer/cents in ML templates.
  const splitAmountRegexes = [
    /andes-money-amount__fraction[^>]*>\s*([0-9][0-9\.\s]{0,16})\s*<[\s\S]{0,120}?andes-money-amount__cents[^>]*>\s*([0-9]{2})\s*</gi,
    /"fraction"\s*:\s*"([0-9][0-9\.\s]{0,16})"[\s\S]{0,60}?"cents"\s*:\s*"([0-9]{2})"/gi,
  ];
  for (const pattern of splitAmountRegexes) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(compactHtml))) {
      const contextStart = Math.max(0, match.index - 160);
      const contextEnd = Math.min(compactHtml.length, pattern.lastIndex + 160);
      const context = compactHtml.slice(contextStart, contextEnd).toLowerCase();
      const looksLikeOldListPrice =
        context.includes("</s>") ||
        context.includes("<s ") ||
        context.includes("<del") ||
        context.includes("previous-price") ||
        context.includes("original-value") ||
        context.includes("line-through");
      const looksLikeInstallment =
        context.includes("sem juros") ||
        context.includes("parcela") ||
        context.includes("parcelado") ||
        /\b\d{1,2}\s*x\b/.test(context);
      if (looksLikeOldListPrice || looksLikeInstallment || isRecommendationContext(context)) continue;
      const raw = `${match[1] ?? ""},${match[2] ?? ""}`;
      pushCandidate(raw, 110);
    }
  }

  // Generic "R$ ..." capture with context filtering.
  const genericRegex = /r\$\s*([0-9][0-9\s\.,]{0,16})/gi;
  genericRegex.lastIndex = 0;
  let genericMatch: RegExpExecArray | null;
  while ((genericMatch = genericRegex.exec(plainText))) {
    if (!genericMatch[1]) continue;
    const start = Math.max(0, genericMatch.index - 48);
    const end = Math.min(plainText.length, genericRegex.lastIndex + 48);
    const context = plainText.slice(start, end).toLowerCase();
    if (
      context.includes(" pix") ||
      context.includes("parcela") ||
      context.includes("juros") ||
      context.includes("de r$") ||
      context.includes("economize") ||
      context.includes("agora") ||
      context.includes("off") ||
      context.includes("mais vendido") ||
      context.includes("reco") ||
      context.includes("polycard") ||
      context.includes("cupom") ||
      context.includes("coupon")
    ) {
      continue;
    }
    if (isRecommendationContext(context)) continue;
    pushCandidate(genericMatch[1], 90);
  }

  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const jsonCandidates: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = jsonLdRegex.exec(html))) {
    const jsonText = (match[1] || "").trim();
    if (!jsonText) continue;
    const parsed = parseJsonSafe(jsonText);
    collectPriceCandidates(parsed, jsonCandidates);
  }

  for (const candidate of jsonCandidates) {
    pushCandidate(candidate, 70);
  }

  const regex = /"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi;
  while ((match = regex.exec(html))) {
    const contextStart = Math.max(0, match.index - 120);
    const contextEnd = Math.min(html.length, regex.lastIndex + 120);
    const context = html.slice(contextStart, contextEnd);
    if (isRecommendationContext(context)) continue;
    pushCandidate(match[1], 125);
  }

  if (!candidates.length) return null;

  const bucket = new Map<string, { value: number; score: number; count: number }>();
  for (const candidate of candidates) {
    const key = candidate.value.toFixed(2);
    const current = bucket.get(key);
    if (!current) {
      bucket.set(key, { value: candidate.value, score: candidate.score, count: 1 });
      continue;
    }
    current.count += 1;
    if (candidate.score > current.score) current.score = candidate.score;
  }

  const ranked = Array.from(bucket.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (normalizedReference !== null) {
      const aDistance = Math.abs(a.value - normalizedReference) / normalizedReference;
      const bDistance = Math.abs(b.value - normalizedReference) / normalizedReference;
      if (aDistance !== bDistance) return aDistance - bDistance;
    }
    if (b.count !== a.count) return b.count - a.count;
    // Without API reference, prefer highest recurring amount for standard price.
    return normalizedReference !== null ? a.value - b.value : b.value - a.value;
  });

  return ranked[0]?.value ?? null;
};

const extractOriginalPriceFromHtml = (
  html: string,
  referencePrice?: number | null,
): number | null => {
  if (!html) return null;

  const candidates: Array<{ value: number; score: number }> = [];
  const pushCandidate = (raw: unknown, score: number) => {
    const parsed = typeof raw === "number" ? raw : parseMoney(String(raw ?? "")) ?? toNumber(raw);
    if (!(typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0)) return;
    candidates.push({ value: parsed, score });
  };

  const normalizedReference =
    typeof referencePrice === "number" && Number.isFinite(referencePrice) && referencePrice > 0
      ? referencePrice
      : null;
  const compactHtml = html.replace(/\s+/g, " ");
  const plainText = stripHtml(html);

  const jsonPatterns = [
    /"original_price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi,
    /"list_price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi,
    /"oldPrice"\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi,
  ];
  for (const pattern of jsonPatterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(compactHtml))) {
      if (!match[1]) continue;
      pushCandidate(match[1], 120);
    }
  }

  const strikeRegexes = [
    /<s[^>]*>\s*r\$\s*([0-9][0-9\s\.,]{0,16})\s*<\/s>/gi,
    /<del[^>]*>\s*r\$\s*([0-9][0-9\s\.,]{0,16})\s*<\/del>/gi,
  ];
  for (const pattern of strikeRegexes) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(compactHtml))) {
      if (!match[1]) continue;
      pushCandidate(match[1], 110);
    }
  }

  const dePriceRegex = /de\s*r\$\s*([0-9][0-9\s\.,]{0,16})/gi;
  dePriceRegex.lastIndex = 0;
  let deMatch: RegExpExecArray | null;
  while ((deMatch = dePriceRegex.exec(plainText))) {
    if (!deMatch[1]) continue;
    pushCandidate(deMatch[1], 100);
  }

  if (!candidates.length) return null;

  const bucket = new Map<string, { value: number; score: number; count: number }>();
  for (const candidate of candidates) {
    const key = candidate.value.toFixed(2);
    const current = bucket.get(key);
    if (!current) {
      bucket.set(key, { value: candidate.value, score: candidate.score, count: 1 });
      continue;
    }
    current.count += 1;
    if (candidate.score > current.score) current.score = candidate.score;
  }

  const ranked = Array.from(bucket.values())
    .filter((candidate) => {
      if (normalizedReference === null) return true;
      return candidate.value > normalizedReference && candidate.value <= normalizedReference * 3.5;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (normalizedReference !== null) {
        const aDistance = a.value - normalizedReference;
        const bDistance = b.value - normalizedReference;
        if (aDistance !== bDistance) return aDistance - bDistance;
      }
      if (b.count !== a.count) return b.count - a.count;
      return b.value - a.value;
    });

  return ranked[0]?.value ?? null;
};

const resolveScrapeUrl = (
  product: {
    source_url?: string | null;
    affiliate_link?: string | null;
    affiliate_verified?: boolean | null;
    status?: string | null;
    is_active?: boolean | null;
  },
  normalizedExternalId: string,
  itemBody: any,
) => {
  const sanitizeScrapeUrl = (value: string) => {
    try {
      const parsed = new URL(value);
      const host = parsed.host.toLowerCase();
      if (!host.includes("mercadolivre.com")) return value;

      parsed.hash = "";
      const trackingParams = [
        "matt_tool",
        "matt_word",
        "sid",
        "wid",
        "origin",
        "ref",
        "forceInApp",
      ];
      for (const param of trackingParams) {
        parsed.searchParams.delete(param);
      }

      if (/\/p\/mlb\d{6,12}/i.test(parsed.pathname)) {
        parsed.searchParams.delete("pdp_filters");
      }

      return parsed.toString();
    } catch {
      return value;
    }
  };

  const isSecAffiliate = (value?: string | null) => {
    if (!value) return false;
    try {
      const url = new URL(String(value));
      const host = url.host.toLowerCase();
      if (!(host === "mercadolivre.com" || host === "www.mercadolivre.com")) return false;
      return /^\/sec\/[a-z0-9]+/i.test(url.pathname || "");
    } catch {
      return false;
    }
  };

  const affiliateSec = isSecAffiliate(product?.affiliate_link) ? product?.affiliate_link : null;

  const isItemLevelUrl = (value?: string | null) => {
    if (!value || typeof value !== "string") return false;
    return /produto\.mercadolivre\.com\.br\/MLB-\d+/i.test(value) ||
      /pdp_filters=.*item_id/i.test(value) ||
      /\bwid=MLB\d+/i.test(value);
  };

  const canonicalOfferUrl = (product as any)?.canonical_offer_url ?? null;
  const preferredCanonical = isItemLevelUrl(canonicalOfferUrl) ? canonicalOfferUrl : null;
  const preferredSource = isItemLevelUrl(product?.source_url) ? product?.source_url ?? null : null;

  const candidates = [
    itemBody?.permalink,
    preferredCanonical,
    preferredSource,
    canonicalOfferUrl,
    product?.source_url,
    affiliateSec,
    product?.affiliate_link,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("http")) {
      return sanitizeScrapeUrl(candidate);
    }
  }
  const fallbackMlItemId =
    normalizeExternalId((product as any)?.ml_item_id) ?? normalizedExternalId;
  return fallbackMlItemId ? `https://produto.mercadolivre.com.br/${fallbackMlItemId}` : null;
};

const fetchScrapedHtml = async (
  targetUrl: string,
  signal?: AbortSignal,
  forceDirect = false,
) => {
  const scraperUrl = forceDirect ? targetUrl : buildScraperUrl(targetUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCRAPER_TIMEOUT_MS);
  const mergedSignal = signal ?? controller.signal;

  const doFetch = async (url: string) => {
    const resp = await fetch(url, {
      method: "GET",
      signal: mergedSignal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!resp.ok) return null;
    return await resp.text();
  };

  try {
    const html = await doFetch(scraperUrl);
    if (html) return html;
    if (!forceDirect && scraperUrl !== targetUrl) {
      return await doFetch(targetUrl);
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const fetchJinaHtml = async (targetUrl: string, signal?: AbortSignal) => {
  if (!targetUrl) return null;
  const stripped = targetUrl.replace(/^https?:\/\//, "");
  const jinaUrl = `https://r.jina.ai/http://${stripped}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCRAPER_TIMEOUT_MS);
  const mergedSignal = signal ?? controller.signal;

  try {
    const resp = await fetch(jinaUrl, {
      method: "GET",
      signal: mergedSignal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const hasPixMarker = (value: unknown): boolean => {
  if (!value) return false;
  if (typeof value === "string") return value.toLowerCase().includes("pix");
  if (Array.isArray(value)) return value.some(hasPixMarker);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasPixMarker);
  }
  return false;
};

const extractPricesArray = (data: any): any[] => {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray((data as any).prices)) return (data as any).prices;
  if (Array.isArray((data as any).prices?.prices)) return (data as any).prices.prices;
  if (Array.isArray((data as any).results)) return (data as any).results;
  return [];
};

const hasRestriction = (entry: any, restriction: string) => {
  const restrictions = entry?.conditions?.context_restrictions ?? entry?.context_restrictions;
  return Array.isArray(restrictions) && restrictions.includes(restriction);
};

const isPixEntry = (entry: any) =>
  hasPixMarker(entry?.conditions?.payment_method) ||
  hasPixMarker(entry?.conditions?.payment_method_id) ||
  hasPixMarker(entry?.payment_method) ||
  hasPixMarker(entry?.payment_method_id) ||
  hasPixMarker(entry?.payment_methods) ||
  hasPixMarker(entry?.tags) ||
  hasPixMarker(entry?.context_restrictions);

const isStandardEntry = (entry: any) => {
  const type = String(entry?.type ?? "").toLowerCase();
  if (type === "standard" || type === "not_specified") return true;
  if (type === "promotion" || type === "discount") return false;
  if (isPixEntry(entry)) return false;
  if (hasRestriction(entry, "payment_method")) return false;
  return true;
};

const pickMin = (values: Array<number | null>) => {
  const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return filtered.length ? Math.min(...filtered) : null;
};

const extractPriceSignals = (data: any) => {
  const entries = extractPricesArray(data);
  const salePrice = data && typeof data === "object" && (data as any).sale_price
    ? [(data as any).sale_price]
    : [];

  const allEntries = [...salePrice, ...entries];
  const pixCandidates: Array<number | null> = [];
  const standardEntries: any[] = [];

  for (const entry of allEntries) {
    const amount =
      toNumber(entry?.amount) ??
      toNumber(entry?.price) ??
      toNumber(entry?.value) ??
      toNumber(entry?.regular_amount);

    if (amount === null) continue;
    if (isPixEntry(entry)) {
      pixCandidates.push(amount);
      continue;
    }
    if (isStandardEntry(entry)) {
      standardEntries.push({ entry, amount });
    }
  }

  const byPayment = (data as any)?.price_by_payment_method ?? (data as any)?.price_by_payment_methods;
  if (byPayment && typeof byPayment === "object") {
    const pixCandidate =
      toNumber((byPayment as any).pix) ??
      toNumber((byPayment as any).PIX) ??
      toNumber((byPayment as any).pix_price);
    if (pixCandidate !== null) pixCandidates.push(pixCandidate);
  }

  const standardMarketplace = standardEntries.filter(({ entry }) =>
    hasRestriction(entry, "channel_marketplace"),
  );

  const standard = pickMin(
    (standardMarketplace.length ? standardMarketplace : standardEntries).map(
      ({ amount }) => amount,
    ),
  );

  return {
    pix: pickBestPixCandidate(pixCandidates, standard),
    standard,
  };
};

const resolveApiStandardPrice = (
  itemBody: any,
  priceSignals: { standard: number | null },
) => {
  const signalPrice = toNumber(priceSignals?.standard);
  if (typeof signalPrice === "number" && Number.isFinite(signalPrice) && signalPrice > 0) {
    return signalPrice;
  }
  const basePrice = toNumber(itemBody?.price);
  if (typeof basePrice === "number" && Number.isFinite(basePrice) && basePrice > 0) {
    return basePrice;
  }
  return null;
};

// --------- TOKEN STORE (corrigido para NAO depender de upsert com id fixo) ---------

const getTokenRow = async (supabase: ReturnType<typeof createClient>) => {
  const { data, error } = await supabase
    .from("meli_tokens")
    .select("id, access_token, refresh_token, updated_at, expires_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") return { error: error.message as string };
  return { data: data ?? null };
};

const ensureMeliTokens = async (
  supabase: ReturnType<typeof createClient>,
  envTokens: { accessToken?: string | null; refreshToken?: string | null },
) => {
  const row = await getTokenRow(supabase);
  if ("error" in row) return { error: row.error };

  if (row.data) {
    return {
      tokenRowId: row.data.id,
      tokens: {
        access_token: row.data.access_token ?? envTokens.accessToken ?? null,
        refresh_token: row.data.refresh_token ?? envTokens.refreshToken ?? null,
        expires_at: row.data.expires_at ?? null,
      },
    };
  }

  // nao existe linha ainda
  if (!envTokens.accessToken && !envTokens.refreshToken) {
    return { error: "MELI_ACCESS_TOKEN missing" };
  }

  const nowIso = new Date().toISOString();
  const { data: inserted, error: insErr } = await supabase
    .from("meli_tokens")
    .insert({
      access_token: envTokens.accessToken ?? null,
      refresh_token: envTokens.refreshToken ?? null,
      updated_at: nowIso,
      expires_at: null,
    })
    .select("id, access_token, refresh_token, expires_at")
    .single();

  if (insErr) return { error: insErr.message };

  return {
    tokenRowId: inserted.id,
    tokens: {
      access_token: inserted.access_token ?? null,
      refresh_token: inserted.refresh_token ?? null,
      expires_at: inserted.expires_at ?? null,
    },
  };
};

const updateMeliTokens = async (
  supabase: ReturnType<typeof createClient>,
  tokenRowId: number,
  payload: { access_token: string | null; refresh_token: string | null; expires_at: string | null },
) => {
  const nowIso = new Date().toISOString();

  // tenta UPDATE primeiro
  const { error: updErr } = await supabase
    .from("meli_tokens")
    .update({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      updated_at: nowIso,
      expires_at: payload.expires_at,
    })
    .eq("id", tokenRowId);

  if (!updErr) return { ok: true };

  // se falhar por algum motivo, tenta INSERT sem id (fallback)
  const { error: insErr } = await supabase.from("meli_tokens").insert({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    updated_at: nowIso,
    expires_at: payload.expires_at,
  });

  if (insErr) return { error: insErr.message };
  return { ok: true };
};

// --------- OAuth refresh ---------

const refreshAccessToken = async ({
  refreshToken,
  clientId,
  clientSecret,
}: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}) => {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const resp = await fetch(OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const text = await resp.text();
  const data = text ? parseJsonSafe(text) : {};
  return { resp, data };
};

const createMeliFetch = (args: {
  getToken: () => string | null;
  refresh: () => Promise<{ ok: boolean; status: number; body: unknown }>;
}) => {
  return async (url: string, init: RequestInit = {}): Promise<MeliFetchResult> => {
    const token = args.getToken();
    if (!token) {
      return { response: null, body: { error: "MELI_ACCESS_TOKEN missing" }, status: 500 };
    }

    const requestInit: RequestInit = {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    };

    const response = await fetch(url, requestInit);
    const etag = response.headers.get("etag") ?? response.headers.get("ETag");
    if (response.status !== 401) {
      const text = await response.text();
      return {
        response,
        body: text ? parseJsonSafe(text) : {},
        status: response.status,
        etag,
      };
    }

    const refreshResult = await args.refresh();
    if (!refreshResult.ok) {
      return {
        response,
        body: { error: "meli_refresh_failed", detail: refreshResult.body },
        status: refreshResult.status,
      };
    }

    const refreshedToken = args.getToken();
    if (!refreshedToken) {
      return { response, body: { error: "MELI_ACCESS_TOKEN missing" }, status: 500 };
    }

    const retryInit: RequestInit = {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${refreshedToken}`,
      },
    };

    const retryResponse = await fetch(url, retryInit);
    const retryEtag = retryResponse.headers.get("etag") ?? retryResponse.headers.get("ETag");
    const retryText = await retryResponse.text();
    return {
      response: retryResponse,
      body: retryText ? parseJsonSafe(retryText) : {},
      status: retryResponse.status,
      etag: retryEtag,
    };
  };
};

const fetchMeliPublicItem = async (
  externalId: string,
  etag?: string | null,
  signal?: AbortSignal,
): Promise<MeliFetchResult> => {
  const headers: Record<string, string> = {};
  if (etag) headers["If-None-Match"] = etag;

  const response = await fetch(`${ITEMS_BASE}${encodeURIComponent(externalId)}`, {
    method: "GET",
    headers,
    signal,
  });
  const respEtag = response.headers.get("etag") ?? response.headers.get("ETag");
  const text = await response.text();
  return {
    response,
    body: text ? parseJsonSafe(text) : {},
    status: response.status,
    etag: respEtag,
  };
};

const pickBestProductItem = (
  data: Record<string, unknown>,
  preferredItemId?: string | null,
  options?: { strictOfferMatch?: boolean; fallbackItemId?: string | null },
) => {
  const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
  if (!results.length) return null;

  const withPrice = results.filter(
    (item: any) => typeof item?.price === "number" && Number(item.price) > 0,
  );
  if (!withPrice.length) return null;

  const activeInStock = withPrice.filter((item: any) => {
    const status = String(item?.status ?? "").toLowerCase();
    const available = toNumber(item?.available_quantity);
    return status !== "paused" && status !== "closed" && (available === null || available > 0);
  });

  const sortByBestPrice = (items: any[]) =>
    [...items].sort((a, b) => {
      const priceA = toNumber(a?.price) ?? Number.POSITIVE_INFINITY;
      const priceB = toNumber(b?.price) ?? Number.POSITIVE_INFINITY;
      if (priceA !== priceB) return priceA - priceB;
      const soldA = toNumber(a?.sold_quantity) ?? 0;
      const soldB = toNumber(b?.sold_quantity) ?? 0;
      if (soldA !== soldB) return soldB - soldA;
      const idA = String(a?.id ?? a?.item_id ?? "");
      const idB = String(b?.id ?? b?.item_id ?? "");
      return idA.localeCompare(idB);
    });

  const pool = activeInStock.length ? sortByBestPrice(activeInStock) : sortByBestPrice(withPrice);
  const bestMarket = pool[0] ?? null;
  if (!bestMarket) return null;

  const targetItemId = normalizeExternalId(
    preferredItemId ?? options?.fallbackItemId ?? null,
  );
  if (!targetItemId) return bestMarket;

  const exact = pool.find(
    (item: any) => normalizeExternalId(item?.item_id || item?.id || null) === targetItemId,
  );
  if (!exact) {
    if (options?.strictOfferMatch) return null;
    return bestMarket;
  }

  if (options?.strictOfferMatch) return exact;

  const exactPrice = toNumber((exact as any)?.price);
  const bestPrice = toNumber((bestMarket as any)?.price);
  if (
    typeof exactPrice === "number" &&
    Number.isFinite(exactPrice) &&
    exactPrice > 0 &&
    typeof bestPrice === "number" &&
    Number.isFinite(bestPrice) &&
    bestPrice > 0
  ) {
    // Keep preferred item only when close to market-best.
    if (exactPrice <= bestPrice * 1.08) return exact;
    return bestMarket;
  }

  return bestMarket;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: JSON_HEADERS });
  }
  let payload: Record<string, unknown> = {};
  try {
    if (req.body) payload = await req.json();
  } catch {
    payload = {};
  }

  const action =
    typeof (payload as any)?.action === "string" ? String((payload as any).action) : null;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "missing_env" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  if (action === "test_pix") {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "missing_auth" }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    const parseJwt = (jwt: string) => {
      try {
        const [, payloadPart] = jwt.split(".");
        if (!payloadPart) return null;
        const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
        const decoded = atob(padded);
        return JSON.parse(decoded);
      } catch {
        return null;
      }
    };

    const claims = parseJwt(token);
    const userId = claims?.sub ?? null;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: "invalid_auth" }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    const { data: roleRow, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roleRow) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403,
        headers: JSON_HEADERS,
      });
    }

    const productId = (payload as any)?.product_id as string | undefined;
    if (!productId) {
      return new Response(JSON.stringify({ ok: false, error: "missing_product_id" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select(
        "id, marketplace, external_id, ml_item_id, canonical_offer_url, price, pix_price, source_url, affiliate_link",
      )
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return new Response(JSON.stringify({ ok: false, error: "product_not_found" }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }

    if (!String(product.marketplace ?? "").toLowerCase().includes("mercado")) {
      return new Response(JSON.stringify({ ok: false, error: "invalid_marketplace" }), {
        status: 422,
        headers: JSON_HEADERS,
      });
    }

    const adUrl =
      product.canonical_offer_url || product.source_url || product.affiliate_link || null;
    const normalizedExternalId =
      normalizeExternalId(product.external_id) || extractItemIdFromUrl(adUrl) || null;
    const catalogId =
      extractCatalogIdFromUrl(product.canonical_offer_url) ||
      extractCatalogIdFromUrl(product.source_url) ||
      extractCatalogIdFromUrl(product.affiliate_link);
    const preferredItemId =
      normalizeExternalId((product as any)?.ml_item_id) ||
      extractItemIdFromUrl(product.canonical_offer_url) ||
      extractItemIdFromUrl(product.source_url) ||
      extractItemIdFromUrl(product.affiliate_link);
    const fetchItemId = preferredItemId || normalizedExternalId;

    if (!fetchItemId && !catalogId) {
      return new Response(JSON.stringify({ ok: false, error: "missing_external_id" }), {
        status: 422,
        headers: JSON_HEADERS,
      });
    }

    const envAccessToken = Deno.env.get("MELI_ACCESS_TOKEN");
    const envRefreshToken = Deno.env.get("MELI_REFRESH_TOKEN");
    const clientId = Deno.env.get("MELI_CLIENT_ID");
    const clientSecret = Deno.env.get("MELI_CLIENT_SECRET");

    const tokenState = await ensureMeliTokens(supabase, {
      accessToken: envAccessToken,
      refreshToken: envRefreshToken,
    });

    if ("error" in tokenState) {
      return new Response(JSON.stringify({ ok: false, error: tokenState.error }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    const tokenRowId = tokenState.tokenRowId as number;
    let currentAccessToken = tokenState.tokens?.access_token ?? null;
    let currentRefreshToken = tokenState.tokens?.refresh_token ?? null;

    const refresh = async () => {
      if (!currentRefreshToken) {
        return { ok: false, status: 500, body: { error: "MELI_REFRESH_TOKEN missing" } };
      }
      if (!clientId || !clientSecret) {
        return { ok: false, status: 500, body: { error: "MELI_CLIENT_ID/SECRET missing" } };
      }

      let resp: Response;
      let data: Record<string, unknown>;
      try {
        const result = await refreshAccessToken({
          refreshToken: currentRefreshToken,
          clientId,
          clientSecret,
        });
        resp = result.resp;
        data = result.data as Record<string, unknown>;
      } catch (error) {
        return {
          ok: false,
          status: 500,
          body: { error: "meli_refresh_exception", message: String(error) },
        };
      }

      const safeData = sanitizeOAuthPayload(data as any);
      if (!resp.ok) return { ok: false, status: resp.status, body: safeData };

      currentAccessToken = (data as any)?.access_token ?? null;
      currentRefreshToken = (data as any)?.refresh_token ?? currentRefreshToken ?? null;

      const expiresIn = Number((data as any)?.expires_in ?? 0);
      const expiresAt = expiresIn > 0 ? addMs(new Date(), expiresIn * 1000).toISOString() : null;

      const updateResult = await updateMeliTokens(supabase, tokenRowId, {
        access_token: currentAccessToken,
        refresh_token: currentRefreshToken,
        expires_at: expiresAt,
      });

      if ((updateResult as any)?.error) {
        return { ok: false, status: 500, body: { error: (updateResult as any).error } };
      }

      return { ok: true, status: resp.status, body: safeData };
    };

    if (!tokenState.tokens?.expires_at) {
      const hydrate = await refresh();
      if (!hydrate.ok) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "token_refresh_failed_on_bootstrap",
            status: hydrate.status,
            detail: hydrate.body,
          }),
          { status: 500, headers: JSON_HEADERS },
        );
      }
    }

    const meliFetch = createMeliFetch({
      getToken: () => currentAccessToken,
      refresh,
    });

    let itemResp: MeliFetchResult = { response: null, body: {}, status: 0 };
    let usedPublicFallback = false;
    let usedProductFallback = false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      if (fetchItemId) {
        itemResp = await meliFetch(`${ITEMS_BASE}${encodeURIComponent(fetchItemId)}`, {
          method: "GET",
          signal: controller.signal,
        });
      }

      if (itemResp.status !== 200 && catalogId) {
        const productItemsResp = await meliFetch(
          `${API_BASE}/products/${encodeURIComponent(catalogId)}/items`,
          { method: "GET", signal: controller.signal },
        );

        if (productItemsResp.status === 200) {
          const best = pickBestProductItem(productItemsResp.body as any, preferredItemId, {
            strictOfferMatch: PRICE_SYNC_STRICT_OFFER_MATCH && Boolean(preferredItemId),
          });
          if (best) {
            const bestId = (best as any)?.id ?? (best as any)?.item_id ?? null;
            itemResp = {
              response: null,
              status: 200,
              body: {
                id: bestId,
                price: best.price,
                status: "active",
                available_quantity:
                  typeof best.available_quantity === "number" ? best.available_quantity : null,
                permalink: best.permalink ?? null,
              },
              etag: null,
            };
            usedProductFallback = true;
          }
        }
      }

      if (itemResp.status !== 200 && fetchItemId) {
        itemResp = await fetchMeliPublicItem(fetchItemId, null, controller.signal);
        usedPublicFallback = true;
      }
    } finally {
      clearTimeout(timer);
    }

    let priceSignalsFromItem = { pix: null as number | null, standard: null as number | null };
    let priceSignalsFromPrices = { pix: null as number | null, standard: null as number | null };

    if (itemResp.status === 200 && ENABLE_PIX_PRICE) {
      priceSignalsFromItem = extractPriceSignals(itemResp.body);

      const priceItemId =
        (itemResp.body && (itemResp.body as any).id) || fetchItemId || normalizedExternalId || null;

      const shouldFetchPrices =
        Boolean(priceItemId) &&
        (!priceSignalsFromItem.pix || !priceSignalsFromItem.standard);

      if (shouldFetchPrices) {
        const pricesResp = await meliFetch(
          `${ITEMS_BASE}${encodeURIComponent(String(priceItemId))}/prices`,
          { method: "GET", signal: controller.signal },
        );
        if (pricesResp.status === 200) {
          priceSignalsFromPrices = extractPriceSignals(pricesResp.body);
        }
      }
    }

    const standardPrice = ENABLE_PIX_PRICE
      ? priceSignalsFromItem.standard ?? priceSignalsFromPrices.standard ?? null
      : null;
    const pixCandidate = ENABLE_PIX_PRICE
      ? priceSignalsFromItem.pix ?? priceSignalsFromPrices.pix ?? null
      : null;

    const resolvedPrice = resolveApiStandardPrice(itemResp.body, {
      standard: standardPrice,
    });
    let resolvedPix = pickBestPixCandidate([pixCandidate], resolvedPrice);
    let pixSource: "api" | null = resolvedPix ? "api" : null;

    if (resolvedPix !== null && resolvedPrice !== null && resolvedPix >= resolvedPrice) {
      resolvedPix = null;
      pixSource = null;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        product_id: product.id,
        price: resolvedPrice,
        pix_price: resolvedPix,
        pix_source: pixSource,
        api_status: itemResp.status,
        used_public_fallback: usedPublicFallback,
        used_catalog_fallback: usedProductFallback,
        used_scraper_pix: false,
        raw_price_api: toNumber((itemResp.body as any)?.price),
        raw_price_scraper: null,
        raw_pix_api: pixCandidate,
        final_price: resolvedPix ?? resolvedPrice,
        final_price_source: resolvedPix !== null ? "pix_api" : "standard",
        item_id: (itemResp.body as any)?.id ?? fetchItemId ?? null,
        catalog_id: catalogId ?? null,
        preferred_item_id: preferredItemId ?? null,
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  }

  if (action === "apply_ad_price") {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "missing_auth" }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    const parseJwt = (jwt: string) => {
      try {
        const [, payloadPart] = jwt.split(".");
        if (!payloadPart) return null;
        const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
        const decoded = atob(padded);
        return JSON.parse(decoded);
      } catch {
        return null;
      }
    };

    const claims = parseJwt(token);
    const userId = claims?.sub ?? null;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: "invalid_auth" }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    const { data: roleRow, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roleRow) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403,
        headers: JSON_HEADERS,
      });
    }

    const productId = (payload as any)?.product_id as string | undefined;
    if (!productId) {
      return new Response(JSON.stringify({ ok: false, error: "missing_product_id" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, price, original_price, previous_price, source_url, affiliate_link")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return new Response(JSON.stringify({ ok: false, error: "product_not_found" }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }

    const adUrl = product.source_url || product.affiliate_link;
    if (!adUrl) {
      return new Response(JSON.stringify({ ok: false, error: "missing_product_url" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const extractPriceFromHtml = (html: string | null) => {
      if (!html) return { price: null as number | null, original: null as number | null };
      const price = extractStandardPriceFromHtml(html);
      const original =
        typeof price === "number" && Number.isFinite(price) && price > 0
          ? extractOriginalPriceFromHtml(html, price)
          : null;
      return { price, original };
    };

    let price: number | null = null;
    let originalPrice: number | null = null;
    let source: "scraper" | "direct" | "jina" | "none" = "none";

    const html = await fetchScrapedHtml(adUrl);
    {
      const parsed = extractPriceFromHtml(html);
      price = parsed.price;
      originalPrice = parsed.original;
    }
    if (price !== null) source = SCRAPER_API_KEY || SCRAPER_API_URL_TEMPLATE ? "scraper" : "direct";

    if (price === null) {
      const directHtml = await fetchScrapedHtml(adUrl, undefined, true);
      const parsed = extractPriceFromHtml(directHtml);
      price = parsed.price;
      originalPrice = parsed.original;
      if (price !== null) source = "direct";
    }

    if (price === null) {
      const jinaHtml = await fetchJinaHtml(adUrl);
      const parsed = extractPriceFromHtml(jinaHtml);
      price = parsed.price;
      originalPrice = parsed.original;
      if (price !== null) source = "jina";
    }

    if (price === null || !Number.isFinite(price) || price <= 0) {
      return new Response(JSON.stringify({ ok: false, error: "ad_price_not_found" }), {
        status: 422,
        headers: JSON_HEADERS,
      });
    }

    const currentPrice = typeof product.price === "number" ? product.price : null;
    const currentOriginal = typeof product.original_price === "number" ? product.original_price : null;
    const stabilizedPrice = stabilizeIncomingPriceForSource(price, currentPrice, "scraper");
    const guardAnchors = [
      currentPrice,
      typeof (product as any)?.previous_price === "number" ? (product as any).previous_price : null,
      currentOriginal,
    ].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
    const guardAnchor = guardAnchors.length ? Math.max(...guardAnchors) : null;
    const guardDropAbsolute =
      typeof guardAnchor === "number" && guardAnchor > stabilizedPrice
        ? guardAnchor - stabilizedPrice
        : 0;
    const guardDropPercent =
      typeof guardAnchor === "number" && guardAnchor > 0 && guardAnchor > stabilizedPrice
        ? (guardAnchor - stabilizedPrice) / guardAnchor
        : 0;
    const aggressiveScraperDropBlocked =
      typeof guardAnchor === "number" &&
      guardAnchor > 0 &&
      guardAnchor > stabilizedPrice &&
      (guardDropAbsolute >= PRICE_SYNC_UNTRUSTED_DROP_ABS_THRESHOLD ||
        guardDropPercent >= PRICE_SYNC_UNTRUSTED_DROP_PERCENT_THRESHOLD);

    if (aggressiveScraperDropBlocked) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "suspect_untrusted_drop",
          guard_anchor: guardAnchor,
          candidate_price: stabilizedPrice,
          absolute_delta: guardDropAbsolute,
          percent_delta: guardDropPercent,
        }),
        {
          status: 409,
          headers: JSON_HEADERS,
        },
      );
    }

    const nextOriginal = resolveOriginalPrice({
      incomingOriginal: originalPrice,
      storedOriginal: currentOriginal,
      price: stabilizedPrice,
      source: "scraper",
    });
    const discountPercentage =
      typeof nextOriginal === "number" && nextOriginal > stabilizedPrice
        ? Math.round(((nextOriginal - stabilizedPrice) / nextOriginal) * 100)
        : 0;
    const nowIso = new Date().toISOString();
    const normalizedPriceSource = source === "none" ? null : "scraper";
    const hasManualDrop =
      typeof currentPrice === "number" && Number.isFinite(currentPrice) && currentPrice > stabilizedPrice;
    const previousHistoryTtlHours = Math.max(1, Math.floor(PREVIOUS_PRICE_HISTORY_TTL_HOURS || 48));
    const previousHistoryExpiryIso = hasManualDrop
      ? addMs(new Date(), previousHistoryTtlHours * 60 * 60 * 1000).toISOString()
      : null;

    const { error: updateError } = await supabase
      .from("products")
      .update({
        previous_price: hasManualDrop ? currentPrice : null,
        previous_price_source: hasManualDrop ? "HISTORY" : null,
        previous_price_expires_at: previousHistoryExpiryIso,
        price: stabilizedPrice,
        detected_price: stabilizedPrice,
        detected_at: nowIso,
        last_sync: nowIso,
        last_price_source: normalizedPriceSource,
        last_price_verified_at: nowIso,
        original_price: nextOriginal,
        discount_percentage: discountPercentage,
        is_on_sale: discountPercentage > 0,
      })
      .eq("id", productId);

    if (updateError) {
      return new Response(JSON.stringify({ ok: false, error: updateError.message }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    return new Response(JSON.stringify({ ok: true, price: stabilizedPrice, source }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }

  const cronSecret = Deno.env.get("CRON_SECRET") ?? Deno.env.get("X_CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");

  if (!cronSecret) {
    return new Response(JSON.stringify({ ok: false, error: "CRON_SECRET missing" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
  if (providedSecret !== cronSecret) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  const ensureCronSecret = async () => {
    if (!cronSecret) return;
    try {
      await supabase.rpc("set_cron_secret", {
        p_key: "price-sync",
        p_value: cronSecret,
      });
      await supabase.rpc("set_cron_secret", {
        p_key: "price-drop-alerts",
        p_value: cronSecret,
      });
    } catch {
      // Don't block sync on cron secret storage failures.
    }
  };

  await ensureCronSecret();

  const forceSync = Boolean(
    (payload as any)?.force || (payload as any)?.force_sync || (payload as any)?.ignore_schedule,
  );
  const source =
    typeof (payload as any)?.source === "string" ? String((payload as any)?.source) : "cron";
  const batchSize = clamp(
    toPositiveInt((payload as any)?.batch_size ?? (payload as any)?.batchSize, DEFAULT_BATCH_SIZE),
    5,
    Math.max(5, MAX_BATCH_SIZE),
  );
  const maxRuntimeMs = clamp(
    toPositiveInt(
      (payload as any)?.max_runtime_ms ?? (payload as any)?.maxRuntimeMs,
      DEFAULT_MAX_RUNTIME_MS,
    ),
    15000,
    240000,
  );
  const continuationDepth = clamp(
    toNonNegativeInt(
      (payload as any)?.continuation_depth ?? (payload as any)?.continuationDepth,
      0,
    ),
    0,
    Math.max(0, HARD_MAX_CONTINUATIONS),
  );
  const maxContinuations = clamp(
    toNonNegativeInt(
      (payload as any)?.max_continuations ?? (payload as any)?.maxContinuations,
      DEFAULT_MAX_CONTINUATIONS,
    ),
    0,
    Math.max(0, HARD_MAX_CONTINUATIONS),
  );
  const allowContinuation = toBoolean(
    (payload as any)?.allow_continuation ?? (payload as any)?.allowContinuation,
    true,
  );
  const useQueueMode = toBoolean(
    (payload as any)?.use_queue ?? (payload as any)?.useQueue,
    PRICE_SYNC_QUEUE_ENABLED,
  );
  const enforceScraperWhenNoPix = toBoolean(
    (payload as any)?.enforce_scraper_when_no_pix ?? (payload as any)?.enforceScraperWhenNoPix,
    true,
  );
  const { data: priceCheckConfig } = await supabase
    .from("price_check_config")
    .select(
      "ttl_high_minutes, ttl_med_minutes, ttl_low_minutes, min_interval_seconds, max_interval_seconds, outlier_percent_threshold, outlier_abs_threshold, outlier_recheck_minutes, circuit_error_threshold, circuit_open_seconds, price_freeze_hours, price_freeze_recheck_minutes",
    )
    .eq("id", true)
    .maybeSingle();
  const ttlByPriority = {
    HIGH: toPositiveInt((priceCheckConfig as any)?.ttl_high_minutes, 120),
    MED: toPositiveInt((priceCheckConfig as any)?.ttl_med_minutes, 720),
    LOW: toPositiveInt((priceCheckConfig as any)?.ttl_low_minutes, 2160),
    HIGH_VOLATILITY: toPositiveInt(
      (payload as any)?.ttl_high_volatility_minutes ??
        (payload as any)?.ttlHighVolatilityMinutes ??
        PRICE_SYNC_TTL_HIGH_VOLATILITY_MINUTES,
      PRICE_SYNC_TTL_HIGH_VOLATILITY_MINUTES,
    ),
  };
  const outlierPercentThreshold = Math.max(
    0,
    Number((priceCheckConfig as any)?.outlier_percent_threshold ?? PRICE_SYNC_OUTLIER_PERCENT_THRESHOLD),
  );
  const outlierAbsoluteThreshold = Math.max(
    0,
    Number((priceCheckConfig as any)?.outlier_abs_threshold ?? PRICE_SYNC_OUTLIER_ABS_THRESHOLD),
  );
  const outlierRecheckMinutes = Math.max(
    1,
    toPositiveInt((priceCheckConfig as any)?.outlier_recheck_minutes, PRICE_SYNC_OUTLIER_RECHECK_MINUTES),
  );
  const priceFreezeHours = clamp(
    toPositiveInt((priceCheckConfig as any)?.price_freeze_hours, PRICE_SYNC_FREEZE_HOURS_DEFAULT),
    2,
    6,
  );
  const priceFreezeRecheckMinutes = clamp(
    toPositiveInt(
      (priceCheckConfig as any)?.price_freeze_recheck_minutes,
      PRICE_SYNC_FREEZE_RECHECK_MINUTES_DEFAULT,
    ),
    5,
    60,
  );
  const circuitErrorThreshold = Math.max(
    1,
    toPositiveInt((priceCheckConfig as any)?.circuit_error_threshold, PRICE_SYNC_CIRCUIT_ERROR_THRESHOLD),
  );
  const circuitOpenSeconds = Math.max(
    30,
    toPositiveInt((priceCheckConfig as any)?.circuit_open_seconds, PRICE_SYNC_CIRCUIT_OPEN_SECONDS),
  );
  const domainMinIntervalSeconds = clamp(
    toPositiveInt(
      (payload as any)?.min_interval_between_requests_seconds ?? (payload as any)?.minIntervalBetweenRequestsSeconds,
      toPositiveInt((priceCheckConfig as any)?.min_interval_seconds, PRICE_SYNC_RATE_MIN_INTERVAL_SECONDS),
    ),
    1,
    120,
  );
  const domainMaxIntervalSeconds = clamp(
    toPositiveInt(
      (payload as any)?.max_interval_between_requests_seconds ?? (payload as any)?.maxIntervalBetweenRequestsSeconds,
      toPositiveInt((priceCheckConfig as any)?.max_interval_seconds, PRICE_SYNC_RATE_MAX_INTERVAL_SECONDS),
    ),
    domainMinIntervalSeconds,
    180,
  );
  const debugUrl =
    typeof (payload as any)?.debug_url === "string" ? String((payload as any)?.debug_url) : null;

  const envAccessToken = Deno.env.get("MELI_ACCESS_TOKEN");
  const envRefreshToken = Deno.env.get("MELI_REFRESH_TOKEN");
  const clientId = Deno.env.get("MELI_CLIENT_ID");
  const clientSecret = Deno.env.get("MELI_CLIENT_SECRET");

  if (debugUrl) {
    const collectPriceTokens = (input: string | null) => {
      if (!input) return { count: 0, samples: [] as string[] };
      const regex = /"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi;
      const samples: string[] = [];
      let match: RegExpExecArray | null;
      let count = 0;
      while ((match = regex.exec(input))) {
        count += 1;
        if (samples.length < 3 && match[1]) samples.push(match[1]);
      }
      return { count, samples };
    };

    const countTerm = (input: string | null, term: string) => {
      if (!input) return 0;
      const regex = new RegExp(term, "gi");
      const matches = input.match(regex);
      return matches ? matches.length : 0;
    };

    const collectSnippets = (input: string | null, term: string) => {
      if (!input) return [] as string[];
      const regex = new RegExp(`.{0,40}${term}.{0,40}`, "gi");
      const matches = input.match(regex) || [];
      return matches.slice(0, 3);
    };

    const html = await fetchScrapedHtml(debugUrl);
    const directHtml = await fetchScrapedHtml(debugUrl, undefined, true);
    const jinaHtml = await fetchJinaHtml(debugUrl);

    const extract = (input: string | null) => extractStandardPriceFromHtml(input ?? "");

    return new Response(
      JSON.stringify({
        ok: true,
        debug: {
          scraper_enabled: SCRAPER_ENABLED,
          url: debugUrl,
          scraper_html_len: html?.length ?? 0,
          direct_html_len: directHtml?.length ?? 0,
          jina_html_len: jinaHtml?.length ?? 0,
          price_from_scraper: extract(html),
          price_from_direct: extract(directHtml),
          price_from_jina: extract(jinaHtml),
          price_tokens_scraper: collectPriceTokens(html),
          price_tokens_direct: collectPriceTokens(directHtml),
          price_tokens_jina: collectPriceTokens(jinaHtml),
          price_word_count_scraper: countTerm(html, "price"),
          price_word_count_direct: countTerm(directHtml, "price"),
          price_word_count_jina: countTerm(jinaHtml, "price"),
          preco_word_count_scraper: countTerm(html, "preco"),
          preco_word_count_direct: countTerm(directHtml, "preco"),
          preco_word_count_jina: countTerm(jinaHtml, "preco"),
          amount_word_count_scraper: countTerm(html, "amount"),
          amount_word_count_direct: countTerm(directHtml, "amount"),
          amount_word_count_jina: countTerm(jinaHtml, "amount"),
          preco_snippets_scraper: collectSnippets(html, "preco"),
          preco_snippets_direct: collectSnippets(directHtml, "preco"),
        },
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  }

  const runId = crypto.randomUUID();
  const runStartedAt = new Date().toISOString();
  const upsertRun = async (payload: Record<string, unknown>) => {
    const { error: runError } = await supabase
      .from("price_sync_runs")
      .upsert(payload, { onConflict: "id" });
    if (runError) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "price_sync_runs_upsert_failed",
          run_id: runId,
          error: runError.message,
        }),
      );
    }
  };

  const mapPriceSourceToState = (source: string | null | undefined) => {
    const normalized = String(source ?? "").trim().toUpperCase();
    if (normalized === PRICE_SOURCE.API_PIX) return PRICE_SOURCE.API_PIX;
    if (normalized === PRICE_SOURCE.SCRAPER) return PRICE_SOURCE.SCRAPER;
    return PRICE_SOURCE.API_BASE;
  };

  const loadDomainState = async (domain: string): Promise<DomainState> => {
    const { data } = await supabase
      .from("price_check_domain_state")
      .select("domain, last_request_at, consecutive_errors, circuit_open_until, last_status_code")
      .eq("domain", domain)
      .maybeSingle();

    return {
      domain,
      last_request_at: (data as any)?.last_request_at ?? null,
      consecutive_errors: Number((data as any)?.consecutive_errors ?? 0) || 0,
      circuit_open_until: (data as any)?.circuit_open_until ?? null,
      last_status_code:
        typeof (data as any)?.last_status_code === "number" ? (data as any)?.last_status_code : null,
    };
  };

  const saveDomainState = async (state: DomainState) => {
    await supabase.from("price_check_domain_state").upsert(
      {
        domain: state.domain,
        last_request_at: state.last_request_at ?? new Date().toISOString(),
        consecutive_errors: Math.max(0, Number(state.consecutive_errors || 0)),
        circuit_open_until: state.circuit_open_until ?? null,
        last_status_code:
          typeof state.last_status_code === "number" ? state.last_status_code : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "domain" },
    );
  };

  const claimQueueJobs = async (workerId: string, limit: number): Promise<PriceCheckJobRow[]> => {
    const { data, error } = await supabase.rpc("claim_price_check_jobs", {
      p_worker_id: workerId,
      p_limit: limit,
    });
    if (error) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "claim_price_check_jobs_failed",
          run_id: runId,
          error: error.message,
        }),
      );
      return [];
    }
    return Array.isArray(data) ? (data as PriceCheckJobRow[]) : [];
  };

  const completeQueueJob = async (
    jobId: number | null | undefined,
    status: "done" | "retry" | "failed",
    options?: { errorCode?: string | null; retrySeconds?: number | null; metaPatch?: Record<string, unknown> },
  ) => {
    if (!jobId) return;
    const retrySeconds =
      typeof options?.retrySeconds === "number" && Number.isFinite(options.retrySeconds)
        ? Math.max(5, Math.floor(options.retrySeconds))
        : null;
    await supabase.rpc("complete_price_check_job", {
      p_job_id: jobId,
      p_worker_id: runId,
      p_status: status,
      p_error_code: options?.errorCode ?? null,
      p_retry_in_seconds: retrySeconds,
      p_meta_patch: options?.metaPatch ?? {},
    });
  };

  const upsertPriceCheckState = async (input: {
    productId: string;
    finalPrice: number | null;
    finalSource: string | null;
    nextCheckAt: string;
    checkedAt?: string;
    failCount?: number;
    errorCode?: string | null;
    backoffUntil?: string | null;
    priority?: string | null;
    staleTtlMinutes?: number | null;
    suspectPrice?: number | null;
    suspectReason?: string | null;
    suspectDetectedAt?: string | null;
  }) => {
    const checkedAt = input.checkedAt ?? new Date().toISOString();
    const safePriority = String(input.priority ?? "MED").toUpperCase();
    const safeFailCount = Math.max(0, Math.floor(Number(input.failCount ?? 0)));
    const safeTtl =
      typeof input.staleTtlMinutes === "number" && Number.isFinite(input.staleTtlMinutes)
        ? Math.max(1, Math.floor(input.staleTtlMinutes))
        : 360;

    await supabase.from("price_check_state").upsert(
      {
        product_id: input.productId,
        last_checked_at: checkedAt,
        next_check_at: input.nextCheckAt,
        last_final_price: input.finalPrice,
        last_price_source: input.finalSource ? mapPriceSourceToState(input.finalSource) : null,
        priority: ["HIGH", "MED", "LOW"].includes(safePriority) ? safePriority : "MED",
        fail_count: safeFailCount,
        last_error_code: input.errorCode ?? null,
        backoff_until: input.backoffUntil ?? null,
        stale_ttl_minutes: safeTtl,
        suspect_price: input.suspectPrice ?? null,
        suspect_reason: input.suspectReason ?? null,
        suspect_detected_at: input.suspectDetectedAt ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "product_id" },
    );
  };

  const insertPriceCheckEvent = async (event: Record<string, unknown>) => {
    const { error: eventError } = await supabase.from("price_check_events").insert(event);
    if (eventError) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "price_check_event_insert_failed",
          run_id: runId,
          error: eventError.message,
        }),
      );
    }
  };

  await upsertRun({
    id: runId,
    started_at: runStartedAt,
    status: "running",
  });

  const tokenState = await ensureMeliTokens(supabase, {
    accessToken: envAccessToken,
    refreshToken: envRefreshToken,
  });

  if ("error" in tokenState) {
    await upsertRun({
      id: runId,
      finished_at: new Date().toISOString(),
      status: "failed",
      note: tokenState.error,
    });
    return new Response(JSON.stringify({ ok: false, error: tokenState.error }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const tokenRowId = tokenState.tokenRowId as number;

  let currentAccessToken = tokenState.tokens?.access_token ?? null;
  let currentRefreshToken = tokenState.tokens?.refresh_token ?? null;

  const forceTokens = Boolean(
    (payload as any)?.force_tokens || (payload as any)?.reset_tokens || (payload as any)?.forceTokens,
  );

  if (forceTokens && envAccessToken) {
    const forcedExpiresAt = addMs(new Date(), HOURS_6_MS).toISOString();
    const updateResult = await updateMeliTokens(supabase, tokenRowId, {
      access_token: envAccessToken,
      refresh_token: envRefreshToken ?? currentRefreshToken ?? null,
      expires_at: forcedExpiresAt,
    });

    if ((updateResult as any)?.error) {
      await upsertRun({
        id: runId,
        finished_at: new Date().toISOString(),
        status: "failed",
        note: (updateResult as any).error,
      });
      return new Response(JSON.stringify({ ok: false, error: (updateResult as any).error }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    currentAccessToken = envAccessToken;
    currentRefreshToken = envRefreshToken ?? currentRefreshToken ?? null;
  }

  const refresh = async () => {
    if (!currentRefreshToken) {
      return { ok: false, status: 500, body: { error: "MELI_REFRESH_TOKEN missing" } };
    }
    if (!clientId || !clientSecret) {
      return { ok: false, status: 500, body: { error: "MELI_CLIENT_ID/SECRET missing" } };
    }

    let resp: Response;
    let data: Record<string, unknown>;
    try {
      const result = await refreshAccessToken({
        refreshToken: currentRefreshToken,
        clientId,
        clientSecret,
      });
      resp = result.resp;
      data = result.data as Record<string, unknown>;
    } catch (error) {
      return {
        ok: false,
        status: 500,
        body: { error: "meli_refresh_exception", message: String(error) },
      };
    }

    const safeData = sanitizeOAuthPayload(data as any);
    if (!resp.ok) return { ok: false, status: resp.status, body: safeData };

    currentAccessToken = (data as any)?.access_token ?? null;
    currentRefreshToken = (data as any)?.refresh_token ?? currentRefreshToken ?? null;

    const expiresIn = Number((data as any)?.expires_in ?? 0);
    const expiresAt = expiresIn > 0 ? addMs(new Date(), expiresIn * 1000).toISOString() : null;

    const updateResult = await updateMeliTokens(supabase, tokenRowId, {
      access_token: currentAccessToken,
      refresh_token: currentRefreshToken,
      expires_at: expiresAt,
    });

    if ((updateResult as any)?.error) {
      return { ok: false, status: 500, body: { error: (updateResult as any).error } };
    }

    return { ok: true, status: resp.status, body: safeData };
  };

  // Se nao houver expires_at gravado, tenta um refresh 1x para hidratar.
  if (!tokenState.tokens?.expires_at) {
    const hydrate = await refresh();
    if (!hydrate.ok) {
      await upsertRun({
        id: runId,
        finished_at: new Date().toISOString(),
        status: "failed",
        note: "token_refresh_failed_on_bootstrap",
      });
      return new Response(
        JSON.stringify({
          ok: false,
          error: "token_refresh_failed_on_bootstrap",
          status: hydrate.status,
          detail: hydrate.body,
        }),
        { status: 500, headers: JSON_HEADERS },
      );
    }
  }

  const meliFetch = createMeliFetch({
    getToken: () => currentAccessToken,
    refresh,
  });

  // auth check
  const authController = new AbortController();
  const authTimer = setTimeout(() => authController.abort(), AUTH_TIMEOUT_MS);

  try {
    const authCheck = await meliFetch(`${API_BASE}/users/me`, {
      method: "GET",
      signal: authController.signal,
    });

    if (authCheck.status === 401 || authCheck.status === 403) {
      await upsertRun({
        id: runId,
        finished_at: new Date().toISOString(),
        status: "failed",
        note: "meli_auth_failed",
      });
      return new Response(
        JSON.stringify({
          ok: false,
          error: "meli_auth_failed",
          status: authCheck.status,
          body: authCheck.body,
        }),
        { status: authCheck.status, headers: JSON_HEADERS },
      );
    }
  } catch (error) {
    const message = (error as any)?.name === "AbortError" ? "timeout" : String(error);
    await upsertRun({
      id: runId,
      finished_at: new Date().toISOString(),
      status: "failed",
      note: message,
    });
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  } finally {
    clearTimeout(authTimer);
  }

  const lockTtlSeconds = Math.max(DEFAULT_LOCK_TTL_SECONDS, Math.ceil((maxRuntimeMs + 60000) / 1000));
  let lockAcquired = false;
  let lockReleased = false;
  const releaseSyncLock = async () => {
    if (!lockAcquired || lockReleased) return;
    lockReleased = true;
    try {
      await supabase.rpc("release_price_sync_lock", {
        lock_key: SYNC_LOCK_KEY,
        holder_id: runId,
      });
    } catch {
      // Non-blocking: lock has TTL.
    }
  };

  const { data: lockData, error: lockError } = await supabase.rpc("acquire_price_sync_lock", {
    lock_key: SYNC_LOCK_KEY,
    holder_id: runId,
    ttl_seconds: lockTtlSeconds,
  });

  if (lockError) {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "sync_lock_unavailable",
        run_id: runId,
        error: lockError.message,
      }),
    );
    await upsertRun({
      id: runId,
      note: `lock_unavailable:${lockError.message}`,
    });
  } else if (lockData !== true) {
    await upsertRun({
      id: runId,
      finished_at: new Date().toISOString(),
      status: "skipped",
      note: "lock_busy",
    });
    return new Response(JSON.stringify({ ok: true, run_id: runId, skipped: "lock_busy" }), {
      status: 202,
      headers: JSON_HEADERS,
    });
  } else {
    lockAcquired = true;
  }

  try {
  // ---- resto do seu loop de products (igual ao seu) ----
  const startedAt = new Date(runStartedAt);
  const stats = {
    run_id: runId,
    started_at: runStartedAt,
    finished_at: null as string | null,
    total_produtos: 0,
    total_verificados: 0,
    total_skipped: 0,
    total_200: 0,
    total_304: 0,
    total_403: 0,
    total_429: 0,
    total_404: 0,
    total_timeout: 0,
    total_erros_desconhecidos: 0,
    total_price_changes: 0,
  };

  const priceChanges: PriceChangeRow[] = [];
  const priceAnomalies: Array<Record<string, unknown>> = [];
  const runDeadlineMs = Date.now() + maxRuntimeMs;
  const itemDelayMin = clamp(ITEM_DELAY_MIN_MS, 0, 3000);
  const itemDelayMax = Math.max(itemDelayMin, clamp(ITEM_DELAY_MAX_MS, itemDelayMin, 5000));
  const maxScraperFallbacksPerRun = Math.max(0, MAX_SCRAPER_FALLBACKS_PER_RUN);
  let scraperFallbacksUsed = 0;
  let stoppedByRuntime = false;

  const now = new Date();
  const nowGraceIso = new Date(now.getTime() + SCHEDULE_GRACE_MS).toISOString();
  const queueJobs = useQueueMode ? await claimQueueJobs(runId, batchSize) : [];
  const queueJobByProductId = new Map<string, PriceCheckJobRow>();
  for (const job of queueJobs) {
    if (!queueJobByProductId.has(job.product_id)) {
      queueJobByProductId.set(job.product_id, job);
    }
  }

  let products: any[] | null = null;
  let error: { message: string } | null = null;

  if (queueJobByProductId.size > 0) {
    const orderedIds = Array.from(queueJobByProductId.keys());
    const { data: queuedProducts, error: queueProductsError } = await supabase
      .from("products")
      .select(
        "id, marketplace, external_id, ml_item_id, canonical_offer_url, name, created_at, is_featured, clicks_count, price, previous_price, previous_price_source, previous_price_expires_at, pix_price, pix_price_source, pix_price_checked_at, original_price, etag, status, last_sync, next_check_at, is_active, auto_disabled_reason, auto_disabled_at, stock_quantity, source_url, affiliate_link, specifications, price_freeze_until, price_pending_candidate, price_pending_count, price_pending_source, price_pending_seen_at",
      )
      .in("id", orderedIds)
      .eq("marketplace", "mercadolivre")
      .not("external_id", "is", null);

    if (queueProductsError) {
      error = { message: queueProductsError.message };
    } else {
      const byId = new Map((queuedProducts ?? []).map((item) => [item.id, item]));
      products = orderedIds.map((id) => byId.get(id)).filter(Boolean);

      const returnedIds = new Set((products ?? []).map((item: any) => item.id));
      for (const [productId, job] of queueJobByProductId.entries()) {
        if (!returnedIds.has(productId)) {
          await completeQueueJob(job.job_id, "failed", {
            errorCode: "product_not_found_for_job",
            metaPatch: { reason: "product_not_found_for_job" },
          });
        }
      }
    }
  }

  if (!products && !error) {
    let query = supabase
      .from("products")
      .select(
        "id, marketplace, external_id, ml_item_id, canonical_offer_url, name, created_at, is_featured, clicks_count, price, previous_price, previous_price_source, previous_price_expires_at, pix_price, pix_price_source, pix_price_checked_at, original_price, etag, status, last_sync, next_check_at, is_active, auto_disabled_reason, auto_disabled_at, stock_quantity, source_url, affiliate_link, specifications, price_freeze_until, price_pending_candidate, price_pending_count, price_pending_source, price_pending_seen_at",
      )
      .eq("marketplace", "mercadolivre")
      .or(
        "external_id.not.is.null,ml_item_id.not.is.null,canonical_offer_url.not.is.null,source_url.not.is.null,affiliate_link.not.is.null",
      )
      .neq("status", "paused")
      .neq("status", "standby");

    if (!forceSync) {
      query = query.lte("next_check_at", nowGraceIso);
    }

    const fallbackResult = await query
      .order("next_check_at", { ascending: true })
      .limit(batchSize);

    products = fallbackResult.data ?? [];
    error = fallbackResult.error ? { message: fallbackResult.error.message } : null;
  }

  if (error) {
    if (queueJobByProductId.size > 0) {
      for (const job of queueJobByProductId.values()) {
        await completeQueueJob(job.job_id, "retry", {
          errorCode: "fetch_failed_before_processing",
          retrySeconds: 600,
        });
      }
    }
    await upsertRun({
      id: runId,
      finished_at: new Date().toISOString(),
      status: "failed",
      note: error.message,
    });
    return new Response(JSON.stringify({ ok: false, error: "fetch_failed", detail: error.message, run_id: runId }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  stats.total_produtos = products?.length ?? 0;
  await upsertRun({
    id: runId,
    total_produtos: stats.total_produtos,
    ...(queueJobByProductId.size > 0
      ? { note: `queue_claimed:${queueJobByProductId.size}` }
      : {}),
  });

  if (!stats.total_produtos) {
    stats.finished_at = new Date().toISOString();
    await upsertRun({
      id: runId,
      finished_at: stats.finished_at,
      status: "empty",
      total_produtos: 0,
      total_verificados: 0,
      total_skipped: 0,
      total_200: 0,
      total_304: 0,
      total_403: 0,
      total_404: 0,
      total_429: 0,
      total_timeout: 0,
      total_erros_desconhecidos: 0,
      total_price_changes: 0,
      note: "no_products_due",
    });
    return new Response(JSON.stringify({
      ok: true,
      run_id: runId,
      stats,
      queue: {
        enabled: useQueueMode,
        claimed: queueJobByProductId.size,
      },
    }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }

  let domainState = await loadDomainState(PRICE_SYNC_DOMAIN);

  for (const product of products ?? []) {
    if (Date.now() >= runDeadlineMs) {
      stoppedByRuntime = true;
      break;
    }

    const itemStartedAt = Date.now();
    const now = new Date();
    const nextCheck = product?.next_check_at ? new Date(product.next_check_at) : null;
    const normalizedExternalId = normalizeExternalId(product.external_id);
    const catalogId =
      extractCatalogIdFromUrl((product as any)?.canonical_offer_url) ||
      extractCatalogIdFromUrl(product?.source_url) ||
      extractCatalogIdFromUrl(product?.affiliate_link);
    const preferredItemId =
      normalizeExternalId((product as any)?.ml_item_id) ||
      extractItemIdFromUrl((product as any)?.canonical_offer_url) ||
      extractItemIdFromUrl(product?.source_url) ||
      extractItemIdFromUrl(product?.affiliate_link);
    const fetchItemId = preferredItemId || normalizedExternalId;
    const enforceSameOffer = PRICE_SYNC_STRICT_OFFER_MATCH && Boolean(preferredItemId);
    const queueJob = queueJobByProductId.get(product.id) ?? null;
    const catalogPriority = extractCatalogPriority((product as any)?.specifications ?? null);
    const priorityPlan = resolvePriorityAndTtl({
      now,
      createdAt: product?.created_at ?? null,
      isFeatured: product?.is_featured ?? false,
      clicksCount: product?.clicks_count ?? 0,
      isOnSale: product?.is_on_sale ?? false,
      discountPercentage: product?.discount_percentage ?? 0,
      productName: product?.name ?? normalizedExternalId ?? "",
      catalogPriority,
      ttlByPriority,
    });

    if (
      !queueJob &&
      !forceSync &&
      nextCheck &&
      now < nextCheck &&
      nextCheck.getTime() - now.getTime() > SCHEDULE_GRACE_MS
    ) {
      stats.total_skipped += 1;
      continue;
    }

    if (!normalizedExternalId) {
      const nextCheckAt = addMs(now, HOURS_24_MS).toISOString();
      const update = { last_sync: now.toISOString(), next_check_at: nextCheckAt };
      stats.total_erros_desconhecidos += 1;
      await supabase.from("products").update(update).eq("id", product.id);
      await upsertPriceCheckState({
        productId: product.id,
        finalPrice: typeof product?.price === "number" ? product.price : null,
        finalSource: mapPriceSourceToState((product as any)?.last_price_source ?? null),
        nextCheckAt,
        checkedAt: now.toISOString(),
        failCount: 1,
        errorCode: "invalid_external_id",
        backoffUntil: addMs(now, HOURS_24_MS).toISOString(),
      });
      await completeQueueJob(queueJob?.job_id, "failed", {
        errorCode: "invalid_external_id",
      });
      stats.total_verificados += 1;

      console.log(
        JSON.stringify({
          level: "warn",
          message: "invalid_external_id",
          run_id: runId,
          item_id: String(product.external_id ?? ""),
          next_check_at: nextCheckAt,
        }),
      );
      continue;
    }

    let result: any = null;
    let errorMessage: string | null = null;
    let usedPublicFallback = false;
    let usedProductFallback = false;
    let usedCatalogReconciliation = false;
    let catalogFallbackPrice: number | null = null;
    let catalogFallbackOriginal: number | null = null;
    let preferredItemMissingInCatalog = false;
    let usedScraperFallback = false;
    let policyUnauthorized = false;
    let catalogLookupFailed = false;
    let finalSource: string | null = null;
    let rawApiPrice: number | null = null;
    let rawApiPix: number | null = null;
    let rawScrapedPrice: number | null = null;

    const perProductNow = new Date();
    const throttleDelay = computeDomainThrottleDelayMs({
      now: perProductNow,
      lastRequestAt: domainState.last_request_at ?? null,
      minIntervalSeconds: domainMinIntervalSeconds,
      maxIntervalSeconds: domainMaxIntervalSeconds,
    });
    if (throttleDelay > 0) {
      await sleep(throttleDelay);
    }

    if (isCircuitOpen(domainState, new Date())) {
      result = {
        statusCode: 429,
        error: "circuit_open",
        body: { circuit_open_until: domainState.circuit_open_until ?? null },
      };
    }

    try {
      if (result?.error === "circuit_open") {
        throw new Error("circuit_open");
      }
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        Number(Deno.env.get("FETCH_TIMEOUT_MS") || DEFAULT_TIMEOUT_MS),
      );

      let itemResp: MeliFetchResult = await meliFetch(
        `${ITEMS_BASE}${encodeURIComponent(fetchItemId)}`,
        {
        method: "GET",
        headers: product.etag ? { "If-None-Match": product.etag } : undefined,
        signal: controller.signal,
      },
      );

      if (itemResp.status === 401 || itemResp.status === 403 || itemResp.status === 404) {
        const body = (itemResp as any)?.body || {};
        const err = String((body as any)?.error || "").toLowerCase();
        const code = String((body as any)?.code || "").toLowerCase();
        const msg = String((body as any)?.message || "").toLowerCase();
        const blockedBy = String((body as any)?.blocked_by || "").toLowerCase();
        policyUnauthorized =
          blockedBy === "policyagent" ||
          code.includes("policy") ||
          code.includes("unauthorized_result") ||
          msg.includes("policy");
        const shouldFallback =
          err === "access_denied" ||
          err === "invalid_token" ||
          msg.includes("forbidden") ||
          msg.includes("invalid access token") ||
          policyUnauthorized;

        if (shouldFallback || itemResp.status === 404) {
          // Para links de catálogo, tenta o endpoint de produtos + itens.
          const catalogTarget = catalogId ?? normalizedExternalId;
          if (catalogTarget) {
            const productItemsResp = await meliFetch(
              `${API_BASE}/products/${encodeURIComponent(catalogTarget)}/items`,
              {
                method: "GET",
                signal: controller.signal,
              },
            );

            if (productItemsResp.status === 200) {
              const results = Array.isArray((productItemsResp.body as any)?.results)
                ? (productItemsResp.body as any).results
                : [];
              const best = pickBestProductItem(productItemsResp.body as any, preferredItemId, {
                strictOfferMatch: enforceSameOffer,
              });

              let minPrice: number | null = null;
              for (const item of results) {
                if (typeof item?.price === "number") {
                  if (minPrice === null || item.price < minPrice) {
                    minPrice = item.price;
                  }
                }
              }

              if (preferredItemId && !best && minPrice !== null) {
                preferredItemMissingInCatalog = true;
                priceAnomalies.push({
                  run_id: runId,
                  product_id: product.id,
                  marketplace: product.marketplace ?? null,
                  external_id: normalizedExternalId,
                  catalog_id: catalogTarget ?? null,
                  preferred_item_id: preferredItemId,
                  source_url: product?.source_url ?? null,
                  affiliate_link: product?.affiliate_link ?? null,
                  price_from_catalog: minPrice,
                  price_from_item: null,
                  note: "preferred_item_missing_in_catalog",
                  detected_at: now.toISOString(),
                });
              }

              if (best) {
                const bestId = (best as any)?.id ?? (best as any)?.item_id ?? null;
                itemResp = {
                  response: null,
                  status: 200,
                  body: {
                    id: bestId,
                    price: best.price,
                    status: "active",
                    available_quantity:
                      typeof best.available_quantity === "number" ? best.available_quantity : null,
                    permalink: best.permalink ?? null,
                  },
                  etag: null,
                };
                usedProductFallback = true;
                catalogFallbackPrice = typeof best.price === "number" ? best.price : null;
                catalogFallbackOriginal = toNumber((best as any)?.original_price);
              } else if (!preferredItemId && minPrice !== null) {
                // Sem item preferido, mantemos o menor preço do catálogo como fallback.
                catalogFallbackPrice = minPrice;
              }
            } else {
              catalogLookupFailed = true;
            }
          }

          if (!usedProductFallback) {
            itemResp = await fetchMeliPublicItem(
              fetchItemId,
              product.etag,
              controller.signal,
            );
            usedPublicFallback = true;
          }
        }
      }

      if (policyUnauthorized && preferredItemId && catalogLookupFailed) {
        priceAnomalies.push({
          run_id: runId,
          product_id: product.id,
          marketplace: product.marketplace ?? null,
          external_id: normalizedExternalId,
          catalog_id: catalogId ?? null,
          preferred_item_id: preferredItemId,
          source_url: product?.source_url ?? null,
          affiliate_link: product?.affiliate_link ?? null,
          price_from_catalog: null,
          price_from_item: null,
          note: "catalog_lookup_failed",
          detected_at: now.toISOString(),
        });
      }
      let priceSignalsFromItem = { pix: null as number | null, standard: null as number | null };
      let priceSignalsFromPrices = { pix: null as number | null, standard: null as number | null };

      if (itemResp.status === 200 && catalogId && !usedProductFallback && !enforceSameOffer) {
        const itemHasPrice = typeof toNumber((itemResp.body as any)?.price) === "number";
        if (itemHasPrice) {
          const catalogProductsResp = await meliFetch(
            `${API_BASE}/products/${encodeURIComponent(catalogId)}/items`,
            {
              method: "GET",
              signal: controller.signal,
            },
          );

          if (catalogProductsResp.status === 200) {
            const bestCatalogItem = pickBestProductItem(
              catalogProductsResp.body as any,
              preferredItemId,
              { strictOfferMatch: false },
            );
            const bestCatalogPrice = toNumber((bestCatalogItem as any)?.price);
            const bestCatalogOriginal = toNumber((bestCatalogItem as any)?.original_price);
            const itemPrice = toNumber((itemResp.body as any)?.price);

            if (
              typeof bestCatalogPrice === "number" &&
              Number.isFinite(bestCatalogPrice) &&
              bestCatalogPrice > 0
            ) {
              catalogFallbackPrice = bestCatalogPrice;
              catalogFallbackOriginal = bestCatalogOriginal;

              if (
                typeof itemPrice === "number" &&
                Number.isFinite(itemPrice) &&
                itemPrice > 0 &&
                bestCatalogPrice < itemPrice * 0.9
              ) {
                usedCatalogReconciliation = true;
                priceAnomalies.push({
                  run_id: runId,
                  product_id: product.id,
                  marketplace: product.marketplace ?? null,
                  external_id: normalizedExternalId,
                  catalog_id: catalogId ?? null,
                  preferred_item_id: preferredItemId ?? null,
                  source_url: product?.source_url ?? null,
                  affiliate_link: product?.affiliate_link ?? null,
                  price_from_catalog: bestCatalogPrice,
                  price_from_item: itemPrice,
                  note: "catalog_price_preferred_over_item",
                  detected_at: now.toISOString(),
                });
              }
            }
          }
        }
      }

      if (itemResp.status === 200 && ENABLE_PIX_PRICE) {
        priceSignalsFromItem = extractPriceSignals(itemResp.body);

        const priceItemId =
          (itemResp.body && (itemResp.body as any).id) || normalizedExternalId || null;

        const shouldFetchPrices =
          Boolean(priceItemId) &&
          (!priceSignalsFromItem.pix || !priceSignalsFromItem.standard);

        if (shouldFetchPrices) {
          const pricesResp = await meliFetch(
            `${ITEMS_BASE}${encodeURIComponent(String(priceItemId))}/prices`,
            {
              method: "GET",
              signal: controller.signal,
            },
          );

          if (pricesResp.status === 200) {
            priceSignalsFromPrices = extractPriceSignals(pricesResp.body);
          }
        }
      }

      clearTimeout(timer);

      let scrapedFallback: {
        price: number;
        pix_price: number | null;
        original_price: number | null;
      } | null = null;
      const scraperReferencePrice =
        priceSignalsFromPrices.standard ??
        priceSignalsFromItem.standard ??
        toNumber((itemResp.body as any)?.price) ??
        null;

      if (
        SCRAPER_ENABLED &&
        scraperFallbacksUsed < maxScraperFallbacksPerRun &&
        (itemResp.status !== 200 ||
          (itemResp.status === 200 &&
            (!priceSignalsFromItem.pix && !priceSignalsFromPrices.pix) &&
            enforceScraperWhenNoPix)) &&
        itemResp.status !== 304 &&
        itemResp.status !== 429
      ) {
        const scrapeUrl = resolveScrapeUrl(product, normalizedExternalId, itemResp.body);
        if (scrapeUrl) {
          scraperFallbacksUsed += 1;
          if (SCRAPER_DELAY_MS > 0) {
            await sleep(SCRAPER_DELAY_MS);
          }
          const extractFromHtml = (html: string | null) => {
            if (!html) return null;
            const scrapedPrice = extractStandardPriceFromHtml(html, scraperReferencePrice);
            if (typeof scrapedPrice === "number" && Number.isFinite(scrapedPrice) && scrapedPrice > 0) {
              const scrapedOriginalRaw = extractOriginalPriceFromHtml(html, scrapedPrice);
              const scrapedOriginal =
                typeof scrapedOriginalRaw === "number" &&
                Number.isFinite(scrapedOriginalRaw) &&
                scrapedOriginalRaw > scrapedPrice
                  ? scrapedOriginalRaw
                  : null;
              return { price: scrapedPrice, pix_price: null, original_price: scrapedOriginal };
            }
            return null;
          };

          const preferJinaFirst = itemResp.status !== 200;
          if (preferJinaFirst) {
            const jinaFirstHtml = await fetchJinaHtml(scrapeUrl);
            scrapedFallback = extractFromHtml(jinaFirstHtml);
          }

          const usesScraperProxy = Boolean(SCRAPER_API_KEY || SCRAPER_API_URL_TEMPLATE);
          const html = scrapedFallback ? null : await fetchScrapedHtml(scrapeUrl);
          const scraperParsed = extractFromHtml(html);

          let directParsed: { price: number; pix_price: number | null; original_price: number | null } | null = null;
          if (usesScraperProxy) {
            const directHtml = await fetchScrapedHtml(scrapeUrl, undefined, true);
            directParsed = extractFromHtml(directHtml);
          }

          const proxyOrDirectParsed = directParsed ?? scraperParsed;
          if (!scrapedFallback) {
            scrapedFallback = proxyOrDirectParsed;
          } else if (
            proxyOrDirectParsed &&
            proxyOrDirectParsed.price <= scrapedFallback.price * 0.92
          ) {
            scrapedFallback = proxyOrDirectParsed;
          }

          const shouldTryJina =
            !scrapedFallback ||
            scrapedFallback.original_price === null ||
            (typeof scraperReferencePrice === "number" &&
              Number.isFinite(scraperReferencePrice) &&
              scrapedFallback.price >= scraperReferencePrice * 1.1);

          if (shouldTryJina) {
            const jinaHtml = await fetchJinaHtml(scrapeUrl);
            const jinaParsed = extractFromHtml(jinaHtml);
            if (!scrapedFallback) {
              scrapedFallback = jinaParsed;
            } else if (
              jinaParsed &&
              (jinaParsed.price <= scrapedFallback.price * 0.92 ||
                (scrapedFallback.original_price === null &&
                  jinaParsed.original_price !== null &&
                  jinaParsed.price <= scrapedFallback.price * 1.1))
            ) {
              scrapedFallback = jinaParsed;
            }
          }
        }
      }

      if (itemResp.status === 304) {
        result = { statusCode: 304, etag: itemResp?.etag ?? null };
      } else if (itemResp.status === 200) {
        const standardPrice = ENABLE_PIX_PRICE
          ? priceSignalsFromItem.standard ?? priceSignalsFromPrices.standard ?? null
          : null;
        const pixCandidate = ENABLE_PIX_PRICE
          ? priceSignalsFromItem.pix ?? priceSignalsFromPrices.pix ?? null
          : null;
        const resolvedApiPrice = resolveApiStandardPrice(itemResp.body, {
          standard: standardPrice,
        });
        const reconciledStandardPrice = resolvedApiPrice;
        let resolvedPix = pickBestPixCandidate([pixCandidate], reconciledStandardPrice);
        let pixSource: "api" | null = resolvedPix !== null ? "api" : null;

        if (
          resolvedPix !== null &&
          typeof reconciledStandardPrice === "number" &&
          resolvedPix >= reconciledStandardPrice
        ) {
          resolvedPix = null;
          pixSource = null;
        }

        rawApiPrice = toNumber((itemResp.body as any)?.price);
        rawApiPix = pixCandidate;
        const finalPriceInfo = resolveFinalPriceFromSignals({
          apiPrice: reconciledStandardPrice,
          apiPixPrice: resolvedPix,
          scrapedPrice: scrapedFallback?.price ?? null,
          requireScraperWhenNoPix: enforceScraperWhenNoPix,
        });
        finalSource = finalPriceInfo.source;
        usedScraperFallback = finalPriceInfo.source === PRICE_SOURCE.SCRAPER;
        rawScrapedPrice = usedScraperFallback ? scrapedFallback?.price ?? null : null;
        const originalFromApi = toNumber((itemResp.body as any)?.original_price);
        const originalFromScraper = scrapedFallback?.original_price ?? null;
        const originalFromCatalog = catalogFallbackOriginal;
        const resolvedOriginalPrice =
          finalPriceInfo.source === PRICE_SOURCE.SCRAPER
            ? originalFromScraper
            : !enforceSameOffer && usedCatalogReconciliation
              ? originalFromCatalog ?? originalFromApi
              : originalFromApi;

        result = {
          statusCode: 200,
          price: finalPriceInfo.finalPrice ?? reconciledStandardPrice,
          original_price: resolvedOriginalPrice,
          pix_price: finalPriceInfo.source === PRICE_SOURCE.API_PIX ? (finalPriceInfo.finalPrice ?? null) : null,
          pix_source: finalPriceInfo.source === PRICE_SOURCE.API_PIX ? pixSource : null,
          raw_price_api: rawApiPrice,
          raw_price_scraper: scrapedFallback?.price ?? null,
          raw_pix_api: rawApiPix,
          final_price_source: finalPriceInfo.source ?? PRICE_SOURCE.API_BASE,
          status: mapStatus((itemResp.body as any) || {}),
          available_quantity: (itemResp.body as any)?.available_quantity,
          etag: itemResp?.etag ?? null,
        };
      } else if (scrapedFallback) {
        usedScraperFallback = true;
        rawScrapedPrice = scrapedFallback.price;
        finalSource = PRICE_SOURCE.SCRAPER;
        result = {
          statusCode: 200,
          price: scrapedFallback.price,
          original_price: scrapedFallback.original_price ?? null,
          pix_price: scrapedFallback.pix_price,
          pix_source: scrapedFallback.pix_price ? "scraper" : null,
          raw_price_api: null,
          raw_price_scraper: scrapedFallback.price,
          raw_pix_api: null,
          final_price_source: PRICE_SOURCE.SCRAPER,
          status: "active",
          etag: null,
        };
      } else if (itemResp.status === 401 || itemResp.status === 403) {
        result = { statusCode: itemResp.status, error: "meli_auth_failed", body: itemResp.body };
      } else if (itemResp.status === 404) {
        result = { statusCode: 404 };
      } else {
        result = { statusCode: itemResp.status, error: "meli_error", body: itemResp.body };
      }
    } catch (error) {
      if ((error as any)?.name === "AbortError") {
        result = { isTimeout: true, error: "timeout" };
      } else if ((error as any)?.message === "circuit_open") {
        result = {
          statusCode: 429,
          error: "circuit_open",
          body: { circuit_open_until: domainState.circuit_open_until ?? null },
        };
      } else {
        result = { statusCode: 0, error: "provider_error" };
        errorMessage = (error as any)?.message || String(error);
      }
    }

    const statusForCircuit =
      typeof result?.statusCode === "number" ? result.statusCode : result?.isTimeout ? 0 : 0;
    const nextDomainState = updateDomainCircuitState({
      state: {
        consecutiveErrors: domainState.consecutive_errors,
        circuitOpenUntil: domainState.circuit_open_until,
        lastStatusCode: domainState.last_status_code,
        lastRequestAt: domainState.last_request_at,
      },
      statusCode: statusForCircuit,
      now: new Date(),
      errorThreshold: circuitErrorThreshold,
      openSeconds: circuitOpenSeconds,
    });
    domainState = {
      domain: PRICE_SYNC_DOMAIN,
      last_request_at: nextDomainState.lastRequestAt ?? new Date().toISOString(),
      consecutive_errors: Number(nextDomainState.consecutiveErrors ?? 0) || 0,
      circuit_open_until: nextDomainState.circuitOpenUntil ?? null,
      last_status_code:
        typeof nextDomainState.lastStatusCode === "number" ? nextDomainState.lastStatusCode : null,
    };
    await saveDomainState(domainState);

    let update: Record<string, unknown> = {};
    let nextCheckAt = addMs(now, HOURS_12_MS).toISOString();
    let stateFinalPrice: number | null = typeof product?.price === "number" ? product.price : null;
    let stateFinalSource: string | null = mapPriceSourceToState((product as any)?.last_price_source ?? null);
    let stateFailCount = 0;
    let stateErrorCode: string | null = null;
    let stateBackoffUntil: string | null = null;
    let stateSuspectPrice: number | null = null;
    let stateSuspectReason: string | null = null;
    let stateSuspectDetectedAt: string | null = null;
    let queueCompletionStatus: "done" | "retry" | "failed" = "done";
    let queueRetrySeconds: number | null = null;
    let eventStatus: "updated" | "not_modified" | "backoff" | "error" | "suspect" = "updated";

    if (result?.statusCode === 304) {
      const wasAutoBlocked = product?.auto_disabled_reason === "blocked";
      const source: PriceChangeRow["source"] = usedScraperFallback
        ? "scraper"
        : usedCatalogReconciliation
          ? "catalog"
        : usedProductFallback
          ? "catalog"
          : usedPublicFallback
            ? "public"
            : "auth";
      nextCheckAt = wasAutoBlocked
        ? addMs(now, HOURS_2_MS).toISOString()
        : computeNextCheckAt({ now, ttlMinutes: priorityPlan.ttlMinutes });
      const existingPix304 =
        typeof product?.pix_price === "number" ? product.pix_price : null;
      const existingPixSource304 =
        (product as any)?.pix_price_source ?? null;
      const canKeepPix304 = shouldKeepStoredPixForPrice(
        existingPix304,
        existingPixSource304,
        Number(product?.price ?? 0),
      );
      update = {
        last_sync: now.toISOString(),
        last_price_source: source,
        last_price_verified_at: now.toISOString(),
        next_check_at: nextCheckAt,
        last_health_check_at: now.toISOString(),
        ...(String((product as any)?.data_health_status ?? "").toUpperCase() === "SUSPECT_PRICE"
          ? { data_health_status: "HEALTHY", price_mismatch_reason: null }
          : {}),
        etag: result?.etag ?? product?.etag ?? null,
        pix_price: canKeepPix304 ? existingPix304 : null,
        pix_price_source: canKeepPix304 ? existingPixSource304 : null,
        pix_price_checked_at: canKeepPix304 ? (product as any)?.pix_price_checked_at ?? null : null,
      };
      eventStatus = "not_modified";
      stateFinalPrice = typeof product?.price === "number" ? product.price : null;
      stateFinalSource = mapPriceSourceToState((product as any)?.last_price_source ?? null);
      stateFailCount = 0;
      stats.total_304 += 1;
    } else if (result?.statusCode === 200 && typeof result?.price === "number") {
      nextCheckAt = computeNextCheckAt({ now, ttlMinutes: priorityPlan.ttlMinutes });
      const mappedStatus = result?.status ?? product?.status ?? "active";
      const resolvedStatus =
        product?.status === "paused" || product?.status === "standby"
          ? product.status
          : mappedStatus;
      const wasAutoBlocked = product?.auto_disabled_reason === "blocked";
      const availableQty =
        typeof result?.available_quantity === "number" ? result.available_quantity : null;
      const resolvedStockQty =
        availableQty !== null ? Math.max(availableQty, 0) : resolvedStatus === "out_of_stock" ? 0 : null;

      const source: PriceChangeRow["source"] = usedScraperFallback
        ? "scraper"
        : usedProductFallback
          ? "catalog"
          : usedPublicFallback
            ? "public"
            : "auth";
      const currentPrice = typeof product?.price === "number" ? product.price : null;
      const stabilizedPrice = stabilizeIncomingPriceForSource(result.price, currentPrice, source);
      const didStabilizePrice = stabilizedPrice !== result.price;
      const finalPriceSource =
        (result as any)?.final_price_source ?? finalSource ?? PRICE_SOURCE.API_BASE;
      const pendingCandidate = toNumber((product as any)?.price_pending_candidate);
      const pendingCount = Math.max(0, toNonNegativeInt((product as any)?.price_pending_count, 0));
      const hasSamePendingCandidate =
        pendingCandidate !== null && Math.abs(pendingCandidate - stabilizedPrice) < 0.01;
      const pendingConfirmations = hasSamePendingCandidate ? pendingCount + 1 : 1;
      if (didStabilizePrice) {
        priceAnomalies.push({
          run_id: runId,
          product_id: product.id,
          marketplace: product.marketplace ?? null,
          external_id: normalizedExternalId,
          catalog_id: catalogId ?? null,
          preferred_item_id: preferredItemId ?? null,
          source_url: product?.source_url ?? null,
          affiliate_link: product?.affiliate_link ?? null,
          price_from_catalog: usedProductFallback ? result.price : null,
          price_from_item: usedProductFallback ? null : result.price,
          note: "untrusted_price_swing_ignored",
          detected_at: now.toISOString(),
        });
      }

      const currentOriginal = product?.original_price ?? null;
      const nextOriginal = resolveOriginalPrice({
        incomingOriginal: (result as any)?.original_price ?? null,
        storedOriginal: currentOriginal,
        price: stabilizedPrice,
        source,
      });

      const discountPercentage =
        typeof nextOriginal === "number" && nextOriginal > stabilizedPrice
          ? Math.round(((nextOriginal - stabilizedPrice) / nextOriginal) * 100)
          : 0;
      const outlier = detectPriceOutlier({
        previousPrice: currentPrice,
        newPrice: stabilizedPrice,
        percentThreshold: outlierPercentThreshold,
        absoluteThreshold: outlierAbsoluteThreshold,
      });
      const outlierConfirmedBySecondRead = outlier.isOutlier && pendingConfirmations >= 2;
      if (outlier.isOutlier && !outlierConfirmedBySecondRead) {
        const retryMinutes = outlierRecheckMinutes;
        const retrySeconds = retryMinutes * 60;
        nextCheckAt = addMs(now, retryMinutes * 60 * 1000).toISOString();
        update = {
          last_sync: now.toISOString(),
          last_price_verified_at: now.toISOString(),
          next_check_at: nextCheckAt,
          data_health_status: "SUSPECT_PRICE",
          deactivation_reason: "suspect_outlier",
          last_health_check_at: now.toISOString(),
          price_pending_candidate: stabilizedPrice,
          price_pending_count: pendingConfirmations,
          price_pending_source: finalPriceSource,
          price_pending_seen_at: now.toISOString(),
        };
        await supabase.from("products").update(update).eq("id", product.id);
        await upsertPriceCheckState({
          productId: product.id,
          finalPrice: currentPrice,
          finalSource: mapPriceSourceToState((product as any)?.last_price_source ?? null),
          nextCheckAt,
          checkedAt: now.toISOString(),
          failCount: Number(queueJob?.attempts ?? 0) + 1,
          errorCode: "suspect_outlier",
          backoffUntil: nextCheckAt,
          priority: priorityPlan.priority,
          staleTtlMinutes: priorityPlan.ttlMinutes,
          suspectPrice: stabilizedPrice,
          suspectReason: "delta_above_threshold",
          suspectDetectedAt: now.toISOString(),
        });
        await completeQueueJob(queueJob?.job_id, "retry", {
          errorCode: "suspect_outlier",
          retrySeconds,
          metaPatch: {
            previous_price: currentPrice,
            suspect_price: stabilizedPrice,
            absolute_delta: outlier.absoluteDelta,
            percent_delta: outlier.percentDelta,
            pending_confirmations: pendingConfirmations,
          },
        });
        await insertPriceCheckEvent({
          run_id: runId,
          job_id: queueJob?.job_id ?? null,
          product_id: product.id,
          domain: PRICE_SYNC_DOMAIN,
          status_code: result?.statusCode ?? null,
          raw_api_price: rawApiPrice,
          raw_api_pix: rawApiPix,
          raw_scraped_price: rawScrapedPrice,
          final_price: stabilizedPrice,
          final_price_source: (result as any)?.final_price_source ?? finalSource ?? PRICE_SOURCE.API_BASE,
          duration_ms: Date.now() - itemStartedAt,
          event_status: "suspect",
          error_code: "suspect_outlier",
          created_at: now.toISOString(),
        });
        eventStatus = "suspect";
        stats.total_verificados += 1;
        stats.total_skipped += 1;
        await sleep(randomInt(itemDelayMin, itemDelayMax));
        continue;
      }

      const isUntrustedSource = source === "catalog" || source === "scraper";
      const hasDropFromCurrent =
        typeof currentPrice === "number" && Number.isFinite(currentPrice) && currentPrice > stabilizedPrice;
      const untrustedDropAbsolute = hasDropFromCurrent ? currentPrice - stabilizedPrice : 0;
      const untrustedDropPercent = hasDropFromCurrent && currentPrice > 0
        ? (currentPrice - stabilizedPrice) / currentPrice
        : 0;
      const untrustedDropGuardTriggered =
        isUntrustedSource &&
        hasDropFromCurrent &&
        (untrustedDropAbsolute >= PRICE_SYNC_UNTRUSTED_DROP_ABS_THRESHOLD ||
          untrustedDropPercent >= PRICE_SYNC_UNTRUSTED_DROP_PERCENT_THRESHOLD);

      if (untrustedDropGuardTriggered) {
        const retryMinutes = Math.max(outlierRecheckMinutes, 15);
        const retrySeconds = retryMinutes * 60;
        nextCheckAt = addMs(now, retryMinutes * 60 * 1000).toISOString();
        update = {
          last_sync: now.toISOString(),
          last_price_verified_at: now.toISOString(),
          next_check_at: nextCheckAt,
          data_health_status: "SUSPECT_PRICE",
          deactivation_reason: "suspect_untrusted_drop",
          last_health_check_at: now.toISOString(),
          price_pending_candidate: stabilizedPrice,
          price_pending_count: pendingConfirmations,
          price_pending_source: finalPriceSource,
          price_pending_seen_at: now.toISOString(),
        };
        await supabase.from("products").update(update).eq("id", product.id);
        await upsertPriceCheckState({
          productId: product.id,
          finalPrice: currentPrice,
          finalSource: mapPriceSourceToState((product as any)?.last_price_source ?? null),
          nextCheckAt,
          checkedAt: now.toISOString(),
          failCount: Number(queueJob?.attempts ?? 0) + 1,
          errorCode: "suspect_untrusted_drop",
          backoffUntil: nextCheckAt,
          priority: priorityPlan.priority,
          staleTtlMinutes: priorityPlan.ttlMinutes,
          suspectPrice: stabilizedPrice,
          suspectReason: "catalog_or_scraper_drop_requires_trusted_confirmation",
          suspectDetectedAt: now.toISOString(),
        });
        await completeQueueJob(queueJob?.job_id, "retry", {
          errorCode: "suspect_untrusted_drop",
          retrySeconds,
          metaPatch: {
            previous_price: currentPrice,
            suspect_price: stabilizedPrice,
            absolute_delta: untrustedDropAbsolute,
            percent_delta: untrustedDropPercent,
            pending_confirmations: pendingConfirmations,
            source,
          },
        });
        await insertPriceCheckEvent({
          run_id: runId,
          job_id: queueJob?.job_id ?? null,
          product_id: product.id,
          domain: PRICE_SYNC_DOMAIN,
          status_code: result?.statusCode ?? null,
          raw_api_price: rawApiPrice,
          raw_api_pix: rawApiPix,
          raw_scraped_price: rawScrapedPrice,
          final_price: stabilizedPrice,
          final_price_source: (result as any)?.final_price_source ?? finalSource ?? PRICE_SOURCE.API_BASE,
          duration_ms: Date.now() - itemStartedAt,
          event_status: "suspect",
          error_code: "suspect_untrusted_drop",
          created_at: now.toISOString(),
        });
        eventStatus = "suspect";
        stats.total_verificados += 1;
        stats.total_skipped += 1;
        await sleep(randomInt(itemDelayMin, itemDelayMax));
        continue;
      }

      if (preferredItemId && enforceSameOffer && preferredItemMissingInCatalog) {
        const retryMinutes = outlierRecheckMinutes;
        const retrySeconds = retryMinutes * 60;
        nextCheckAt = addMs(now, retryMinutes * 60 * 1000).toISOString();
        update = {
          last_sync: now.toISOString(),
          last_price_verified_at: now.toISOString(),
          next_check_at: nextCheckAt,
          data_health_status: "SUSPECT_PRICE",
          deactivation_reason: "suspect_offer_binding",
          last_health_check_at: now.toISOString(),
          price_pending_candidate: stabilizedPrice,
          price_pending_count: pendingConfirmations,
          price_pending_source: finalPriceSource,
          price_pending_seen_at: now.toISOString(),
        };
        await supabase.from("products").update(update).eq("id", product.id);
        await upsertPriceCheckState({
          productId: product.id,
          finalPrice: currentPrice,
          finalSource: mapPriceSourceToState((product as any)?.last_price_source ?? null),
          nextCheckAt,
          checkedAt: now.toISOString(),
          failCount: Number(queueJob?.attempts ?? 0) + 1,
          errorCode: "preferred_item_missing_in_catalog",
          backoffUntil: nextCheckAt,
          priority: priorityPlan.priority,
          staleTtlMinutes: priorityPlan.ttlMinutes,
          suspectPrice: stabilizedPrice,
          suspectReason: "offer_binding_unresolved",
          suspectDetectedAt: now.toISOString(),
        });
        await completeQueueJob(queueJob?.job_id, "retry", {
          errorCode: "preferred_item_missing_in_catalog",
          retrySeconds,
          metaPatch: {
            preferred_item_id: preferredItemId,
            catalog_id: catalogId,
            suspect_price: stabilizedPrice,
          },
        });
        await insertPriceCheckEvent({
          run_id: runId,
          job_id: queueJob?.job_id ?? null,
          product_id: product.id,
          domain: PRICE_SYNC_DOMAIN,
          status_code: result?.statusCode ?? null,
          raw_api_price: rawApiPrice,
          raw_api_pix: rawApiPix,
          raw_scraped_price: rawScrapedPrice,
          final_price: stabilizedPrice,
          final_price_source: (result as any)?.final_price_source ?? finalSource ?? PRICE_SOURCE.API_BASE,
          duration_ms: Date.now() - itemStartedAt,
          event_status: "suspect",
          error_code: "preferred_item_missing_in_catalog",
          created_at: now.toISOString(),
        });
        eventStatus = "suspect";
        stats.total_verificados += 1;
        stats.total_skipped += 1;
        await sleep(randomInt(itemDelayMin, itemDelayMax));
        continue;
      }

      if (usedProductFallback && !preferredItemId && typeof currentPrice === "number" && Number.isFinite(currentPrice) && currentPrice > 0) {
        const retryMinutes = Math.max(outlierRecheckMinutes, 15);
        const retrySeconds = retryMinutes * 60;
        nextCheckAt = addMs(now, retryMinutes * 60 * 1000).toISOString();
        update = {
          last_sync: now.toISOString(),
          last_price_verified_at: now.toISOString(),
          next_check_at: nextCheckAt,
          data_health_status: "SUSPECT_PRICE",
          deactivation_reason: "suspect_catalog_without_preferred_item",
          last_health_check_at: now.toISOString(),
          price_pending_candidate: stabilizedPrice,
          price_pending_count: pendingConfirmations,
          price_pending_source: finalPriceSource,
          price_pending_seen_at: now.toISOString(),
        };
        await supabase.from("products").update(update).eq("id", product.id);
        await upsertPriceCheckState({
          productId: product.id,
          finalPrice: currentPrice,
          finalSource: mapPriceSourceToState((product as any)?.last_price_source ?? null),
          nextCheckAt,
          checkedAt: now.toISOString(),
          failCount: Number(queueJob?.attempts ?? 0) + 1,
          errorCode: "catalog_without_preferred_item",
          backoffUntil: nextCheckAt,
          priority: priorityPlan.priority,
          staleTtlMinutes: priorityPlan.ttlMinutes,
          suspectPrice: stabilizedPrice,
          suspectReason: "catalog_fallback_without_item_binding",
          suspectDetectedAt: now.toISOString(),
        });
        await completeQueueJob(queueJob?.job_id, "retry", {
          errorCode: "catalog_without_preferred_item",
          retrySeconds,
          metaPatch: {
            preferred_item_id: preferredItemId,
            catalog_id: catalogId,
            previous_price: currentPrice,
            suspect_price: stabilizedPrice,
            source,
          },
        });
        await insertPriceCheckEvent({
          run_id: runId,
          job_id: queueJob?.job_id ?? null,
          product_id: product.id,
          domain: PRICE_SYNC_DOMAIN,
          status_code: result?.statusCode ?? null,
          raw_api_price: rawApiPrice,
          raw_api_pix: rawApiPix,
          raw_scraped_price: rawScrapedPrice,
          final_price: stabilizedPrice,
          final_price_source: (result as any)?.final_price_source ?? finalSource ?? PRICE_SOURCE.API_BASE,
          duration_ms: Date.now() - itemStartedAt,
          event_status: "suspect",
          error_code: "catalog_without_preferred_item",
          created_at: now.toISOString(),
        });
        eventStatus = "suspect";
        stats.total_verificados += 1;
        stats.total_skipped += 1;
        await sleep(randomInt(itemDelayMin, itemDelayMax));
        continue;
      }

      const hasPriceChange =
        product?.price === null || product?.price === undefined || stabilizedPrice !== product.price;
      const hasDropChange =
        hasPriceChange &&
        typeof product?.price === "number" &&
        Number.isFinite(product.price) &&
        product.price > stabilizedPrice;
      const isOnSale = discountPercentage > 0;
      const isReliableSource = source === "auth" || source === "public";
      const shouldReactivate =
        wasAutoBlocked && resolvedStatus !== "paused" && resolvedStatus !== "standby" && isReliableSource;
      const isActive = shouldReactivate ? true : product?.is_active ?? true;

      if (wasAutoBlocked && !isReliableSource) {
        nextCheckAt = addMs(now, HOURS_2_MS).toISOString();
        update = {
          last_sync: now.toISOString(),
          next_check_at: nextCheckAt,
          is_active: product?.is_active ?? true,
          last_health_check_at: now.toISOString(),
        };
        stats.total_200 += 1;
        const { error: updateError } = await supabase.from("products").update(update).eq("id", product.id);
        const etagBefore = await maskEtag(product?.etag);
        const etagAfter = await maskEtag(result?.etag ?? product?.etag ?? null);
        const durationMs = Date.now() - itemStartedAt;
        console.log(
          JSON.stringify({
            level: "info",
            message: "price_check",
            run_id: runId,
            item_id: normalizedExternalId,
            item_id_raw:
              String(product.external_id ?? "").toUpperCase() !== normalizedExternalId
                ? String(product.external_id ?? "")
                : undefined,
            status_http: result?.statusCode ?? null,
            next_check_at: nextCheckAt,
            duration_ms: durationMs,
            used_public_fallback: usedPublicFallback,
            used_product_fallback: usedProductFallback,
            used_scraper_fallback: usedScraperFallback,
            price_source: source,
            raw_price_api: (result as any)?.raw_price_api ?? null,
            raw_price_scraper: (result as any)?.raw_price_scraper ?? null,
            raw_pix_api: (result as any)?.raw_pix_api ?? null,
            final_price: stabilizedPrice,
            final_price_source: (result as any)?.final_price_source ?? finalSource ?? "API_BASE",
            etag_before: etagBefore,
            etag_after: etagAfter,
            error: updateError?.message || errorMessage || result?.error || null,
          }),
        );
        await upsertPriceCheckState({
          productId: product.id,
          finalPrice: typeof product?.price === "number" ? product.price : null,
          finalSource: mapPriceSourceToState((product as any)?.last_price_source ?? null),
          nextCheckAt,
          checkedAt: now.toISOString(),
          failCount: Number(queueJob?.attempts ?? 0) + 1,
          errorCode: "untrusted_source",
          backoffUntil: nextCheckAt,
          priority: priorityPlan.priority,
          staleTtlMinutes: priorityPlan.ttlMinutes,
        });
        await completeQueueJob(queueJob?.job_id, "retry", {
          errorCode: "untrusted_source",
          retrySeconds: 2 * 60 * 60,
        });
        await insertPriceCheckEvent({
          run_id: runId,
          job_id: queueJob?.job_id ?? null,
          product_id: product.id,
          domain: PRICE_SYNC_DOMAIN,
          status_code: result?.statusCode ?? null,
          raw_api_price: rawApiPrice,
          raw_api_pix: rawApiPix,
          raw_scraped_price: rawScrapedPrice,
          final_price: typeof product?.price === "number" ? product.price : null,
          final_price_source: mapPriceSourceToState((product as any)?.last_price_source ?? null),
          duration_ms: Date.now() - itemStartedAt,
          event_status: "backoff",
          error_code: "untrusted_source",
          created_at: now.toISOString(),
        });
        stats.total_verificados += 1;
        await sleep(randomInt(itemDelayMin, itemDelayMax));
        continue;
      }

      const freezeUntilMs = parseDateMs((product as any)?.price_freeze_until);
      const isPriceFreezeActive = freezeUntilMs !== null && freezeUntilMs > now.getTime();
      const freezeAllowsConfirmedChange =
        isPriceFreezeActive && hasPriceChange && pendingConfirmations >= 2;
      const freezeBlocksChange = isPriceFreezeActive && hasPriceChange && !freezeAllowsConfirmedChange;

      if (freezeBlocksChange) {
        const freezeRecheckAtMs = Math.min(
          freezeUntilMs ?? addMs(now, priceFreezeRecheckMinutes * 60 * 1000).getTime(),
          now.getTime() + priceFreezeRecheckMinutes * 60 * 1000,
        );
        nextCheckAt = new Date(freezeRecheckAtMs).toISOString();
        update = {
          last_sync: now.toISOString(),
          next_check_at: nextCheckAt,
          last_health_check_at: now.toISOString(),
          price_pending_candidate: stabilizedPrice,
          price_pending_count: pendingConfirmations,
          price_pending_source: finalPriceSource,
          price_pending_seen_at: now.toISOString(),
          ...(String((product as any)?.data_health_status ?? "").toUpperCase() === "SUSPECT_PRICE"
            ? { data_health_status: "HEALTHY", deactivation_reason: null, price_mismatch_reason: null }
            : {}),
        };
        eventStatus = "frozen";
        stateFinalPrice = typeof product?.price === "number" ? product.price : null;
        stateFinalSource = mapPriceSourceToState((product as any)?.last_price_source ?? null);
        stateFailCount = 0;
        queueCompletionStatus = "retry";
        queueRetrySeconds = Math.max(
          60,
          Math.floor((new Date(nextCheckAt).getTime() - now.getTime()) / 1000),
        );
        stats.total_200 += 1;
        stats.total_skipped += 1;
      } else {
      const resolvedPix = finalPriceSource === PRICE_SOURCE.API_PIX ? stabilizedPrice : null;
      const resolvedPixSource = resolvedPix !== null ? "api" : null;
      const resolvedPixCheckedAt = resolvedPix !== null ? now.toISOString() : null;
      const previousHistoryTtlHours = Math.max(1, Math.floor(PREVIOUS_PRICE_HISTORY_TTL_HOURS || 48));
      const catalogIncomingHistoryTtlHours = Math.max(1, Math.min(previousHistoryTtlHours, 24));
      const incomingListPromoAnchor = normalizeHistoryPromoAnchor(
        (result as any)?.original_price ?? null,
        stabilizedPrice,
        {
          minDiscountRatio: 0.02,
          maxDiscountRatio: 0.75,
          maxRatio: 1.9,
        },
      );
      const existingHistoryExpiryMs = parseDateMs((product as any)?.previous_price_expires_at);
      const hasValidStoredHistory =
        String((product as any)?.previous_price_source ?? "").toUpperCase() === "HISTORY" &&
        typeof (product as any)?.previous_price === "number" &&
        (product as any).previous_price > stabilizedPrice &&
        existingHistoryExpiryMs !== null &&
        existingHistoryExpiryMs > now.getTime();
      const canUseCatalogIncomingPromoAnchor =
        source === "catalog" &&
        incomingListPromoAnchor !== null &&
        !hasDropChange;
      const resolvedHistoryPreviousPrice = hasDropChange
        ? product.price
        : canUseCatalogIncomingPromoAnchor
          ? incomingListPromoAnchor
        : hasValidStoredHistory
          ? (product as any).previous_price
          : null;
      const resolvedHistoryPreviousSource = resolvedHistoryPreviousPrice !== null ? "HISTORY" : null;
      const resolvedHistoryPreviousExpiry = resolvedHistoryPreviousPrice !== null
        ? (hasDropChange
          ? addMs(now, previousHistoryTtlHours * 60 * 60 * 1000).toISOString()
          : canUseCatalogIncomingPromoAnchor
            ? addMs(now, catalogIncomingHistoryTtlHours * 60 * 60 * 1000).toISOString()
            : ((product as any)?.previous_price_expires_at ?? null))
        : null;

      update = {
        previous_price: resolvedHistoryPreviousPrice,
        previous_price_source: resolvedHistoryPreviousSource,
        previous_price_expires_at: resolvedHistoryPreviousExpiry,
        original_price: nextOriginal,
        price: stabilizedPrice,
        last_price_source: source,
        last_price_verified_at: now.toISOString(),
        data_health_status: "HEALTHY",
        deactivation_reason: null,
        last_health_check_at: now.toISOString(),
        pix_price: resolvedPix,
        pix_price_source: resolvedPix !== null ? resolvedPixSource : null,
        pix_price_checked_at: resolvedPix !== null ? resolvedPixCheckedAt : null,
        discount_percentage: discountPercentage,
        is_on_sale: isOnSale,
        is_active: isActive,
        price_pending_candidate: null,
        price_pending_count: 0,
        price_pending_source: null,
        price_pending_seen_at: null,
        ...(shouldReactivate ? { auto_disabled_reason: null, auto_disabled_at: null } : {}),
        ...(resolvedStockQty !== null ? { stock_quantity: resolvedStockQty } : {}),
        ...(hasPriceChange ? { detected_price: stabilizedPrice, detected_at: now.toISOString() } : {}),
        etag: result?.etag ?? product?.etag ?? null,
        status: resolvedStatus,
        last_sync: now.toISOString(),
        next_check_at: nextCheckAt,
      };
      eventStatus = "updated";
      stateFinalPrice = stabilizedPrice;
      stateFinalSource = mapPriceSourceToState(finalPriceSource);
      stateFailCount = 0;
      stats.total_200 += 1;
      }

        if (hasPriceChange && eventStatus !== "frozen") {
          priceChanges.push({
            run_id: runId,
            product_id: product.id,
            marketplace: product.marketplace ?? null,
            external_id: normalizedExternalId,
            old_price: product?.price ?? null,
            new_price: stabilizedPrice,
            discount_percentage: discountPercentage,
            is_on_sale: isOnSale,
            source,
          });
        }

        if (usedProductFallback && catalogFallbackPrice !== null) {
          priceAnomalies.push({
            run_id: runId,
            product_id: product.id,
            marketplace: product.marketplace ?? null,
            external_id: normalizedExternalId,
            catalog_id: catalogId ?? null,
            preferred_item_id: preferredItemId ?? null,
            source_url: product?.source_url ?? null,
            affiliate_link: product?.affiliate_link ?? null,
            price_from_catalog: catalogFallbackPrice,
            price_from_item: null,
            note: "catalog_fallback",
            detected_at: now.toISOString(),
          });
        }

        if (usedCatalogReconciliation && catalogFallbackPrice !== null) {
          priceAnomalies.push({
            run_id: runId,
            product_id: product.id,
            marketplace: product.marketplace ?? null,
            external_id: normalizedExternalId,
            catalog_id: catalogId ?? null,
            preferred_item_id: preferredItemId ?? null,
            source_url: product?.source_url ?? null,
            affiliate_link: product?.affiliate_link ?? null,
            price_from_catalog: catalogFallbackPrice,
            price_from_item: toNumber((itemResp.body as any)?.price),
            note: "catalog_reconciliation_applied",
            detected_at: now.toISOString(),
          });
        }
    } else if (result?.statusCode === 404) {
      nextCheckAt = addMs(now, HOURS_24_MS).toISOString();
      update = {
        last_sync: now.toISOString(),
        next_check_at: nextCheckAt,
        data_health_status: "API_MISSING",
        deactivation_reason: "http_404",
        last_health_check_at: now.toISOString(),
      };
      eventStatus = "backoff";
      stateFailCount = Number(queueJob?.attempts ?? 0) + 1;
      stateErrorCode = "http_404";
      stateBackoffUntil = nextCheckAt;
      queueCompletionStatus = "retry";
      queueRetrySeconds = 24 * 60 * 60;
      stats.total_404 += 1;
    } else if (result?.statusCode === 403) {
      const body = (result as any)?.body || {};
      const message = String((body as any)?.message || "").toLowerCase();
      const isAccessDenied = (body as any)?.error === "access_denied" || message.includes("forbidden");
      const code = String((body as any)?.code || (body as any)?.error || "").toLowerCase();
      const blockedBy = String((body as any)?.blocked_by || "").toLowerCase();
      const isPolicyUnauthorized =
        policyUnauthorized ||
        blockedBy === "policyagent" ||
        code.includes("policy") ||
        code.includes("unauthorized_result") ||
        message.includes("policy");

      if (isPolicyUnauthorized) {
        priceAnomalies.push({
          run_id: runId,
          product_id: product.id,
          marketplace: product.marketplace ?? null,
          external_id: normalizedExternalId,
          catalog_id: catalogId ?? null,
          preferred_item_id: preferredItemId ?? null,
          source_url: product?.source_url ?? null,
          affiliate_link: product?.affiliate_link ?? null,
          price_from_catalog: catalogFallbackPrice ?? null,
          price_from_item: null,
          note: "policy_blocked",
          detected_at: now.toISOString(),
        });
        nextCheckAt = addMs(now, HOURS_6_MS).toISOString();
        update = {
          last_sync: now.toISOString(),
          next_check_at: nextCheckAt,
          auto_disabled_reason: "blocked",
          auto_disabled_at: now.toISOString(),
          data_health_status: "API_MISSING",
          deactivation_reason: "policy_blocked",
          last_health_check_at: now.toISOString(),
        };
        stateErrorCode = "policy_blocked";
        stateBackoffUntil = nextCheckAt;
        queueCompletionStatus = "retry";
        queueRetrySeconds = 6 * 60 * 60;
      } else if (isAccessDenied) {
        nextCheckAt = addMs(now, HOURS_24_MS).toISOString();
        update = {
          last_sync: now.toISOString(),
          next_check_at: nextCheckAt,
          last_health_check_at: now.toISOString(),
        };
        stateErrorCode = "http_403";
        stateBackoffUntil = nextCheckAt;
        queueCompletionStatus = "retry";
        queueRetrySeconds = 24 * 60 * 60;
      } else {
        nextCheckAt = addMs(now, HOURS_12_MS).toISOString();
        update = {
          last_sync: now.toISOString(),
          next_check_at: nextCheckAt,
          last_health_check_at: now.toISOString(),
        };
        stateErrorCode = "http_403_other";
        stateBackoffUntil = nextCheckAt;
        queueCompletionStatus = "retry";
        queueRetrySeconds = 12 * 60 * 60;
      }

      eventStatus = "backoff";
      stateFailCount = Number(queueJob?.attempts ?? 0) + 1;
      stats.total_403 += 1;
    } else if (result?.statusCode === 429 || result?.isTimeout) {
      const failCount = Number(queueJob?.attempts ?? 0) + 1;
      const backoffUntil = computeBackoffUntil({
        failCount,
        now,
        baseMs: 120000,
        maxMs: HOURS_12_MS,
      });
      nextCheckAt = backoffUntil;
      update = {
        last_sync: now.toISOString(),
        next_check_at: nextCheckAt,
        last_health_check_at: now.toISOString(),
      };
      eventStatus = "backoff";
      stateFailCount = failCount;
      stateErrorCode = result?.statusCode === 429 ? "http_429" : "timeout";
      stateBackoffUntil = backoffUntil;
      queueCompletionStatus = "retry";
      queueRetrySeconds = Math.max(60, Math.floor((new Date(backoffUntil).getTime() - now.getTime()) / 1000));
      if (result?.statusCode === 429) stats.total_429 += 1;
      if (result?.isTimeout) stats.total_timeout += 1;
    } else {
      stats.total_erros_desconhecidos += 1;
      const failCount = Number(queueJob?.attempts ?? 0) + 1;
      const backoffUntil = computeBackoffUntil({
        failCount,
        now,
        baseMs: 120000,
        maxMs: HOURS_12_MS,
      });
      nextCheckAt = backoffUntil;
      update = {
        last_sync: now.toISOString(),
        next_check_at: nextCheckAt,
        last_health_check_at: now.toISOString(),
      };
      eventStatus = "error";
      stateFailCount = failCount;
      stateErrorCode = result?.error ? String(result.error) : "unknown_error";
      stateBackoffUntil = backoffUntil;
      queueCompletionStatus = "retry";
      queueRetrySeconds = Math.max(60, Math.floor((new Date(backoffUntil).getTime() - now.getTime()) / 1000));
    }

    stats.total_verificados += 1;

    const { error: updateError } = await supabase.from("products").update(update).eq("id", product.id);

    // log simples (mantive seu padrao)
    const etagBefore = await maskEtag(product?.etag);
    const etagAfter = await maskEtag(result?.etag ?? product?.etag ?? null);
    const durationMs = Date.now() - itemStartedAt;

    console.log(
      JSON.stringify({
        level: "info",
        message: "price_check",
        run_id: runId,
        item_id: normalizedExternalId,
        item_id_raw:
          String(product.external_id ?? "").toUpperCase() !== normalizedExternalId
            ? String(product.external_id ?? "")
            : undefined,
        status_http: result?.statusCode ?? null,
        next_check_at: nextCheckAt,
        duration_ms: durationMs,
        used_public_fallback: usedPublicFallback,
        used_product_fallback: usedProductFallback,
        used_scraper_fallback: usedScraperFallback,
        price_source: (update as any)?.last_price_source ?? null,
        raw_price_api: (result as any)?.raw_price_api ?? null,
        raw_price_scraper: (result as any)?.raw_price_scraper ?? null,
        raw_pix_api: (result as any)?.raw_pix_api ?? null,
        final_price: typeof (update as any)?.price === "number" ? (update as any).price : null,
        final_price_source:
          (result as any)?.final_price_source ??
          (typeof (update as any)?.pix_price === "number" && (update as any).pix_price > 0
            ? PRICE_SOURCE.API_PIX
            : PRICE_SOURCE.API_BASE),
        etag_before: etagBefore,
        etag_after: etagAfter,
        error: updateError?.message || errorMessage || result?.error || null,
      }),
    );

    const stateNextCheckAt =
      typeof (update as any)?.next_check_at === "string" ? (update as any).next_check_at : nextCheckAt;
    const statePriceToPersist =
      typeof (update as any)?.price === "number" ? (update as any).price : stateFinalPrice;
    const stateSourceToPersist =
      (result as any)?.final_price_source
        ? mapPriceSourceToState((result as any)?.final_price_source)
        : stateFinalSource;

    await upsertPriceCheckState({
      productId: product.id,
      finalPrice: statePriceToPersist,
      finalSource: stateSourceToPersist,
      nextCheckAt: stateNextCheckAt,
      checkedAt: now.toISOString(),
      failCount: Math.max(0, stateFailCount),
      errorCode: updateError?.message || stateErrorCode || errorMessage || result?.error || null,
      backoffUntil: stateBackoffUntil,
      priority: priorityPlan.priority,
      staleTtlMinutes: priorityPlan.ttlMinutes,
      suspectPrice: stateSuspectPrice,
      suspectReason: stateSuspectReason,
      suspectDetectedAt: stateSuspectDetectedAt,
    });

    const completionErrorCode =
      updateError?.message || stateErrorCode || errorMessage || result?.error || null;
    if (updateError) {
      await completeQueueJob(queueJob?.job_id, "retry", {
        errorCode: String(completionErrorCode ?? "update_failed"),
        retrySeconds: Math.max(60, queueRetrySeconds ?? 600),
      });
    } else if (queueCompletionStatus === "retry") {
      await completeQueueJob(queueJob?.job_id, "retry", {
        errorCode: completionErrorCode ? String(completionErrorCode) : null,
        retrySeconds: Math.max(60, queueRetrySeconds ?? 600),
      });
    } else if (queueCompletionStatus === "failed") {
      await completeQueueJob(queueJob?.job_id, "failed", {
        errorCode: completionErrorCode ? String(completionErrorCode) : null,
      });
    } else {
      await completeQueueJob(queueJob?.job_id, "done", {
        errorCode: completionErrorCode ? String(completionErrorCode) : null,
      });
    }

    await insertPriceCheckEvent({
      run_id: runId,
      job_id: queueJob?.job_id ?? null,
      product_id: product.id,
      domain: PRICE_SYNC_DOMAIN,
      status_code: result?.statusCode ?? null,
      raw_api_price: rawApiPrice ?? (result as any)?.raw_price_api ?? null,
      raw_api_pix: rawApiPix ?? (result as any)?.raw_pix_api ?? null,
      raw_scraped_price: rawScrapedPrice ?? (result as any)?.raw_price_scraper ?? null,
      final_price: statePriceToPersist,
      final_price_source:
        (result as any)?.final_price_source ?? stateSourceToPersist ?? mapPriceSourceToState((product as any)?.last_price_source ?? null),
      duration_ms: durationMs,
      event_status: eventStatus,
      error_code: completionErrorCode ? String(completionErrorCode) : null,
      created_at: now.toISOString(),
    });

    if (Date.now() >= runDeadlineMs) {
      stoppedByRuntime = true;
      break;
    }

    await sleep(randomInt(itemDelayMin, itemDelayMax));
  }

  stats.finished_at = new Date().toISOString();
  stats.total_price_changes = priceChanges.length;

  await upsertRun({
    id: runId,
    finished_at: stats.finished_at,
    status: "success",
    total_produtos: stats.total_produtos,
    total_verificados: stats.total_verificados,
    total_skipped: stats.total_skipped,
    total_200: stats.total_200,
    total_304: stats.total_304,
    total_403: stats.total_403,
    total_404: stats.total_404,
    total_429: stats.total_429,
    total_timeout: stats.total_timeout,
    total_erros_desconhecidos: stats.total_erros_desconhecidos,
    total_price_changes: stats.total_price_changes,
    ...(stoppedByRuntime ? { note: "runtime_budget_reached" } : {}),
  });

  if (priceChanges.length) {
    const { error: changesError } = await supabase
      .from("price_sync_changes")
      .insert(priceChanges);

    if (changesError) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "price_changes_insert_failed",
          run_id: runId,
          error: changesError.message,
        }),
      );
    }
  }

  if (priceAnomalies.length) {
    const { error: anomaliesError } = await supabase
      .from("price_sync_anomalies")
      .insert(priceAnomalies);

    if (anomaliesError) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "price_anomalies_insert_failed",
          run_id: runId,
          error: anomaliesError.message,
        }),
      );
    }
  }

  const triggerPriceDropAlerts = async () => {
    const alertsUrl =
      Deno.env.get("PRICE_DROP_ALERTS_URL") ??
      `${SUPABASE_URL}/functions/v1/price-drop-alerts`;
    if (!alertsUrl || !cronSecret) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const resp = await fetch(alertsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": cronSecret,
        },
        body: JSON.stringify({
          source: "price-sync",
          run_id: runId,
          total_changes: priceChanges.length,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        console.warn(
          JSON.stringify({
            level: "warn",
            message: "price_drop_alerts_failed",
            run_id: runId,
            status: resp.status,
            body: text,
          }),
        );
      }
    } catch (error) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "price_drop_alerts_exception",
          run_id: runId,
          error: String(error),
        }),
      );
    } finally {
      clearTimeout(timeout);
    }
  };

  const skipAlerts = toBoolean(
    (payload as any)?.skip_alerts ?? (payload as any)?.skipAlerts,
    false,
  );
  if (!skipAlerts && priceChanges.length) {
    await triggerPriceDropAlerts();
  }

  let continuationQueued = false;
  let continuationError: string | null = null;
  let remainingDueCount: number | null = null;
  const shouldEvaluateContinuation =
    allowContinuation &&
    continuationDepth < maxContinuations &&
    (stoppedByRuntime || (products?.length ?? 0) >= batchSize);

  if (shouldEvaluateContinuation) {
    const dueResult = useQueueMode
      ? await supabase
          .from("price_check_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "queued")
          .lte("available_at", new Date().toISOString())
      : forceSync
        ? await supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("marketplace", "mercadolivre")
            .not("external_id", "is", null)
            .neq("status", "paused")
            .neq("status", "standby")
        : await supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("marketplace", "mercadolivre")
            .not("external_id", "is", null)
            .neq("status", "paused")
            .neq("status", "standby")
            .lte("next_check_at", new Date(Date.now() + SCHEDULE_GRACE_MS).toISOString());

    if (dueResult.error) {
      continuationError = dueResult.error.message;
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "continuation_due_count_failed",
          run_id: runId,
          error: dueResult.error.message,
        }),
      );
    } else {
      remainingDueCount = dueResult.count ?? 0;
      if ((remainingDueCount ?? 0) > 0) {
        await releaseSyncLock();

        const continuationPayload = {
          source: source === "cron" ? "cron_continuation" : "manual_continuation",
          parent_run_id: runId,
          continuation_depth: continuationDepth + 1,
          max_continuations: maxContinuations,
          batch_size: batchSize,
          max_runtime_ms: maxRuntimeMs,
          allow_continuation: true,
          use_queue: useQueueMode,
        };

        const { error: enqueueError } = await supabase.rpc("enqueue_price_sync", {
          p_payload: continuationPayload,
        });

        if (enqueueError) {
          continuationError = enqueueError.message;
          console.warn(
            JSON.stringify({
              level: "warn",
              message: "continuation_enqueue_failed",
              run_id: runId,
              error: enqueueError.message,
              payload: continuationPayload,
            }),
          );
        } else {
          continuationQueued = true;
        }
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      run_id: runId,
      stats,
      queue: {
        enabled: useQueueMode,
        claimed: queueJobByProductId.size,
      },
      continuation: {
        queued: continuationQueued,
        depth: continuationDepth,
        max: maxContinuations,
        remaining_due: remainingDueCount,
        error: continuationError,
      },
    }),
    {
    status: 200,
    headers: JSON_HEADERS,
    },
  );
  } finally {
    await releaseSyncLock();
  }
});

