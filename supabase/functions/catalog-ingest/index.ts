
// @ts-ignore - Remote module resolution is handled by Deno at runtime.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  SITE_CATEGORIES,
  evaluateFitnessGate,
  normalizeFitnessText,
} from "./fitness_gate.ts";

const Deno = (globalThis as unknown as {
  Deno: {
    env: { get: (key: string) => string | undefined };
    serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  };
}).Deno;

const API_BASE = "https://api.mercadolibre.com";
const OAUTH_URL = `${API_BASE}/oauth/token`;
const DEFAULT_SITE_ID = "MLB";

const REQUEST_TIMEOUT_MS = Number(Deno?.env?.get?.("CATALOG_INGEST_REQUEST_TIMEOUT_MS") ?? "9000");
const DEFAULT_MAX_ITEMS_PER_MAPPING = Number(
  Deno?.env?.get?.("CATALOG_INGEST_DEFAULT_MAX_ITEMS_PER_MAPPING") ?? "120",
);
const DEFAULT_MAX_MAPPINGS = Number(Deno?.env?.get?.("CATALOG_INGEST_DEFAULT_MAX_MAPPINGS") ?? "20");
const DEFAULT_MAX_RUNTIME_MS = Number(Deno?.env?.get?.("CATALOG_INGEST_MAX_RUNTIME_MS") ?? "85000");
const SEARCH_PAGE_LIMIT = 50;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 500;
const rawMaxItemsHardCap = Number(Deno?.env?.get?.("CATALOG_INGEST_MAX_ITEMS_HARD_CAP") ?? "60");
const MAX_ITEMS_HARD_CAP = Number.isFinite(rawMaxItemsHardCap)
  ? Math.max(10, Math.floor(rawMaxItemsHardCap))
  : 60;

const LOCK_KEY = Deno?.env?.get?.("CATALOG_INGEST_LOCK_KEY") ?? "catalog_ingest_edge";
const DEFAULT_LOCK_TTL_SECONDS = Number(
  Deno?.env?.get?.("CATALOG_INGEST_LOCK_TTL_SECONDS") ?? "900",
);

const PIX_MIN_RATIO_VS_STANDARD = Number(
  Deno?.env?.get?.("CATALOG_INGEST_PIX_MIN_RATIO") ?? "0.2",
);
const PIX_MIN_DISCOUNT_ABS = Number(
  Deno?.env?.get?.("CATALOG_INGEST_PIX_MIN_DISCOUNT_ABS") ?? "0.5",
);
const PIX_MIN_DISCOUNT_PERCENT = Number(
  Deno?.env?.get?.("CATALOG_INGEST_PIX_MIN_DISCOUNT_PERCENT") ?? "0.005",
);
const MIN_SELLER_REPUTATION = Number(
  Deno?.env?.get?.("CATALOG_INGEST_MIN_SELLER_REPUTATION") ?? "0.8",
);
const MIN_REPLACEMENT_GAIN = Number(
  Deno?.env?.get?.("CATALOG_INGEST_MIN_REPLACEMENT_GAIN") ?? "0.02",
);
const ENABLE_REPLACEMENTS = ["1", "true", "yes", "on"].includes(
  String(Deno?.env?.get?.("CATALOG_INGEST_ENABLE_REPLACEMENTS") ?? "false")
    .trim()
    .toLowerCase(),
);
const BASE_CATEGORY_LIMIT = Number(
  Deno?.env?.get?.("CATALOG_INGEST_BASE_CATEGORY_LIMIT") ?? "20",
);
const BASE_MIN_DAILY_NEW = Number(
  Deno?.env?.get?.("CATALOG_INGEST_BASE_MIN_DAILY_NEW") ?? "5",
);
const DEFAULT_MAX_STANDBY_MULTIPLIER = Number(
  Deno?.env?.get?.("CATALOG_INGEST_DEFAULT_MAX_STANDBY_MULTIPLIER") ?? "2",
);
const DEFAULT_MAX_NEW_PER_DAY = Number(
  Deno?.env?.get?.("CATALOG_INGEST_DEFAULT_MAX_NEW_PER_DAY") ?? "5",
);
const DEFAULT_MIN_DELTA_SCORE_TO_REPLACE = Number(
  Deno?.env?.get?.("CATALOG_INGEST_DEFAULT_MIN_DELTA_SCORE_TO_REPLACE") ?? "8",
);
const FITNESS_GATE_ALLOW_SCORE = Number(
  Deno?.env?.get?.("CATALOG_INGEST_FITNESS_ALLOW_SCORE") ?? "70",
);
const FITNESS_GATE_STANDBY_SCORE = Number(
  Deno?.env?.get?.("CATALOG_INGEST_FITNESS_STANDBY_SCORE") ?? "50",
);
const DEFAULT_WEIGHT_SALES = Number(
  Deno?.env?.get?.("CATALOG_INGEST_WEIGHT_SALES") ?? "0.45",
);
const DEFAULT_WEIGHT_PRICE = Number(
  Deno?.env?.get?.("CATALOG_INGEST_WEIGHT_PRICE") ?? "0.35",
);
const DEFAULT_WEIGHT_REPUTATION = Number(
  Deno?.env?.get?.("CATALOG_INGEST_WEIGHT_REPUTATION") ?? "0.2",
);
const DEFAULT_EXPENSIVE_PERCENTILE = Number(
  Deno?.env?.get?.("CATALOG_INGEST_EXPENSIVE_PERCENTILE") ?? "0.8",
);
const DEFAULT_MIN_SALES_FOR_ELITE = Number(
  Deno?.env?.get?.("CATALOG_INGEST_MIN_SALES_FOR_ELITE") ?? "50",
);
const DEFAULT_MIN_REPUTATION_FOR_ELITE = Number(
  Deno?.env?.get?.("CATALOG_INGEST_MIN_REPUTATION_FOR_ELITE") ?? "0.8",
);
const GLOBAL_KNOWN_BRANDS = (Deno?.env?.get?.("CATALOG_INGEST_KNOWN_BRANDS") ?? "")
  .split(",")
  .map((brand) =>
    String(brand ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  )
  .filter(Boolean);

const AFFILIATE_QUERY = Deno?.env?.get?.("ML_AFFILIATE_QUERY")?.trim() ?? "";
const DEFAULT_SELLER_IDS_FROM_ENV = (Deno?.env?.get?.("CATALOG_INGEST_DEFAULT_SELLER_IDS") ?? "")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0)
  .map((value) => Math.floor(value));
const ENABLE_HIGHLIGHTS_DISCOVERY = !["0", "false", "no", "off"].includes(
  String(Deno?.env?.get?.("CATALOG_INGEST_ENABLE_HIGHLIGHTS_DISCOVERY") ?? "true")
    .trim()
    .toLowerCase(),
);
const rawHighlightsProductLimit = Number(
  Deno?.env?.get?.("CATALOG_INGEST_HIGHLIGHTS_PRODUCT_LIMIT") ?? "24",
);
const HIGHLIGHTS_PRODUCT_LIMIT = Number.isFinite(rawHighlightsProductLimit)
  ? Math.min(80, Math.max(4, Math.floor(rawHighlightsProductLimit)))
  : 24;
const rawMaxDescriptionFetches = Number(
  Deno?.env?.get?.("CATALOG_INGEST_MAX_DESCRIPTION_FETCHES") ?? "40",
);
const MAX_DESCRIPTION_FETCHES_PER_RUN = Number.isFinite(rawMaxDescriptionFetches)
  ? Math.max(0, Math.floor(rawMaxDescriptionFetches))
  : 40;
const rawDescriptionMinChars = Number(
  Deno?.env?.get?.("CATALOG_INGEST_DESCRIPTION_MIN_CHARS") ?? "200",
);
const DESCRIPTION_MIN_CHARS = Number.isFinite(rawDescriptionMinChars)
  ? Math.max(100, Math.floor(rawDescriptionMinChars))
  : 200;
const rawDescriptionMaxChars = Number(
  Deno?.env?.get?.("CATALOG_INGEST_DESCRIPTION_MAX_CHARS") ?? "8000",
);
const DESCRIPTION_MAX_CHARS = Number.isFinite(rawDescriptionMaxChars)
  ? Math.max(DESCRIPTION_MIN_CHARS + 200, Math.floor(rawDescriptionMaxChars))
  : 8000;
const STRIP_PROMOTIONAL_DESCRIPTION = ["1", "true", "yes", "on"].includes(
  String(Deno?.env?.get?.("CATALOG_INGEST_STRIP_PROMOTIONAL_DESCRIPTION") ?? "false")
    .trim()
    .toLowerCase(),
);
const rawMinPublishScore = Number(
  Deno?.env?.get?.("CATALOG_INGEST_MIN_PUBLISH_SCORE") ?? "0.35",
);
const MIN_PUBLISH_SCORE = Number.isFinite(rawMinPublishScore)
  ? Math.min(1, Math.max(0, rawMinPublishScore))
  : 0.35;
const TRIGGER_PRICE_SYNC_AFTER_INGEST = !["0", "false", "no", "off"].includes(
  String(Deno?.env?.get?.("CATALOG_INGEST_TRIGGER_PRICE_SYNC_AFTER_RUN") ?? "true")
    .trim()
    .toLowerCase(),
);
const rawPostSyncTimeoutMs = Number(
  Deno?.env?.get?.("CATALOG_INGEST_POST_SYNC_TIMEOUT_MS") ?? "25000",
);
const POST_SYNC_TIMEOUT_MS = Number.isFinite(rawPostSyncTimeoutMs)
  ? Math.max(3000, Math.min(60000, Math.floor(rawPostSyncTimeoutMs)))
  : 25000;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type MappingRow = {
  id: string;
  category_id: string;
  site_id: string | null;
  ml_category_id: string | null;
  site_category: string | null;
  ml_category_allowlist: string[] | null;
  query: string | null;
  seller_ids: Array<number | string> | null;
  include_terms: string[] | null;
  exclude_terms: string[] | null;
  max_items: number | null;
  enabled: boolean | null;
  max_active: number | null;
  max_standby: number | null;
  max_new_per_day: number | null;
  min_delta_score_to_replace: number | null;
  max_price_equipment: number | null;
  is_active: boolean;
  sort_mode: string | null;
};

type OfferCandidate = {
  mappingId: string;
  categoryId: string;
  marketplace: "mercadolivre";
  siteId: string;
  externalId: string;
  mlCategoryId: string | null;
  sellerId: number | null;
  sellerName: string | null;
  sellerReputationScore: number;
  sellerReputationLevel: string | null;
  sellerPowerStatus: string | null;
  title: string;
  brand: string | null;
  permalink: string;
  affiliateLink: string;
  thumbnailUrl: string | null;
  price: number;
  originalPrice: number | null;
  pixPrice: number | null;
  soldQuantity: number;
  popularityRank: number;
  scorePopularidade: number;
  scoreCustoBeneficio: number;
  isElite: boolean;
  siteCategory: string;
  fitnessRelevanceScore: number;
  fitnessDecision: "allow" | "standby" | "reject";
  currencyId: string;
  freeShipping: boolean;
  itemCondition: string | null;
  itemStatus: string | null;
  rawPayload: Record<string, unknown>;
};

type ExistingOfferRow = {
  id: string;
  external_id: string;
  price: number;
  original_price: number | null;
  pix_price: number | null;
};

type ExistingProductRow = {
  id: string;
  external_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  specifications: Record<string, unknown> | null;
  advantages: string[] | null;
  image_url: string | null;
  image_url_original: string | null;
  image_url_cached: string | null;
  images: string[] | null;
  category_id: string | null;
  affiliate_link: string | null;
  affiliate_verified: boolean | null;
  affiliate_generated_at: string | null;
  source_url: string | null;
  pix_price: number | null;
  pix_price_source: string | null;
  pix_price_checked_at: string | null;
  last_ml_description_hash: string | null;
  description_last_synced_at: string | null;
  description_manual_override: boolean | null;
  quality_issues: string[] | null;
  curation_badges: string[] | null;
  is_featured: boolean | null;
  status: string | null;
  is_active: boolean | null;
  price: number;
  original_price: number | null;
  discount_percentage: number | null;
  is_on_sale: boolean | null;
  free_shipping: boolean | null;
};

type MappingUpdateRow = {
  id: string;
  last_run_at: string;
  last_error: string | null;
};

type CategoryConfigRow = {
  category_id: string;
  max_products: number;
  min_daily_new: number;
  elite_enabled: boolean;
  enabled: boolean;
  priority_weight_sales: number;
  priority_weight_price: number;
  priority_weight_reputation: number;
  known_brands: string[] | null;
  expensive_percentile: number;
  min_sales_for_elite: number;
  min_reputation_for_elite: number;
};

type ProductScoreRow = {
  product_id: string;
  category_id: string | null;
  score_popularidade: number | null;
  score_custo_beneficio: number | null;
  seller_reputation: number | null;
  sold_quantity: number | null;
  popularity_rank: number | null;
  is_elite: boolean | null;
  last_evaluated_at: string | null;
};

type SellerProfile = {
  reputationScore: number;
  reputationLevel: string | null;
  powerStatus: string | null;
};

type CategorySelectionState = {
  config: CategoryConfigRow;
  existingActive: ExistingProductRow[];
  existingStandby: ExistingProductRow[];
  existingByExternal: Map<string, ExistingProductRow>;
  existingScoresByProductId: Map<string, ProductScoreRow>;
  maxActive: number;
  maxStandby: number;
  maxNewPerDay: number;
  minDeltaScoreToReplace: number;
};

type CategoryRuntimeLimits = {
  maxActive: number;
  maxStandby: number;
  maxNewPerDay: number;
  minDeltaScoreToReplace: number;
};

type CandidateContent = {
  description: string;
  shortDescription: string;
  descriptionHash: string;
  specifications: Record<string, unknown>;
  advantages: string[];
  imageUrlOriginal: string | null;
};

type QualityResult = {
  publishable: boolean;
  issues: string[];
  badges: string[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

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

const parseBody = async (req: Request) => {
  try {
    const text = await req.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
};

const parseJsonSafe = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

type PostSyncTriggerResult = {
  attempted: boolean;
  triggered: boolean;
  skipped_reason: string | null;
  status: number | null;
  response: Record<string, unknown> | null;
  error: string | null;
};

const triggerPriceSyncAfterIngest = async (args: {
  enabled: boolean;
  supabase: ReturnType<typeof createClient>;
  supabaseUrl: string;
  cronSecret: string | null;
  source: string;
  timeoutMs: number;
}) => {
  const skipped = (reason: string): PostSyncTriggerResult => ({
    attempted: false,
    triggered: false,
    skipped_reason: reason,
    status: null,
    response: null,
    error: null,
  });

  if (!args.enabled) return skipped("disabled");
  try {
    const { error } = await args.supabase.rpc("enqueue_price_sync", {
      p_payload: {
        source: args.source,
      },
    });
    if (!error) {
      return {
        attempted: true,
        triggered: true,
        skipped_reason: null,
        status: 202,
        response: { mode: "rpc_enqueue_price_sync" },
        error: null,
      } as PostSyncTriggerResult;
    }
    const rpcError = String(error.message ?? "").toLowerCase();
    const shouldFallbackToFetch =
      rpcError.includes("enqueue_price_sync") ||
      rpcError.includes("forbidden") ||
      rpcError.includes("cron secret");
    if (!shouldFallbackToFetch) {
      return {
        attempted: true,
        triggered: false,
        skipped_reason: null,
        status: null,
        response: { mode: "rpc_enqueue_price_sync" },
        error: error.message ?? "rpc_error",
      };
    }
  } catch {
    // Continue to fetch fallback.
  }

  if (!args.supabaseUrl) return skipped("missing_supabase_url");
  if (!args.cronSecret) return skipped("missing_cron_secret");

  const endpoint = `${args.supabaseUrl.replace(/\/+$/, "")}/functions/v1/price-sync`;
  const timeout = Number.isFinite(args.timeoutMs) ? Math.max(3000, args.timeoutMs) : 25000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": args.cronSecret,
      },
      body: JSON.stringify({
        source: args.source,
      }),
      signal: controller.signal,
    });
    const text = await resp.text();
    const parsed = text ? parseJsonSafe(text) : {};
    return {
      attempted: true,
      triggered: resp.ok,
      skipped_reason: null,
      status: resp.status,
      response: parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : { raw: text },
      error: resp.ok ? null : `http_${resp.status}`,
    } as PostSyncTriggerResult;
  } catch (error) {
    return {
      attempted: true,
      triggered: false,
      skipped_reason: null,
      status: null,
      response: null,
      error: (error as Error)?.name === "AbortError" ? "timeout" : ((error as Error)?.message ?? "fetch_error"),
    };
  } finally {
    clearTimeout(timer);
  }
};

const hashText = (value: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

const decodeBasicEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const htmlToText = (value: string) =>
  decodeBasicEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, ""),
  );

const truncateSmart = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  const chunk = value.slice(0, maxLength);
  const sentenceCut = Math.max(chunk.lastIndexOf(". "), chunk.lastIndexOf("! "), chunk.lastIndexOf("? "));
  if (sentenceCut > Math.floor(maxLength * 0.55)) {
    return chunk.slice(0, sentenceCut + 1).trim();
  }
  const spaceCut = chunk.lastIndexOf(" ");
  if (spaceCut > Math.floor(maxLength * 0.7)) {
    return chunk.slice(0, spaceCut).trim();
  }
  return chunk.trim();
};

const PROMOTIONAL_TOKENS = [
  "descricao do produto",
  "sobre a loja",
  "somos uma empresa",
  "somos lider",
  "garantia de",
  "enviamos para todo o brasil",
  "atendimento via chat",
  "compre com seguranca",
  "politica de troca",
  "devolucao",
];

const isPromotionalLine = (value: string) => {
  if (!STRIP_PROMOTIONAL_DESCRIPTION) return false;
  if (!value) return true;
  const normalized = normalizeText(value);
  return PROMOTIONAL_TOKENS.some((token) => normalized.includes(token));
};

const normalizeDescriptionBlocks = (raw: string) => {
  const normalized = htmlToText(raw)
    .split(/\n{1,}/g)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const block of normalized) {
    const key = normalizeText(block);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isPromotionalLine(block)) continue;
    deduped.push(block);
  }
  return deduped;
};

const cleanDescription = (raw: string | null) => {
  const blocks = normalizeDescriptionBlocks(raw ?? "");
  const text = blocks.join("\n\n").trim();
  if (!text) return "";
  const clipped = truncateSmart(text, Math.max(1200, DESCRIPTION_MAX_CHARS));
  return clipped;
};

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const normalizeSingleLine = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const stringValue = String(value).replace(/\s+/g, " ").trim();
  return stringValue ? stringValue : null;
};

const isValidHttpUrl = (value: string | null | undefined) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const isMercadoLivreHost = (value: string | null | undefined) => {
  if (!isValidHttpUrl(value)) return false;
  try {
    const url = new URL(value as string);
    const host = url.host.toLowerCase();
    return host === "mercadolivre.com" || host === "www.mercadolivre.com";
  } catch {
    return false;
  }
};

const verifyAffiliateLink = (affiliateLink: string | null, sourceUrl: string | null) => {
  if (!isValidHttpUrl(affiliateLink)) return false;
  try {
    const affiliate = new URL(affiliateLink as string);
    const hasMercadoLivreContext = isMercadoLivreHost(affiliateLink) || isMercadoLivreHost(sourceUrl);
    if (hasMercadoLivreContext) return isMercadoLivreShortAffiliateLink(affiliateLink);

    const source = sourceUrl && isValidHttpUrl(sourceUrl) ? new URL(sourceUrl) : null;
    const params = new URLSearchParams(AFFILIATE_QUERY);
    const paramEntries = Array.from(params.entries());
    if (!paramEntries.length) {
      return true;
    }
    for (const [key, value] of paramEntries) {
      if (affiliate.searchParams.get(key) === value) return true;
    }
    if (source) {
      return affiliate.toString() !== source.toString();
    }
    return true;
  } catch {
    return false;
  }
};

const hasShareMarker = (value: string | null | undefined) => {
  if (!value) return false;
  const normalized = String(value).toLowerCase();
  return (
    normalized.includes("origin=share") ||
    normalized.includes("sid=share") ||
    normalized.includes("origin%3dshare") ||
    normalized.includes("sid%3dshare")
  );
};

const isMercadoLivreShortAffiliateLink = (value: string | null | undefined) => {
  if (!isValidHttpUrl(value)) return false;
  try {
    const url = new URL(value as string);
    const host = url.host.toLowerCase();
    return (host === "mercadolivre.com" || host === "www.mercadolivre.com") &&
      url.pathname.startsWith("/sec/");
  } catch {
    return false;
  }
};

const isCuratedPinnedProduct = (product: ExistingProductRow) =>
  Boolean(product.is_featured) ||
  Boolean(product.description_manual_override) ||
  isMercadoLivreShortAffiliateLink(product.affiliate_link) ||
  hasShareMarker(product.source_url);

const normalizeExternalId = (value: unknown): string | null => {
  if (!value) return null;
  const str = String(value);
  const match = str.match(/MLB\d{6,12}/i);
  if (!match) return null;
  return match[0].toUpperCase();
};

const normalizeText = (value = "") =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const SITE_CATEGORY_SET = new Set<string>(Object.values(SITE_CATEGORIES));

const normalizeSiteCategory = (value: unknown): string | null => {
  const normalized = normalizeFitnessText(String(value ?? ""));
  if (!normalized) return null;
  if (SITE_CATEGORY_SET.has(normalized)) return normalized;
  return null;
};

const inferSiteCategoryFromText = (value: string): string | null => {
  const normalized = normalizeFitnessText(value);
  if (!normalized) return null;
  if (
    normalized.includes("suplement") ||
    normalized.includes("whey") ||
    normalized.includes("creatina")
  ) {
    return SITE_CATEGORIES.SUPLEMENTOS;
  }
  if (
    normalized.includes("equip") ||
    normalized.includes("halter") ||
    normalized.includes("elastico") ||
    normalized.includes("mini band")
  ) {
    return SITE_CATEGORIES.EQUIPAMENTOS;
  }
  if (
    normalized.includes("acessor") ||
    normalized.includes("strap") ||
    normalized.includes("shaker") ||
    normalized.includes("squeeze") ||
    normalized.includes("relogio")
  ) {
    return SITE_CATEGORIES.ACESSORIOS;
  }
  if (
    normalized.includes("mascul") ||
    normalized.includes("homem")
  ) {
    return SITE_CATEGORIES.ROUPAS_MASC;
  }
  if (
    normalized.includes("femin") ||
    normalized.includes("mulher")
  ) {
    return SITE_CATEGORIES.ROUPAS_FEM;
  }
  if (
    normalized.includes("roupa") ||
    normalized.includes("vestu") ||
    normalized.includes("legging") ||
    normalized.includes("camiseta")
  ) {
    return SITE_CATEGORIES.ROUPAS_MASC;
  }
  return null;
};

const resolveMappingSiteCategory = (mapping: MappingRow): string => {
  const explicit = normalizeSiteCategory(mapping.site_category);
  if (explicit) return explicit;
  const fromQuery = inferSiteCategoryFromText(String(mapping.query ?? ""));
  if (fromQuery) return fromQuery;
  const fallback = inferSiteCategoryFromText(
    `${mapping.category_id} ${mapping.ml_category_id ?? ""}`,
  );
  return fallback ?? SITE_CATEGORIES.ACESSORIOS;
};

const normalizeMlAllowlist = (value: string[] | null | undefined) =>
  Array.from(
    new Set(
      (value ?? [])
        .map((raw) => String(raw ?? "").trim().toUpperCase())
        .filter(Boolean),
    ),
  );

const normalizeScore = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const clampMoney = (value: number) => Math.round(value * 100) / 100;

const normalizeKnownBrands = (brands: string[] | null | undefined) =>
  (brands ?? []).map((brand) => normalizeText(brand)).filter(Boolean);

const isKnownBrand = (brand: string | null, knownBrands: string[]) => {
  const normalized = normalizeText(brand ?? "");
  if (!normalized) return false;
  return knownBrands.includes(normalized);
};

const extractBrandFromResult = (result: Record<string, unknown>) => {
  const directBrand = typeof result.brand === "string" ? result.brand.trim() : "";
  if (directBrand) return directBrand;

  const attributes = Array.isArray(result.attributes) ? result.attributes : [];
  for (const rawAttr of attributes) {
    if (!rawAttr || typeof rawAttr !== "object") continue;
    const attr = rawAttr as Record<string, unknown>;
    const id = String(attr.id ?? attr.attribute_id ?? "").toUpperCase();
    const name = String(attr.name ?? "").toLowerCase();
    if (id === "BRAND" || name.includes("marca")) {
      const valueName = String(
        (attr.value_name ?? attr.value ?? attr.value_struct?.toString?.() ?? "").toString(),
      ).trim();
      if (valueName) return valueName;
    }
  }

  return null;
};

const extractPrimaryImageFromResult = (result: Record<string, unknown>) => {
  const pictureRows = Array.isArray(result.pictures) ? result.pictures : [];
  for (const rawPicture of pictureRows) {
    const picture = toRecord(rawPicture);
    if (!picture) continue;
    const candidate = normalizeUrl(
      picture.secure_url ?? picture.url ?? picture.source ?? picture.large ?? picture.small ?? null,
    );
    if (candidate) return candidate;
  }

  const thumbnail = normalizeUrl(result.thumbnail ?? result.thumbnail_url ?? null);
  if (thumbnail) return thumbnail;
  return null;
};

const collectAttributes = (result: Record<string, unknown>) => {
  const output: Array<{ id: string; name: string; value: string }> = [];
  const rawAttributes = Array.isArray(result.attributes) ? result.attributes : [];
  for (const rawAttr of rawAttributes) {
    const attr = toRecord(rawAttr);
    if (!attr) continue;
    const id = normalizeSingleLine(attr.id ?? attr.attribute_id ?? "") ?? "";
    const name = normalizeSingleLine(attr.name ?? attr.label ?? "") ?? "";
    const value = normalizeSingleLine(
      attr.value_name ?? attr.value ?? (toRecord(attr.value_struct)?.number ?? null),
    );
    if (!(id || name) || !value) continue;
    output.push({
      id: id.toUpperCase(),
      name,
      value,
    });
  }
  return output;
};

const extractDescriptionCandidatesFromPayload = (result: Record<string, unknown>) => {
  const candidates: string[] = [];
  const directFields = [
    result.description,
    result.plain_text,
    result.short_description,
    result.subtitle,
  ];
  for (const raw of directFields) {
    const normalized = normalizeSingleLine(raw);
    if (normalized) candidates.push(normalized);
  }

  const highlights = Array.isArray(result.highlights) ? result.highlights : [];
  for (const rawHighlight of highlights) {
    const highlight = toRecord(rawHighlight);
    const normalized = normalizeSingleLine(
      highlight?.text ?? highlight?.value ?? highlight?.name ?? null,
    );
    if (normalized) candidates.push(normalized);
  }

  const saleTerms = Array.isArray(result.sale_terms) ? result.sale_terms : [];
  for (const rawTerm of saleTerms) {
    const term = toRecord(rawTerm);
    if (!term) continue;
    const name = normalizeSingleLine(term.name ?? term.id ?? null);
    const value = normalizeSingleLine(term.value_name ?? term.value_id ?? null);
    if (name && value) candidates.push(`${name}: ${value}`);
  }

  return candidates;
};

const buildFallbackDescription = (
  candidate: OfferCandidate,
  specs: Record<string, unknown>,
  attributes: Array<{ id: string; name: string; value: string }>,
) => {
  const brand = candidate.brand ? ` da marca ${candidate.brand}` : "";
  const bullets: string[] = [];
  const seen = new Set<string>();

  for (const attr of attributes.slice(0, 8)) {
    const label = attr.name || attr.id;
    const line = `${label}: ${attr.value}`;
    const key = normalizeText(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    bullets.push(`- ${line}`);
  }

  if (!bullets.length) {
    const condition = candidate.itemCondition === "new" ? "Novo" : "Condição não informada";
    bullets.push(`- Condição: ${condition}`);
    bullets.push(`- Marketplace: Mercado Livre`);
    bullets.push(`- Frete: ${candidate.freeShipping ? "Grátis" : "Consultar no checkout"}`);
    bullets.push(`- Vendedor com reputação qualificada.`);
  }

  const intro = `${candidate.title}${brand} com oferta oficial no Mercado Livre e curadoria automática de preço.`;
  const paragraph2 =
    `Este anúncio é monitorado para manter informações essenciais consistentes, incluindo preço, disponibilidade e condições de frete.`;
  const paragraph3 =
    `Principais características identificadas no anúncio oficial:\n${bullets.join("\n")}`;
  const paragraph4 =
    `Para concluir a compra com segurança, utilize o botão "Ver oferta", que redireciona para o checkout oficial via link de afiliado.`;

  const combined = [intro, paragraph2, paragraph3, paragraph4].join("\n\n");
  const cleaned = cleanDescription(combined);
  const ensured =
    cleaned.length >= DESCRIPTION_MIN_CHARS
      ? cleaned
      : truncateSmart(
          `${cleaned}\n\nEste produto permanece em atualização diária para garantir consistência dos dados exibidos no catálogo.`,
          DESCRIPTION_MAX_CHARS,
        );

  return {
    text: ensured,
    source: cleaned.length >= DESCRIPTION_MIN_CHARS ? "fallback" : "fallback_extended",
    specs,
  };
};

const buildShortDescription = (description: string, title: string) => {
  if (!description) return truncateSmart(title, 160);
  const firstLine = description.split(/\n+/).map((line) => line.trim()).find(Boolean) ?? description;
  return truncateSmart(firstLine, 180);
};

const buildCurationBadges = (candidate: OfferCandidate): string[] => {
  const badges: string[] = [];
  if (candidate.isElite) badges.push("ELITE");
  if (candidate.scoreCustoBeneficio >= 0.75) badges.push("MELHOR_CUSTO_BENEFICIO");
  if (candidate.scorePopularidade >= 0.75 || candidate.soldQuantity >= 50) badges.push("MAIS_VENDIDO");
  if (candidate.freeShipping) badges.push("FRETE_GRATIS");
  return Array.from(new Set(badges));
};

const evaluateQuality = (args: {
  candidate: OfferCandidate;
  content: CandidateContent;
  affiliateLink: string | null;
}) => {
  const issues: string[] = [];
  if (!(args.candidate.price > 0)) issues.push("invalid_price");
  if (!args.candidate.freeShipping) issues.push("no_free_shipping");
  if (!isHighSellerReputation(args.candidate.sellerReputationScore)) issues.push("low_seller_reputation");
  if (normalizeScore(args.candidate.scoreCustoBeneficio) < MIN_PUBLISH_SCORE) {
    issues.push("low_score");
  }
  if (!args.content.imageUrlOriginal || !isValidHttpUrl(args.content.imageUrlOriginal)) issues.push("invalid_image");
  if (!args.content.description || args.content.description.length < DESCRIPTION_MIN_CHARS) {
    issues.push("weak_description");
  }
  if (!isValidHttpUrl(args.affiliateLink)) {
    issues.push("invalid_affiliate_link");
  } else if (
    args.candidate.marketplace === "mercadolivre" &&
    !isMercadoLivreShortAffiliateLink(args.affiliateLink)
  ) {
    issues.push("affiliate_pending");
  }

  return {
    publishable: issues.length === 0,
    issues,
    badges: buildCurationBadges(args.candidate),
  } as QualityResult;
};

const fetchItemDescription = async (
  externalId: string,
  fetchJson: (url: string) => Promise<Record<string, unknown>>,
) => {
  const itemId = normalizeExternalId(externalId);
  if (!itemId) return null;
  try {
    const payload = await fetchJsonWithRetry(
      `${API_BASE}/items/${encodeURIComponent(itemId)}/description`,
      fetchJson,
    );
    const text = normalizeSingleLine(payload.plain_text ?? payload.text ?? payload.content ?? null);
    return text;
  } catch {
    return null;
  }
};

const mergeSpecifications = (
  existingSpecs: Record<string, unknown> | null,
  incomingSpecs: Record<string, unknown>,
) => {
  const base = existingSpecs && typeof existingSpecs === "object" ? existingSpecs : {};
  return {
    ...base,
    ...incomingSpecs,
  };
};

const resolveCandidateContent = async (
  candidate: OfferCandidate,
  options: {
    fetchJson: (url: string) => Promise<Record<string, unknown>>;
    cache: Map<string, CandidateContent>;
    descriptionFetchBudget: { used: number };
  },
): Promise<CandidateContent> => {
  const cached = options.cache.get(candidate.externalId);
  if (cached) return cached;

  const payload = candidate.rawPayload ?? {};
  const payloadRecord = toRecord(payload) ?? {};
  const payloadItem = toRecord(payloadRecord.item);
  const payloadProduct = toRecord(payloadRecord.product);
  const primaryPayload = payloadItem ?? payloadRecord;
  const secondaryPayload = payloadProduct ?? null;

  const attributes = [
    ...collectAttributes(primaryPayload),
    ...(secondaryPayload ? collectAttributes(secondaryPayload) : []),
  ];
  const imageUrlOriginal =
    extractPrimaryImageFromResult(primaryPayload) ??
    (secondaryPayload ? extractPrimaryImageFromResult(secondaryPayload) : null) ??
    candidate.thumbnailUrl ??
    null;

  const descriptionCandidates = [
    ...extractDescriptionCandidatesFromPayload(primaryPayload),
    ...(secondaryPayload ? extractDescriptionCandidatesFromPayload(secondaryPayload) : []),
  ];
  let selectedDescription = cleanDescription(descriptionCandidates.join("\n\n"));

  if (
    selectedDescription.length < Math.max(100, Math.floor(DESCRIPTION_MIN_CHARS * 0.6)) &&
    options.descriptionFetchBudget.used < Math.max(0, MAX_DESCRIPTION_FETCHES_PER_RUN)
  ) {
    options.descriptionFetchBudget.used += 1;
    const apiDescription = await fetchItemDescription(candidate.externalId, options.fetchJson);
    const cleanedApiDescription = cleanDescription(apiDescription);
    if (cleanedApiDescription.length > selectedDescription.length) {
      selectedDescription = cleanedApiDescription;
    }
  }

  const baseSpecs: Record<string, unknown> = {
    source: "mercadolivre_api",
    item_id: candidate.externalId,
    ml_category_id: candidate.mlCategoryId,
    seller_id: candidate.sellerId,
    seller_name: candidate.sellerName,
    seller_reputation: candidate.sellerReputationScore,
    shipping_free: candidate.freeShipping,
    condition: candidate.itemCondition,
    sold_quantity: candidate.soldQuantity,
    attributes,
    payload_root: secondaryPayload ? "product_item" : "item",
  };

  const finalDescription = selectedDescription.length >= DESCRIPTION_MIN_CHARS
    ? truncateSmart(selectedDescription, DESCRIPTION_MAX_CHARS)
    : buildFallbackDescription(candidate, baseSpecs, attributes).text;

  const shortDescription = buildShortDescription(finalDescription, candidate.title);
  const descriptionHash = hashText(finalDescription);
  const topAdvantages = attributes
    .slice(0, 6)
    .map((attr) => `${attr.name || attr.id}: ${attr.value}`)
    .filter(Boolean);

  const content: CandidateContent = {
    description: finalDescription,
    shortDescription,
    descriptionHash,
    specifications: baseSpecs,
    advantages: topAdvantages,
    imageUrlOriginal,
  };
  options.cache.set(candidate.externalId, content);
  return content;
};

const reputationLevelToScore = (levelId: string | null) => {
  const normalized = String(levelId ?? "").toLowerCase();
  if (normalized.startsWith("5_")) return 1;
  if (normalized.startsWith("4_")) return 0.9;
  if (normalized.startsWith("3_")) return 0.7;
  if (normalized.startsWith("2_")) return 0.45;
  if (normalized.startsWith("1_")) return 0.2;
  if (normalized === "new") return 0.35;
  return 0;
};

const powerStatusToBoost = (powerStatus: string | null) => {
  const normalized = String(powerStatus ?? "").toLowerCase();
  if (normalized === "platinum") return 0.08;
  if (normalized === "gold" || normalized === "gold_special") return 0.05;
  if (normalized === "silver") return 0.03;
  return 0;
};

const toSellerReputationScore = (levelId: string | null, powerStatus: string | null) => {
  const base = reputationLevelToScore(levelId);
  const boosted = base + powerStatusToBoost(powerStatus);
  return normalizeScore(boosted);
};

const isHighSellerReputation = (score: number) => score >= MIN_SELLER_REPUTATION;

const percentileValue = (values: number[], percentile: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const safePercentile = Math.min(1, Math.max(0, percentile));
  const index = Math.floor(safePercentile * (sorted.length - 1));
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? sorted[0] ?? 0;
};

const sortCandidatesByPriority = (a: OfferCandidate, b: OfferCandidate) => {
  const eliteDiff = Number(b.isElite) - Number(a.isElite);
  if (eliteDiff !== 0) return eliteDiff;
  const costDiff = b.scoreCustoBeneficio - a.scoreCustoBeneficio;
  if (Math.abs(costDiff) > 0.0001) return costDiff;
  const popDiff = b.scorePopularidade - a.scorePopularidade;
  if (Math.abs(popDiff) > 0.0001) return popDiff;
  if (a.price !== b.price) return a.price - b.price;
  return a.externalId.localeCompare(b.externalId);
};

const slugify = (title: string, externalId: string) => {
  const base = normalizeText(title)
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "produto";
  return `${base}-${externalId.toLowerCase()}`;
};

const moneyToCents = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
};

const moneyEquals = (a: number | null | undefined, b: number | null | undefined) =>
  moneyToCents(a) === moneyToCents(b);

const hasMeaningfulPixDiscount = (standard: number, pix: number) => {
  if (!(Number.isFinite(standard) && Number.isFinite(pix))) return false;
  if (!(standard > 0 && pix > 0 && pix < standard)) return false;
  const absDiff = standard - pix;
  const pctDiff = absDiff / standard;
  const minAbs = Math.max(0, Number.isFinite(PIX_MIN_DISCOUNT_ABS) ? PIX_MIN_DISCOUNT_ABS : 0.5);
  const minPct = Math.max(
    0,
    Math.min(0.5, Number.isFinite(PIX_MIN_DISCOUNT_PERCENT) ? PIX_MIN_DISCOUNT_PERCENT : 0.005),
  );
  return absDiff >= minAbs || pctDiff >= minPct;
};

const pickBestPixCandidate = (values: number[], referencePrice: number): number | null => {
  const minRatio = Math.min(0.95, Math.max(0, PIX_MIN_RATIO_VS_STANDARD));
  const minAllowed = referencePrice * minRatio;
  const filtered = values.filter(
    (value) =>
      Number.isFinite(value) &&
      value > 0 &&
      value < referencePrice &&
      value >= minAllowed &&
      hasMeaningfulPixDiscount(referencePrice, value),
  );
  if (!filtered.length) return null;
  return Math.max(...filtered);
};

const extractNumericPriceFromRecord = (record: Record<string, unknown>) => {
  const candidates: number[] = [];
  for (const key of [
    "amount",
    "price",
    "value",
    "regular_amount",
    "sale_price",
    "cash_price",
    "pix_price",
    "transaction_amount",
  ]) {
    const parsed = toNumber(record[key]);
    if (parsed !== null) candidates.push(parsed);
  }
  return candidates;
};

const extractOfficialPixPrice = (payload: unknown, referencePrice: number): number | null => {
  const candidates: number[] = [];

  const visit = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== "object") return;

    const record = node as Record<string, unknown>;
    const paymentMethodId = String(record.payment_method_id ?? record.payment_method ?? "")
      .toLowerCase()
      .trim();
    const keyWithPix = Object.keys(record).some((key) => key.toLowerCase().includes("pix"));

    if (paymentMethodId === "pix" || paymentMethodId.endsWith("_pix") || keyWithPix) {
      candidates.push(...extractNumericPriceFromRecord(record));
    }

    const directPixPrice = toNumber(
      record.pix_price ?? record.preco_pix ?? record.cash_price ?? record.pix,
    );
    if (directPixPrice !== null) {
      candidates.push(directPixPrice);
    }

    for (const value of Object.values(record)) {
      visit(value);
    }
  };

  visit(payload);
  return pickBestPixCandidate(candidates, referencePrice);
};

const extractOriginalPrice = (payload: Record<string, unknown>, referencePrice: number) => {
  const candidates: number[] = [];
  const direct = toNumber(payload.original_price);
  if (direct !== null) candidates.push(direct);

  const collect = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) collect(item);
      return;
    }
    if (typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    for (const key of ["original_price", "regular_amount", "compare_at_price"]) {
      const parsed = toNumber(record[key]);
      if (parsed !== null) candidates.push(parsed);
    }
    for (const value of Object.values(record)) {
      collect(value);
    }
  };

  collect(payload.prices);

  const filtered = candidates.filter(
    (value) => Number.isFinite(value) && value > referencePrice && value >= referencePrice * 1.01,
  );
  if (!filtered.length) return null;
  return Math.max(...filtered);
};

const buildAffiliateLink = (permalink: string) => {
  if (!AFFILIATE_QUERY) return permalink;
  try {
    const url = new URL(permalink);
    const params = new URLSearchParams(AFFILIATE_QUERY);
    for (const [key, value] of params.entries()) {
      if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    return permalink;
  }
};

const normalizeUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("http")) return null;
  return trimmed;
};

const mapSortMode = (sortMode: string | null) => {
  const normalized = String(sortMode ?? "").toLowerCase().trim();
  if (normalized === "price_asc") return "price_asc";
  if (normalized === "price_desc") return "price_desc";
  if (normalized === "sold_desc" || normalized === "sold_quantity_desc") return "relevance";
  if (normalized === "relevance") return "relevance";
  return "relevance";
};

const normalizeSellerIds = (sellerIds: MappingRow["seller_ids"]) => {
  const out: number[] = [];
  for (const raw of sellerIds ?? []) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) continue;
    const value = Math.floor(parsed);
    if (value <= 0) continue;
    out.push(value);
  }
  return Array.from(new Set(out));
};

const resolveAuthUserId = async (
  fetchJson: (url: string) => Promise<Record<string, unknown>>,
) => {
  try {
    const mePayload = await fetchJsonWithRetry(`${API_BASE}/users/me`, fetchJson);
    const parsed = toNumber(mePayload?.id ?? null);
    if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
  } catch {
    return null;
  }
};

const matchesTerms = (
  title: string,
  includeTerms: string[] | null,
  excludeTerms: string[] | null,
) => {
  const normalizedTitle = normalizeText(title);
  const includes = (includeTerms ?? []).map((term) => normalizeText(term)).filter(Boolean);
  const excludes = (excludeTerms ?? []).map((term) => normalizeText(term)).filter(Boolean);

  if (includes.length && !includes.some((term) => normalizedTitle.includes(term))) return false;
  if (excludes.length && excludes.some((term) => normalizedTitle.includes(term))) return false;
  return true;
};

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const safeSize = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += safeSize) {
    chunks.push(items.slice(i, i + safeSize));
  }
  return chunks;
};

const fetchWithTimeout = async (url: string, timeoutMs: number, init?: RequestInit) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: init?.method ?? "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      body: init?.body,
    });
  } finally {
    clearTimeout(timer);
  }
};

const fetchJsonWithRetry = async (
  url: string,
  fetchJsonOnce: (targetUrl: string) => Promise<Record<string, unknown>>,
) => {
  let lastError: string | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      return await fetchJsonOnce(url);
    } catch (error) {
      lastError = (error as Error)?.message ?? String(error);
      if (attempt < MAX_RETRIES - 1) {
        await sleep(BACKOFF_BASE_MS * (attempt + 1));
        continue;
      }
      throw new Error(lastError);
    }
  }

  throw new Error(lastError ?? "unknown_fetch_error");
};

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
      tokenRowId: row.data.id as number,
      tokens: {
        access_token: row.data.access_token ?? envTokens.accessToken ?? null,
        refresh_token: row.data.refresh_token ?? envTokens.refreshToken ?? null,
        expires_at: row.data.expires_at ?? null,
      },
    };
  }

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
    tokenRowId: inserted.id as number,
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

  const { error: insErr } = await supabase.from("meli_tokens").insert({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    updated_at: nowIso,
    expires_at: payload.expires_at,
  });
  if (insErr) return { error: insErr.message };
  return { ok: true };
};

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

  const resp = await fetchWithTimeout(OAUTH_URL, REQUEST_TIMEOUT_MS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await resp.text();
  return { resp, data: text ? parseJsonSafe(text) : {} };
};

const createMeliJsonFetcher = (args: {
  getToken: () => string | null;
  refresh: () => Promise<{ ok: boolean; status: number; body: unknown }>;
}) => {
  return async (url: string): Promise<Record<string, unknown>> => {
    const fetchPublic = async (): Promise<Record<string, unknown>> => {
      const sanitizedUrl = (() => {
        try {
          const parsed = new URL(url);
          parsed.searchParams.delete("access_token");
          return parsed.toString();
        } catch {
          return url;
        }
      })();
      const publicResp = await fetchWithTimeout(sanitizedUrl, REQUEST_TIMEOUT_MS, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const publicText = await publicResp.text().catch(() => "");
      if (!publicResp.ok) {
        throw new Error(`http_${publicResp.status}:${publicText.slice(0, 200)}`);
      }
      return publicText ? (parseJsonSafe(publicText) as Record<string, unknown>) : {};
    };

    const token = args.getToken();
    if (!token) throw new Error("MELI_ACCESS_TOKEN missing");

    const buildInit = (authToken: string): RequestInit => ({
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: "application/json",
      },
    });

    const response = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS, buildInit(token));
    if (response.status === 403) {
      try {
        return await fetchPublic();
      } catch {
        // Keep original 403 details below.
      }
    }
    if (response.status === 401) {
      const refreshResult = await args.refresh();
      if (!refreshResult.ok) {
        throw new Error(`meli_refresh_failed:${JSON.stringify(refreshResult.body)}`);
      }
      const refreshedToken = args.getToken();
      if (!refreshedToken) throw new Error("MELI_ACCESS_TOKEN missing");
      const retry = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS, buildInit(refreshedToken));
      if (retry.status === 403) {
        try {
          return await fetchPublic();
        } catch {
          // Keep retry 403 details below.
        }
      }
      const retryText = await retry.text().catch(() => "");
      if (!retry.ok) {
        throw new Error(`http_${retry.status}:${retryText.slice(0, 200)}`);
      }
      return retryText ? (parseJsonSafe(retryText) as Record<string, unknown>) : {};
    }

    const text = await response.text().catch(() => "");
    if (!response.ok) {
      throw new Error(`http_${response.status}:${text.slice(0, 200)}`);
    }
    return text ? (parseJsonSafe(text) as Record<string, unknown>) : {};
  };
};

const parseSellerProfileFromSearch = (result: Record<string, unknown>): SellerProfile | null => {
  const sellerRecord =
    typeof result.seller === "object" && result.seller !== null
      ? (result.seller as Record<string, unknown>)
      : null;
  if (!sellerRecord) return null;

  const sellerReputationRecord =
    typeof sellerRecord.seller_reputation === "object" && sellerRecord.seller_reputation !== null
      ? (sellerRecord.seller_reputation as Record<string, unknown>)
      : null;
  const levelId =
    typeof sellerReputationRecord?.level_id === "string" ? sellerReputationRecord.level_id : null;
  const powerStatus =
    typeof sellerRecord.power_seller_status === "string" ? sellerRecord.power_seller_status : null;
  if (!levelId && !powerStatus) return null;
  return {
    reputationScore: toSellerReputationScore(levelId, powerStatus),
    reputationLevel: levelId,
    powerStatus,
  };
};

const fetchSellerProfile = async (
  sellerId: number | null,
  cache: Map<number, SellerProfile | null>,
  fetchJson: (url: string) => Promise<Record<string, unknown>>,
) => {
  if (sellerId === null || !Number.isFinite(sellerId) || sellerId <= 0) return null;
  const normalizedId = Math.floor(sellerId);
  if (cache.has(normalizedId)) {
    return cache.get(normalizedId) ?? null;
  }

  try {
    const payload = await fetchJsonWithRetry(
      `${API_BASE}/users/${normalizedId}`,
      fetchJson,
    );
    const sellerReputation =
      typeof payload?.seller_reputation === "object" && payload.seller_reputation !== null
        ? (payload.seller_reputation as Record<string, unknown>)
        : null;
    const levelId = typeof sellerReputation?.level_id === "string" ? sellerReputation.level_id : null;
    const powerStatus = typeof payload?.power_seller_status === "string" ? payload.power_seller_status : null;
    const profile: SellerProfile = {
      reputationScore: toSellerReputationScore(levelId, powerStatus),
      reputationLevel: levelId,
      powerStatus,
    };
    cache.set(normalizedId, profile);
    return profile;
  } catch {
    cache.set(normalizedId, null);
    return null;
  }
};

const toDefaultCategoryConfig = (categoryId: string): CategoryConfigRow => ({
  category_id: categoryId,
  max_products: clamp(toPositiveInt(BASE_CATEGORY_LIMIT, 20), 1, 200),
  min_daily_new: clamp(toNonNegativeInt(BASE_MIN_DAILY_NEW, 5), 0, 50),
  elite_enabled: true,
  enabled: true,
  priority_weight_sales: DEFAULT_WEIGHT_SALES,
  priority_weight_price: DEFAULT_WEIGHT_PRICE,
  priority_weight_reputation: DEFAULT_WEIGHT_REPUTATION,
  known_brands: [],
  expensive_percentile: DEFAULT_EXPENSIVE_PERCENTILE,
  min_sales_for_elite: toPositiveInt(DEFAULT_MIN_SALES_FOR_ELITE, 50),
  min_reputation_for_elite: normalizeScore(DEFAULT_MIN_REPUTATION_FOR_ELITE),
});

const scoreCategoryCandidates = (
  categoryCandidates: OfferCandidate[],
  config: CategoryConfigRow,
) => {
  if (!categoryCandidates.length) return;
  const prices = categoryCandidates.map((item) => item.price).filter((value) => value > 0);
  const sales = categoryCandidates.map((item) => Math.max(0, item.soldQuantity));
  const maxSales = Math.max(1, ...sales);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = Math.max(0.01, maxPrice - minPrice);
  const expensiveThreshold = percentileValue(prices, config.expensive_percentile);

  const knownBrands = Array.from(
    new Set([...GLOBAL_KNOWN_BRANDS, ...normalizeKnownBrands(config.known_brands)]),
  );

  const normalizedWeights = {
    sales: Math.max(0, config.priority_weight_sales),
    price: Math.max(0, config.priority_weight_price),
    reputation: Math.max(0, config.priority_weight_reputation),
  };
  const weightTotal = normalizedWeights.sales + normalizedWeights.price + normalizedWeights.reputation;
  const safeWeights = weightTotal > 0
    ? {
        sales: normalizedWeights.sales / weightTotal,
        price: normalizedWeights.price / weightTotal,
        reputation: normalizedWeights.reputation / weightTotal,
      }
    : { sales: 0.45, price: 0.35, reputation: 0.2 };

  const sortedBySales = [...categoryCandidates].sort((a, b) => b.soldQuantity - a.soldQuantity);
  const rankByExternal = new Map<string, number>();
  sortedBySales.forEach((item, index) => rankByExternal.set(item.externalId, index + 1));

  for (const candidate of categoryCandidates) {
    const normalizedSales = normalizeScore(candidate.soldQuantity / maxSales);
    const inversePrice = normalizeScore((maxPrice - candidate.price) / priceRange);
    const reputationScore = normalizeScore(candidate.sellerReputationScore);

    candidate.popularityRank = rankByExternal.get(candidate.externalId) ?? categoryCandidates.length;
    candidate.scorePopularidade = normalizedSales;
    candidate.scoreCustoBeneficio = normalizeScore(
      safeWeights.sales * normalizedSales +
      safeWeights.price * inversePrice +
      safeWeights.reputation * reputationScore,
    );

    const eliteBrand = isKnownBrand(candidate.brand, knownBrands);
    const elitePrice = candidate.price >= expensiveThreshold;
    const eliteSales = candidate.soldQuantity >= Math.max(0, config.min_sales_for_elite);
    const eliteReputation = reputationScore >= normalizeScore(config.min_reputation_for_elite);
    candidate.isElite = Boolean(
      config.elite_enabled &&
      candidate.freeShipping &&
      eliteBrand &&
      elitePrice &&
      eliteSales &&
      eliteReputation,
    );
  }
};

const buildCandidateFromResult = (
  result: Record<string, unknown>,
  mapping: MappingRow,
  popularityRank: number,
): OfferCandidate | null => {
  const externalId = normalizeExternalId(result.id);
  if (!externalId) return null;

  const title = String(result.title ?? "").trim();
  if (!title) return null;
  if (!matchesTerms(title, mapping.include_terms, mapping.exclude_terms)) return null;

  const price = toNumber(result.price);
  if (price === null || !(price > 0)) return null;

  const permalink = normalizeUrl(result.permalink) ?? `https://www.mercadolivre.com.br/p/${externalId}`;
  const affiliateLink = buildAffiliateLink(permalink);
  const thumbnailUrl = extractPrimaryImageFromResult(result);

  const originalPrice = extractOriginalPrice(result, price);
  const pixPrice = extractOfficialPixPrice(result, price);

  const sellerRecord =
    typeof result.seller === "object" && result.seller !== null
      ? (result.seller as Record<string, unknown>)
      : null;
  const sellerId = toNumber(
    sellerRecord?.id ??
      (result as Record<string, unknown>)?.seller_id ??
      null,
  );
  const sellerName =
    typeof sellerRecord?.nickname === "string" ? sellerRecord.nickname.trim() || null : null;
  const profileFromSearch = parseSellerProfileFromSearch(result);

  const shippingRecord =
    typeof result.shipping === "object" && result.shipping !== null
      ? (result.shipping as Record<string, unknown>)
      : null;

  const soldQuantityRaw = toNumber(result.sold_quantity ?? result.available_quantity ?? null);
  const soldQuantity = Math.max(0, toNonNegativeInt(soldQuantityRaw, 0));
  const brand = extractBrandFromResult(result);
  const siteCategory = resolveMappingSiteCategory(mapping);

  return {
    mappingId: mapping.id,
    categoryId: mapping.category_id,
    marketplace: "mercadolivre",
    siteId: mapping.site_id ?? DEFAULT_SITE_ID,
    externalId,
    mlCategoryId:
      (typeof result.category_id === "string" && result.category_id.trim()) ||
      mapping.ml_category_id ||
      null,
    sellerId: sellerId !== null && Number.isFinite(sellerId) ? Math.floor(sellerId) : null,
    sellerName,
    sellerReputationScore: profileFromSearch?.reputationScore ?? 0,
    sellerReputationLevel: profileFromSearch?.reputationLevel ?? null,
    sellerPowerStatus: profileFromSearch?.powerStatus ?? null,
    title,
    brand,
    permalink,
    affiliateLink,
    thumbnailUrl,
    price,
    originalPrice,
    pixPrice,
    soldQuantity,
    popularityRank: Math.max(1, popularityRank),
    scorePopularidade: 0,
    scoreCustoBeneficio: 0,
    isElite: false,
    siteCategory,
    fitnessRelevanceScore: 0,
    fitnessDecision: "reject",
    currencyId: typeof result.currency_id === "string" ? result.currency_id : "BRL",
    freeShipping: Boolean(shippingRecord?.free_shipping),
    itemCondition: typeof result.condition === "string" ? result.condition : null,
    itemStatus: typeof result.status === "string" ? result.status : null,
    rawPayload: result,
  };
};

const extractProductThumbnailUrl = (product: Record<string, unknown>): string | null => {
  const direct = normalizeUrl(product.thumbnail);
  if (direct) return direct;
  const pictures = Array.isArray(product.pictures) ? product.pictures : [];
  for (const rawPicture of pictures) {
    if (!rawPicture || typeof rawPicture !== "object") continue;
    const picture = rawPicture as Record<string, unknown>;
    const candidate = normalizeUrl(picture.secure_url ?? picture.url ?? picture.source ?? null);
    if (candidate) return candidate;
  }
  return null;
};

const resolveMappingMlCategoryId = async (
  mapping: MappingRow,
  fetchJson: (url: string) => Promise<Record<string, unknown>>,
  stats: { api_errors: number },
) => {
  const explicitCategory = String(mapping.ml_category_id ?? "").trim();
  if (explicitCategory) return explicitCategory;
  const query = String(mapping.query ?? "").trim();
  if (!query) return null;
  const siteId = mapping.site_id ?? DEFAULT_SITE_ID;

  const discoveryUrl = new URL(
    `${API_BASE}/sites/${encodeURIComponent(siteId)}/domain_discovery/search`,
  );
  discoveryUrl.searchParams.set("limit", "3");
  discoveryUrl.searchParams.set("q", query);
  try {
    const payload = await fetchJsonWithRetry(discoveryUrl.toString(), fetchJson);
    const rows = Array.isArray(payload) ? payload : [];
    for (const rawRow of rows) {
      if (!rawRow || typeof rawRow !== "object") continue;
      const row = rawRow as Record<string, unknown>;
      const categoryId = String(row.category_id ?? "").trim();
      if (categoryId) return categoryId;
    }
  } catch {
    stats.api_errors += 1;
  }

  return null;
};

const buildCandidateFromProductItem = (
  product: Record<string, unknown>,
  item: Record<string, unknown>,
  mapping: MappingRow,
  popularityRank: number,
): OfferCandidate | null => {
  const externalId = normalizeExternalId(item.item_id ?? item.id);
  if (!externalId) return null;

  const title = String(product.name ?? item.title ?? "").trim();
  if (!title) return null;
  if (!matchesTerms(title, mapping.include_terms, mapping.exclude_terms)) return null;

  const price = toNumber(item.price);
  if (price === null || !(price > 0)) return null;

  const productId = normalizeExternalId(product.id);
  const permalink =
    normalizeUrl(item.permalink) ??
    normalizeUrl(product.permalink) ??
    (productId
      ? `https://www.mercadolivre.com.br/p/${productId}`
      : `https://www.mercadolivre.com.br/p/${externalId}`);
  const affiliateLink = buildAffiliateLink(permalink);
  const thumbnailUrl = extractPrimaryImageFromResult(item) ??
    extractPrimaryImageFromResult(product) ??
    extractProductThumbnailUrl(product);

  const originalPrice = extractOriginalPrice(
    {
      ...product,
      ...item,
      prices:
        (item.prices as unknown) ??
        (product.prices as unknown) ??
        null,
    },
    price,
  );
  const pixPrice = extractOfficialPixPrice(
    {
      ...product,
      ...item,
      prices:
        (item.prices as unknown) ??
        (product.prices as unknown) ??
        null,
    },
    price,
  );

  const sellerId = toNumber(item.seller_id ?? null);
  const sellerName = typeof item.seller_name === "string" ? item.seller_name.trim() || null : null;
  const profileFromSearch = parseSellerProfileFromSearch(item);

  const shippingRecord =
    typeof item.shipping === "object" && item.shipping !== null
      ? (item.shipping as Record<string, unknown>)
      : null;

  const soldQuantityRaw = toNumber(item.sold_quantity ?? item.available_quantity ?? null);
  const soldQuantity = Math.max(0, toNonNegativeInt(soldQuantityRaw, 0));
  const brand = extractBrandFromResult(product);
  const siteCategory = resolveMappingSiteCategory(mapping);

  return {
    mappingId: mapping.id,
    categoryId: mapping.category_id,
    marketplace: "mercadolivre",
    siteId: String(item.site_id ?? mapping.site_id ?? DEFAULT_SITE_ID),
    externalId,
    mlCategoryId:
      (typeof item.category_id === "string" && item.category_id.trim()) ||
      mapping.ml_category_id ||
      null,
    sellerId: sellerId !== null && Number.isFinite(sellerId) ? Math.floor(sellerId) : null,
    sellerName,
    sellerReputationScore: profileFromSearch?.reputationScore ?? 0,
    sellerReputationLevel: profileFromSearch?.reputationLevel ?? null,
    sellerPowerStatus: profileFromSearch?.powerStatus ?? null,
    title,
    brand,
    permalink,
    affiliateLink,
    thumbnailUrl,
    price,
    originalPrice,
    pixPrice,
    soldQuantity,
    popularityRank: Math.max(1, popularityRank),
    scorePopularidade: 0,
    scoreCustoBeneficio: 0,
    isElite: false,
    siteCategory,
    fitnessRelevanceScore: 0,
    fitnessDecision: "reject",
    currencyId: typeof item.currency_id === "string" ? item.currency_id : "BRL",
    freeShipping: Boolean(shippingRecord?.free_shipping),
    itemCondition: typeof item.condition === "string" ? item.condition : null,
    itemStatus: typeof item.status === "string" ? item.status : null,
    rawPayload: {
      product,
      item,
    },
  };
};

const collectCategoryHighlightsCandidates = async (
  mapping: MappingRow,
  effectiveMaxItems: number,
  runDeadlineMs: number,
  options: {
    sellerProfileCache: Map<number, SellerProfile | null>;
    fetchJson: (url: string) => Promise<Record<string, unknown>>;
    stats: {
      discarded_no_free_shipping: number;
      discarded_low_reputation: number;
      discarded_not_new: number;
      discarded_invalid_price: number;
      api_errors: number;
    };
  },
) => {
  if (!ENABLE_HIGHLIGHTS_DISCOVERY) return [] as OfferCandidate[];
  const siteId = mapping.site_id ?? DEFAULT_SITE_ID;
  const resolvedCategoryId = await resolveMappingMlCategoryId(
    mapping,
    options.fetchJson,
    options.stats,
  );
  if (!resolvedCategoryId) return [] as OfferCandidate[];

  const highlightsUrl = `${API_BASE}/highlights/${encodeURIComponent(siteId)}/category/${encodeURIComponent(
    resolvedCategoryId,
  )}`;
  let highlightsPayload: Record<string, unknown>;
  try {
    highlightsPayload = await fetchJsonWithRetry(highlightsUrl, options.fetchJson);
  } catch {
    options.stats.api_errors += 1;
    return [] as OfferCandidate[];
  }

  const contentRows = Array.isArray(highlightsPayload?.content) ? highlightsPayload.content : [];
  const productRefs = contentRows
    .map((rawRow, idx) => {
      if (!rawRow || typeof rawRow !== "object") return null;
      const row = rawRow as Record<string, unknown>;
      const id = String(row.id ?? "").trim();
      const type = String(row.type ?? "").toUpperCase().trim();
      if (!id || !type.includes("PRODUCT")) return null;
      return {
        productId: id,
        rank: Math.max(1, toPositiveInt(row.position ?? idx + 1, idx + 1)),
      };
    })
    .filter((item): item is { productId: string; rank: number } => Boolean(item))
    .slice(0, Math.min(HIGHLIGHTS_PRODUCT_LIMIT, Math.max(4, effectiveMaxItems * 2)));

  const out: OfferCandidate[] = [];
  for (const productRef of productRefs) {
    if (Date.now() >= runDeadlineMs) break;
    if (out.length >= effectiveMaxItems) break;

    let productPayload: Record<string, unknown>;
    try {
      productPayload = await fetchJsonWithRetry(
        `${API_BASE}/products/${encodeURIComponent(productRef.productId)}`,
        options.fetchJson,
      );
    } catch {
      options.stats.api_errors += 1;
      continue;
    }

    let itemsPayload: Record<string, unknown>;
    try {
      itemsPayload = await fetchJsonWithRetry(
        `${API_BASE}/products/${encodeURIComponent(productRef.productId)}/items`,
        options.fetchJson,
      );
    } catch {
      options.stats.api_errors += 1;
      continue;
    }

    const itemRows = Array.isArray(itemsPayload?.results) ? itemsPayload.results : [];
    for (let idx = 0; idx < itemRows.length; idx += 1) {
      if (Date.now() >= runDeadlineMs) break;
      if (out.length >= effectiveMaxItems) break;
      const rawItem = itemRows[idx];
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) continue;
      const item = rawItem as Record<string, unknown>;

      const candidate = buildCandidateFromProductItem(
        productPayload,
        item,
        mapping,
        Math.max(1, (productRef.rank - 1) * 50 + idx + 1),
      );
      if (!candidate) continue;
      if (!candidate.freeShipping) {
        options.stats.discarded_no_free_shipping += 1;
        continue;
      }
      if (String(candidate.itemCondition ?? "").toLowerCase() !== "new") {
        options.stats.discarded_not_new += 1;
        continue;
      }

      if (!isHighSellerReputation(candidate.sellerReputationScore) && candidate.sellerId !== null) {
        const profile = await fetchSellerProfile(
          candidate.sellerId,
          options.sellerProfileCache,
          options.fetchJson,
        );
        if (profile) {
          candidate.sellerReputationScore = profile.reputationScore;
          candidate.sellerReputationLevel = profile.reputationLevel;
          candidate.sellerPowerStatus = profile.powerStatus;
        }
      }

      if (!isHighSellerReputation(candidate.sellerReputationScore)) {
        options.stats.discarded_low_reputation += 1;
        continue;
      }

      out.push(candidate);
    }
  }

  const deduped = new Map<string, OfferCandidate>();
  for (const candidate of out) {
    const current = deduped.get(candidate.externalId);
    if (!current) {
      deduped.set(candidate.externalId, candidate);
      continue;
    }
    deduped.set(candidate.externalId, mergeCandidates(current, candidate));
  }

  return Array.from(deduped.values()).slice(0, effectiveMaxItems);
};

const mergeCandidates = (current: OfferCandidate, incoming: OfferCandidate): OfferCandidate => {
  const preferIncoming = incoming.price < current.price;
  const primary = preferIncoming ? incoming : current;
  const secondary = preferIncoming ? current : incoming;

  const pixChoices = [primary.pixPrice, secondary.pixPrice].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  const resolvedPix = pixChoices.length
    ? pickBestPixCandidate(pixChoices, primary.price)
    : null;

  const originalChoices = [primary.originalPrice, secondary.originalPrice].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  const resolvedOriginal = originalChoices.length
    ? Math.max(...originalChoices.filter((value) => value > primary.price))
    : null;

  return {
    ...primary,
    categoryId: primary.categoryId || secondary.categoryId,
    mlCategoryId: primary.mlCategoryId || secondary.mlCategoryId,
    sellerId: primary.sellerId ?? secondary.sellerId,
    sellerName: primary.sellerName ?? secondary.sellerName,
    sellerReputationScore: Math.max(primary.sellerReputationScore, secondary.sellerReputationScore),
    sellerReputationLevel: primary.sellerReputationLevel ?? secondary.sellerReputationLevel,
    sellerPowerStatus: primary.sellerPowerStatus ?? secondary.sellerPowerStatus,
    brand: primary.brand ?? secondary.brand,
    soldQuantity: Math.max(primary.soldQuantity, secondary.soldQuantity),
    popularityRank: Math.min(primary.popularityRank, secondary.popularityRank),
    scorePopularidade: Math.max(primary.scorePopularidade, secondary.scorePopularidade),
    scoreCustoBeneficio: Math.max(primary.scoreCustoBeneficio, secondary.scoreCustoBeneficio),
    isElite: primary.isElite || secondary.isElite,
    freeShipping: primary.freeShipping || secondary.freeShipping,
    originalPrice: Number.isFinite(resolvedOriginal as number) ? resolvedOriginal : null,
    pixPrice: resolvedPix,
  };
};

const extractCatalogProductId = (value: unknown): string | null => {
  if (!value) return null;
  const normalized = String(value).toUpperCase().trim();
  const match = normalized.match(/MLB\d{6,12}/);
  if (!match) return null;
  return match[0];
};

const extractCatalogProductIdFromUrl = (urlValue: string | null | undefined): string | null => {
  if (!isValidHttpUrl(urlValue)) return null;
  try {
    const url = new URL(urlValue as string);
    const fromPath = url.pathname.match(/\/p\/(MLB\d{6,12})/i);
    if (fromPath?.[1]) return fromPath[1].toUpperCase();

    for (const key of ["item_id", "wid", "id"]) {
      const raw = url.searchParams.get(key);
      const match = raw?.match(/MLB(\d{6,12})/i);
      if (match?.[1]) return `MLB${match[1]}`;
    }
    const encodedItemId = (urlValue as string).match(/item_id%3AMLB(\d{6,12})/i);
    if (encodedItemId?.[1]) return `MLB${encodedItemId[1]}`;
    return null;
  } catch {
    const encodedItemId = String(urlValue).match(/item_id%3AMLB(\d{6,12})/i);
    if (encodedItemId?.[1]) return `MLB${encodedItemId[1]}`;
    return null;
  }
};

const buildCandidateFingerprintKey = (candidate: OfferCandidate) => {
  const normalizedTitle = normalizeText(candidate.title);
  if (!normalizedTitle || normalizedTitle.length < 10) return null;
  const compactTitle = normalizedTitle
    .replace(/\b(kit|com|para|de|do|da|e|em|no|na|o|a)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!compactTitle) return null;
  const normalizedBrand = normalizeText(candidate.brand ?? "");
  return `fingerprint:${candidate.categoryId}:${normalizedBrand}:${compactTitle.slice(0, 140)}`;
};

const buildExistingFingerprintKey = (existing: ExistingProductRow) => {
  const normalizedTitle = normalizeText(existing.name ?? "");
  if (!normalizedTitle || normalizedTitle.length < 10) return null;
  const compactTitle = normalizedTitle
    .replace(/\b(kit|com|para|de|do|da|e|em|no|na|o|a)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!compactTitle) return null;
  const categoryKey = normalizeText(existing.category_id ?? "");
  return `fingerprint:${categoryKey}::${compactTitle.slice(0, 140)}`;
};

const buildCandidateCanonicalKey = (candidate: OfferCandidate) => {
  const payload = candidate.rawPayload ?? {};
  const payloadItem = toRecord(toRecord(payload)?.item);
  const payloadProduct = toRecord(toRecord(payload)?.product);

  const catalogProductId =
    extractCatalogProductId(payloadItem?.catalog_product_id) ??
    extractCatalogProductId(payloadProduct?.id) ??
    extractCatalogProductId((payload as Record<string, unknown>)?.catalog_product_id) ??
    extractCatalogProductIdFromUrl(candidate.permalink);

  if (catalogProductId) return `catalog:${catalogProductId}`;

  const fingerprintKey = buildCandidateFingerprintKey(candidate);
  if (fingerprintKey) return fingerprintKey;

  if (isValidHttpUrl(candidate.permalink)) {
    try {
      const url = new URL(candidate.permalink);
      const cleanPath = url.pathname.replace(/\/+$/, "").toLowerCase();
      if (cleanPath) return `path:${cleanPath}`;
    } catch {
      // Ignore parse failure and fallback to textual key.
    }
  }

  return `external:${candidate.externalId}`;
};

const buildExistingCanonicalKey = (existing: ExistingProductRow) => {
  const catalogProductId =
    extractCatalogProductIdFromUrl(existing.source_url) ??
    extractCatalogProductIdFromUrl(existing.affiliate_link) ??
    extractCatalogProductId(existing.external_id);

  if (catalogProductId) return `catalog:${catalogProductId}`;

  const fingerprint = buildExistingFingerprintKey(existing);
  if (fingerprint) return fingerprint;

  if (isValidHttpUrl(existing.source_url)) {
    try {
      const url = new URL(existing.source_url as string);
      const cleanPath = url.pathname.replace(/\/+$/, "").toLowerCase();
      if (cleanPath) return `path:${cleanPath}`;
    } catch {
      // Ignore parse failure and fallback.
    }
  }

  const externalId = normalizeExternalId(existing.external_id);
  if (externalId) return `external:${externalId}`;
  return `id:${existing.id}`;
};

const getExistingCanonicalPriority = (existing: ExistingProductRow) => {
  let priority = 0;
  if (isCuratedPinnedProduct(existing)) priority += 1000;
  if (existing.is_active === true || existing.status === "active") priority += 400;
  if (isMercadoLivreShortAffiliateLink(existing.affiliate_link)) priority += 120;
  if (verifyAffiliateLink(existing.affiliate_link, existing.source_url)) priority += 80;
  if (existing.is_featured) priority += 20;
  return priority;
};

const getExistingEffectivePrice = (existing: ExistingProductRow) => {
  if (typeof existing.pix_price === "number" && existing.pix_price > 0) {
    return existing.pix_price;
  }
  return existing.price;
};

const pickPreferredExistingProductRowForCanonical = (
  a: ExistingProductRow,
  b: ExistingProductRow,
) => {
  const aPriority = getExistingCanonicalPriority(a);
  const bPriority = getExistingCanonicalPriority(b);
  if (aPriority !== bPriority) return aPriority > bPriority ? a : b;

  const aPrice = getExistingEffectivePrice(a);
  const bPrice = getExistingEffectivePrice(b);
  if (aPrice !== bPrice) return aPrice < bPrice ? a : b;

  return a.id.localeCompare(b.id) <= 0 ? a : b;
};

const pickBestCandidateForCanonical = (a: OfferCandidate, b: OfferCandidate) => {
  const ordering = sortCandidatesByPriority(a, b);
  if (ordering < 0) return a;
  if (ordering > 0) return b;
  const aEffective = a.pixPrice ?? a.price;
  const bEffective = b.pixPrice ?? b.price;
  if (aEffective !== bEffective) return aEffective < bEffective ? a : b;
  return a.externalId.localeCompare(b.externalId) <= 0 ? a : b;
};

const fetchMappings = async (
  supabase: ReturnType<typeof createClient>,
  options: {
    includeInactive: boolean;
    mappingIds: string[];
    categoryId: string | null;
    maxMappings: number;
  },
) => {
  let query = supabase
    .from("category_marketplace_map")
    .select(
      "id, category_id, site_id, ml_category_id, site_category, ml_category_allowlist, query, seller_ids, include_terms, exclude_terms, max_items, enabled, max_active, max_standby, max_new_per_day, min_delta_score_to_replace, max_price_equipment, is_active, sort_mode",
    )
    .eq("marketplace", "mercadolivre");

  if (!options.includeInactive) {
    query = query.eq("is_active", true);
  }
  if (options.mappingIds.length) {
    query = query.in("id", options.mappingIds);
  }
  if (options.categoryId) {
    query = query.eq("category_id", options.categoryId);
  }

  const { data, error } = await query.order("updated_at", { ascending: false }).limit(options.maxMappings);
  if (error) throw new Error(error.message);
  return (data as MappingRow[] | null) ?? [];
};

const collectMappingCandidates = async (
  mapping: MappingRow,
  maxItemsOverride: number | null,
  runDeadlineMs: number,
  options: {
    sellerProfileCache: Map<number, SellerProfile | null>;
    itemCache: Map<string, Record<string, unknown>>;
    defaultSellerIds: number[];
    authUserId: number | null;
    useAuthSellerFallback: boolean;
    fetchJson: (url: string) => Promise<Record<string, unknown>>;
    stats: {
      discarded_no_free_shipping: number;
      discarded_low_reputation: number;
      discarded_not_new: number;
      discarded_invalid_price: number;
      api_errors: number;
    };
  },
) => {
  const effectiveMaxItems = clamp(
    toPositiveInt(maxItemsOverride ?? mapping.max_items ?? DEFAULT_MAX_ITEMS_PER_MAPPING, DEFAULT_MAX_ITEMS_PER_MAPPING),
    1,
    MAX_ITEMS_HARD_CAP,
  );

  const explicitSellerIds = normalizeSellerIds(mapping.seller_ids);
  const singleAuthSellerOnly = Boolean(
    options.authUserId !== null &&
      explicitSellerIds.length === 1 &&
      explicitSellerIds[0] === options.authUserId,
  );
  const allowDiscoveryFallback = ENABLE_HIGHLIGHTS_DISCOVERY &&
    (explicitSellerIds.length === 0 || singleAuthSellerOnly);
  const fallbackSellerIds = Array.from(
    new Set([
      ...options.defaultSellerIds,
      ...(options.useAuthSellerFallback && options.authUserId !== null ? [options.authUserId] : []),
    ]),
  );
  const sellerContexts = explicitSellerIds.length ? explicitSellerIds : fallbackSellerIds;
  const useSiteSearchFallback = sellerContexts.length === 0 && !allowDiscoveryFallback;
  const contextCount = useSiteSearchFallback ? 1 : sellerContexts.length;
  const maxPerContext = contextCount > 0
    ? Math.max(1, Math.ceil(effectiveMaxItems / contextCount))
    : effectiveMaxItems;
  const sort = mapSortMode(mapping.sort_mode);
  const siteId = mapping.site_id ?? DEFAULT_SITE_ID;

  const out: OfferCandidate[] = [];
  const sellerErrors: string[] = [];
  for (let contextIndex = 0; contextIndex < contextCount; contextIndex += 1) {
    const sellerId = useSiteSearchFallback ? null : sellerContexts[contextIndex] ?? null;
    let offset = 0;
    let fetchedInContext = 0;
    let sellerFailed = false;

    while (fetchedInContext < maxPerContext && Date.now() < runDeadlineMs) {
      const remaining = maxPerContext - fetchedInContext;
      const limit = Math.min(SEARCH_PAGE_LIMIT, remaining);

      let payload: Record<string, unknown>;
      if (sellerId !== null) {
        const sellerUrl = new URL(`${API_BASE}/users/${sellerId}/items/search`);
        sellerUrl.searchParams.set("limit", String(limit));
        sellerUrl.searchParams.set("offset", String(offset));
        if (mapping.query && mapping.query.trim()) {
          sellerUrl.searchParams.set("search", mapping.query.trim());
        }
        if (mapping.ml_category_id && mapping.ml_category_id.trim()) {
          sellerUrl.searchParams.set("category", mapping.ml_category_id.trim());
        }
        if (sort && sort !== "relevance") {
          sellerUrl.searchParams.set("sort", sort);
        }

        try {
          payload = await fetchJsonWithRetry(sellerUrl.toString(), options.fetchJson);
        } catch (error) {
          options.stats.api_errors += 1;
          sellerErrors.push(
            `seller_${sellerId}:${(error as Error)?.message?.slice(0, 200) ?? "request_failed"}`,
          );
          sellerFailed = true;
          break;
        }
      } else {
        const siteUrl = new URL(`${API_BASE}/sites/${encodeURIComponent(siteId)}/search`);
        siteUrl.searchParams.set("limit", String(limit));
        siteUrl.searchParams.set("offset", String(offset));
        if (mapping.query && mapping.query.trim()) {
          siteUrl.searchParams.set("q", mapping.query.trim());
        }
        if (mapping.ml_category_id && mapping.ml_category_id.trim()) {
          siteUrl.searchParams.set("category", mapping.ml_category_id.trim());
        }
        if (sort) {
          siteUrl.searchParams.set("sort", sort);
        }
        try {
          payload = await fetchJsonWithRetry(siteUrl.toString(), options.fetchJson);
        } catch (error) {
          options.stats.api_errors += 1;
          throw new Error((error as Error)?.message ?? "site_search_failed");
        }
      }

      const resultRows = Array.isArray(payload?.results) ? payload.results : [];
      if (!resultRows.length) break;

      for (let idx = 0; idx < resultRows.length; idx += 1) {
        const rawRow = resultRows[idx];
        let row: Record<string, unknown> | null =
          rawRow && typeof rawRow === "object" && !Array.isArray(rawRow)
            ? (rawRow as Record<string, unknown>)
            : null;

        const externalId =
          normalizeExternalId(row?.id ?? rawRow) ??
          (typeof rawRow === "string" ? normalizeExternalId(rawRow) : null);
        if (!externalId) continue;
        const cached = options.itemCache.get(externalId);
        if (cached) {
          row = cached;
        } else {
          const itemUrl = `${API_BASE}/items/${externalId}`;
          try {
            const itemPayload = await fetchJsonWithRetry(itemUrl, options.fetchJson);
            options.itemCache.set(externalId, itemPayload);
            row = itemPayload;
          } catch {
            options.stats.api_errors += 1;
            continue;
          }
        }

        if (!row) continue;
        const rawPrice = toNumber(row.price);
        if (rawPrice === null || !(rawPrice > 0)) {
          options.stats.discarded_invalid_price += 1;
          continue;
        }

        const candidate = buildCandidateFromResult(row, mapping, offset + idx + 1);
        if (!candidate) continue;
        if (candidate.sellerId === null) {
          candidate.sellerId = sellerId;
        }

        if (!candidate.freeShipping) {
          options.stats.discarded_no_free_shipping += 1;
          continue;
        }
        if (String(candidate.itemCondition ?? "").toLowerCase() !== "new") {
          options.stats.discarded_not_new += 1;
          continue;
        }

        if (!isHighSellerReputation(candidate.sellerReputationScore) && candidate.sellerId !== null) {
          const profile = await fetchSellerProfile(
            candidate.sellerId,
            options.sellerProfileCache,
            options.fetchJson,
          );
          if (profile) {
            candidate.sellerReputationScore = profile.reputationScore;
            candidate.sellerReputationLevel = profile.reputationLevel;
            candidate.sellerPowerStatus = profile.powerStatus;
          }
        }

        if (!isHighSellerReputation(candidate.sellerReputationScore)) {
          options.stats.discarded_low_reputation += 1;
          continue;
        }

        out.push(candidate);
      }

      fetchedInContext += resultRows.length;
      offset += resultRows.length;

      const paging = payload?.paging as Record<string, unknown> | undefined;
      const total = toNonNegativeInt(paging?.total, 0);
      if (resultRows.length < limit) break;
      if (total > 0 && offset >= total) break;
    }

    if (sellerFailed) continue;
  }

  const deduped = new Map<string, OfferCandidate>();
  for (const candidate of out) {
    const current = deduped.get(candidate.externalId);
    if (!current) {
      deduped.set(candidate.externalId, candidate);
      continue;
    }
    deduped.set(candidate.externalId, mergeCandidates(current, candidate));
  }
  const dedupedList = Array.from(deduped.values()).slice(0, effectiveMaxItems);
  if (!dedupedList.length && sellerContexts.length > 0 && sellerErrors.length >= sellerContexts.length) {
    throw new Error(`seller_fetch_failed:${sellerErrors.slice(0, 3).join("|")}`);
  }
  if (dedupedList.length > 0 || !allowDiscoveryFallback) {
    return dedupedList;
  }

  const discoveryCandidates = await collectCategoryHighlightsCandidates(
    mapping,
    effectiveMaxItems,
    runDeadlineMs,
    {
      sellerProfileCache: options.sellerProfileCache,
      fetchJson: options.fetchJson,
      stats: options.stats,
    },
  );
  if (!discoveryCandidates.length) return dedupedList;

  for (const candidate of discoveryCandidates) {
    const current = deduped.get(candidate.externalId);
    if (!current) {
      deduped.set(candidate.externalId, candidate);
      continue;
    }
    deduped.set(candidate.externalId, mergeCandidates(current, candidate));
  }

  return Array.from(deduped.values()).slice(0, effectiveMaxItems);
};

const loadExistingOffersByExternalId = async (
  supabase: ReturnType<typeof createClient>,
  externalIds: string[],
) => {
  const out = new Map<string, ExistingOfferRow>();
  const uniqueIds = Array.from(new Set(externalIds));
  for (const chunk of chunkArray(uniqueIds, 200)) {
    const { data, error } = await supabase
      .from("product_offers")
      .select("id, external_id, price, original_price, pix_price")
      .eq("marketplace", "mercadolivre")
      .in("external_id", chunk);
    if (error) throw new Error(error.message);
    for (const row of (data as ExistingOfferRow[] | null) ?? []) {
      const normalized = normalizeExternalId(row.external_id);
      if (!normalized) continue;
      out.set(normalized, row);
    }
  }
  return out;
};

const loadExistingProductsByExternalId = async (
  supabase: ReturnType<typeof createClient>,
  externalIds: string[],
) => {
  const out = new Map<string, ExistingProductRow>();
  const uniqueIds = Array.from(new Set(externalIds));
  for (const chunk of chunkArray(uniqueIds, 200)) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, external_id, name, slug, description, short_description, specifications, advantages, image_url, image_url_original, image_url_cached, images, category_id, affiliate_link, affiliate_verified, affiliate_generated_at, source_url, pix_price, pix_price_source, pix_price_checked_at, last_ml_description_hash, description_last_synced_at, description_manual_override, quality_issues, curation_badges, is_featured, status, is_active, price, original_price, discount_percentage, is_on_sale, free_shipping",
      )
      .eq("marketplace", "mercadolivre")
      .in("external_id", chunk);
    if (error) throw new Error(error.message);
    for (const row of (data as ExistingProductRow[] | null) ?? []) {
      const normalized = normalizeExternalId(row.external_id);
      if (!normalized) continue;
      out.set(normalized, row);
    }
  }
  return out;
};

const loadCategoryConfigs = async (
  supabase: ReturnType<typeof createClient>,
  categoryIds: string[],
) => {
  const configMap = new Map<string, CategoryConfigRow>();
  const uniqueCategoryIds = Array.from(new Set(categoryIds));
  if (!uniqueCategoryIds.length) return configMap;

  for (const chunk of chunkArray(uniqueCategoryIds, 200)) {
    const { data, error } = await supabase
      .from("category_config")
      .select(
        "category_id, max_products, min_daily_new, elite_enabled, enabled, priority_weight_sales, priority_weight_price, priority_weight_reputation, known_brands, expensive_percentile, min_sales_for_elite, min_reputation_for_elite",
      )
      .in("category_id", chunk);
    if (error) throw new Error(error.message);
    for (const row of (data as CategoryConfigRow[] | null) ?? []) {
      configMap.set(row.category_id, {
        category_id: row.category_id,
        max_products: clamp(toPositiveInt(row.max_products, BASE_CATEGORY_LIMIT), 1, 200),
        min_daily_new: clamp(toNonNegativeInt(row.min_daily_new, BASE_MIN_DAILY_NEW), 0, 50),
        elite_enabled: Boolean(row.elite_enabled),
        enabled: Boolean(row.enabled),
        priority_weight_sales: Number(row.priority_weight_sales ?? DEFAULT_WEIGHT_SALES),
        priority_weight_price: Number(row.priority_weight_price ?? DEFAULT_WEIGHT_PRICE),
        priority_weight_reputation: Number(row.priority_weight_reputation ?? DEFAULT_WEIGHT_REPUTATION),
        known_brands: row.known_brands ?? [],
        expensive_percentile: normalizeScore(Number(row.expensive_percentile ?? DEFAULT_EXPENSIVE_PERCENTILE)),
        min_sales_for_elite: Math.max(0, toNonNegativeInt(row.min_sales_for_elite, DEFAULT_MIN_SALES_FOR_ELITE)),
        min_reputation_for_elite: normalizeScore(
          Number(row.min_reputation_for_elite ?? DEFAULT_MIN_REPUTATION_FOR_ELITE),
        ),
      });
    }
  }

  return configMap;
};

const loadExistingCategoryProducts = async (
  supabase: ReturnType<typeof createClient>,
  categoryIds: string[],
) => {
  const out: ExistingProductRow[] = [];
  const uniqueCategoryIds = Array.from(new Set(categoryIds));
  if (!uniqueCategoryIds.length) return out;

  for (const chunk of chunkArray(uniqueCategoryIds, 100)) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, external_id, name, slug, description, short_description, specifications, advantages, image_url, image_url_original, image_url_cached, images, category_id, affiliate_link, affiliate_verified, affiliate_generated_at, source_url, pix_price, pix_price_source, pix_price_checked_at, last_ml_description_hash, description_last_synced_at, description_manual_override, quality_issues, curation_badges, is_featured, status, is_active, price, original_price, discount_percentage, is_on_sale, free_shipping",
      )
      .eq("marketplace", "mercadolivre")
      .in("category_id", chunk);
    if (error) throw new Error(error.message);
    out.push(...((data as ExistingProductRow[] | null) ?? []));
  }

  return out;
};

const loadProductScoresMap = async (
  supabase: ReturnType<typeof createClient>,
  productIds: string[],
) => {
  const out = new Map<string, ProductScoreRow>();
  const uniqueIds = Array.from(new Set(productIds));
  if (!uniqueIds.length) return out;

  for (const chunk of chunkArray(uniqueIds, 200)) {
    const { data, error } = await supabase
      .from("product_scores")
      .select(
        "product_id, category_id, score_popularidade, score_custo_beneficio, seller_reputation, sold_quantity, popularity_rank, is_elite, last_evaluated_at",
      )
      .in("product_id", chunk);
    if (error) throw new Error(error.message);
    for (const row of (data as ProductScoreRow[] | null) ?? []) {
      out.set(row.product_id, row);
    }
  }

  return out;
};

const getScoreForExistingProduct = (
  productId: string,
  scoresByProductId: Map<string, ProductScoreRow>,
) => {
  const row = scoresByProductId.get(productId);
  const score = Number(row?.score_custo_beneficio ?? 0);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
};

const resolveCategoryRuntimeLimits = (
  config: CategoryConfigRow,
  mappings: MappingRow[],
): CategoryRuntimeLimits => {
  const positiveInts = (values: Array<number | null | undefined>) =>
    values
      .map((value) => (typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null))
      .filter((value): value is number => value !== null && value > 0);
  const numeric = (values: Array<number | null | undefined>) =>
    values
      .map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null))
      .filter((value): value is number => value !== null);

  const mappedMaxActive = positiveInts(mappings.map((mapping) => mapping.max_active));
  const maxActive = clamp(
    mappedMaxActive.length ? Math.max(...mappedMaxActive) : toPositiveInt(config.max_products, BASE_CATEGORY_LIMIT),
    1,
    250,
  );

  const mappedMaxStandby = positiveInts(mappings.map((mapping) => mapping.max_standby));
  const fallbackStandby = Math.max(
    maxActive,
    Math.floor(maxActive * Math.max(1, DEFAULT_MAX_STANDBY_MULTIPLIER)),
  );
  const maxStandby = clamp(
    mappedMaxStandby.length ? Math.max(...mappedMaxStandby) : fallbackStandby,
    1,
    500,
  );

  const mappedMaxNewPerDay = positiveInts(mappings.map((mapping) => mapping.max_new_per_day));
  const maxNewPerDay = clamp(
    mappedMaxNewPerDay.length
      ? Math.max(...mappedMaxNewPerDay)
      : Math.max(DEFAULT_MAX_NEW_PER_DAY, toNonNegativeInt(config.min_daily_new, BASE_MIN_DAILY_NEW)),
    0,
    50,
  );

  const mappedMinDelta = numeric(mappings.map((mapping) => mapping.min_delta_score_to_replace));
  const minDeltaScoreToReplace = clamp(
    mappedMinDelta.length ? Math.max(...mappedMinDelta) : DEFAULT_MIN_DELTA_SCORE_TO_REPLACE,
    0,
    100,
  );

  return {
    maxActive,
    maxStandby,
    maxNewPerDay,
    minDeltaScoreToReplace,
  };
};

const getCategoryRuntimeLimitsMap = (
  categoryIds: string[],
  mappings: MappingRow[],
  configMap: Map<string, CategoryConfigRow>,
) => {
  const mappingsByCategory = new Map<string, MappingRow[]>();
  for (const mapping of mappings) {
    if (!mappingsByCategory.has(mapping.category_id)) {
      mappingsByCategory.set(mapping.category_id, []);
    }
    mappingsByCategory.get(mapping.category_id)?.push(mapping);
  }

  const out = new Map<string, CategoryRuntimeLimits>();
  for (const categoryId of Array.from(new Set(categoryIds))) {
    const config = configMap.get(categoryId) ?? toDefaultCategoryConfig(categoryId);
    const categoryMappings = mappingsByCategory.get(categoryId) ?? [];
    out.set(categoryId, resolveCategoryRuntimeLimits(config, categoryMappings));
  }
  return out;
};

const getCandidateAttributeRowsForFitness = (candidate: OfferCandidate) => {
  const payloadRoot = toRecord(candidate.rawPayload) ?? {};
  const payloadItem = toRecord(payloadRoot.item);
  const payloadProduct = toRecord(payloadRoot.product);
  return [
    ...collectAttributes(payloadRoot),
    ...(payloadItem ? collectAttributes(payloadItem) : []),
    ...(payloadProduct ? collectAttributes(payloadProduct) : []),
  ];
};

const evaluateCandidateFitnessGate = (
  candidate: OfferCandidate,
  mapping: MappingRow | null,
) => {
  const attributes = getCandidateAttributeRowsForFitness(candidate).map((row) => ({
    name: row.name,
    value_name: row.value,
  }));
  const mlCategoryAllowlist = normalizeMlAllowlist(mapping?.ml_category_allowlist ?? null);
  const maxPriceEquipment =
    mapping && typeof mapping.max_price_equipment === "number" && Number.isFinite(mapping.max_price_equipment)
      ? Math.max(0, mapping.max_price_equipment)
      : null;

  const result = evaluateFitnessGate(candidate.siteCategory, {
    title: candidate.title,
    brand: candidate.brand,
    attributes,
    mlCategoryId: candidate.mlCategoryId,
    mlCategoryAllowlist,
    extraText: candidate.itemCondition ?? "",
  });

  const equipmentPriceRejected =
    candidate.siteCategory === SITE_CATEGORIES.EQUIPAMENTOS &&
    maxPriceEquipment !== null &&
    maxPriceEquipment > 0 &&
    candidate.price > maxPriceEquipment;

  const score = clamp(result.score, 0, 100);
  let decision: "allow" | "standby" | "reject" = "reject";
  if (
    !result.blockedByAllowlist &&
    !result.blockedByNegative &&
    !result.blockedByAmbiguous &&
    !equipmentPriceRejected
  ) {
    if (score >= FITNESS_GATE_ALLOW_SCORE) decision = "allow";
    else if (score >= FITNESS_GATE_STANDBY_SCORE) decision = "standby";
  }

  return {
    ...result,
    score,
    decision,
    equipmentPriceRejected,
  };
};

const getCategoryStateMap = (
  categoryIds: string[],
  existingProducts: ExistingProductRow[],
  configMap: Map<string, CategoryConfigRow>,
  scoresByProductId: Map<string, ProductScoreRow>,
  runtimeLimitsMap: Map<string, CategoryRuntimeLimits>,
) => {
  const out = new Map<string, CategorySelectionState>();
  for (const categoryId of Array.from(new Set(categoryIds))) {
    const config = configMap.get(categoryId) ?? toDefaultCategoryConfig(categoryId);
    const existingActive = existingProducts.filter(
      (item) => item.category_id === categoryId && item.is_active === true,
    );
    const existingStandby = existingProducts.filter(
      (item) => item.category_id === categoryId && item.is_active !== true,
    );
    const existingByExternal = new Map<string, ExistingProductRow>();
    for (const product of existingProducts.filter((item) => item.category_id === categoryId)) {
      const externalId = normalizeExternalId(product.external_id);
      if (!externalId) continue;
      existingByExternal.set(externalId, product);
    }
    const runtime = runtimeLimitsMap.get(categoryId) ??
      resolveCategoryRuntimeLimits(config, []);

    out.set(categoryId, {
      config,
      existingActive,
      existingStandby,
      existingByExternal,
      existingScoresByProductId: scoresByProductId,
      maxActive: runtime.maxActive,
      maxStandby: runtime.maxStandby,
      maxNewPerDay: runtime.maxNewPerDay,
      minDeltaScoreToReplace: runtime.minDeltaScoreToReplace,
    });
  }
  return out;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: JSON_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "missing_supabase_env" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const cronSecret = Deno.env.get("CRON_SECRET") ?? Deno.env.get("X_CRON_SECRET");
  if (!cronSecret) {
    return new Response(JSON.stringify({ ok: false, error: "CRON_SECRET missing" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const providedSecret = req.headers.get("x-cron-secret");
  if (providedSecret !== cronSecret) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  const payload = await parseBody(req);
  const source = typeof (payload as any)?.source === "string" ? String((payload as any).source) : "cron";
  const dryRun = toBoolean((payload as any)?.dry_run ?? (payload as any)?.dryRun, false);
  const includeInactive = toBoolean(
    (payload as any)?.include_inactive ?? (payload as any)?.includeInactive,
    false,
  );
  const mappingIds = Array.isArray((payload as any)?.mapping_ids)
    ? (payload as any).mapping_ids.filter((id: unknown) => typeof id === "string")
    : [];
  const categoryId =
    typeof (payload as any)?.category_id === "string" ? String((payload as any).category_id) : null;
  const maxMappings = clamp(
    toPositiveInt((payload as any)?.max_mappings ?? (payload as any)?.maxMappings, DEFAULT_MAX_MAPPINGS),
    1,
    100,
  );
  const maxItemsOverrideRaw = (payload as any)?.max_items ?? (payload as any)?.maxItems;
  const maxItemsOverride = maxItemsOverrideRaw === undefined
    ? null
    : clamp(toPositiveInt(maxItemsOverrideRaw, DEFAULT_MAX_ITEMS_PER_MAPPING), 1, MAX_ITEMS_HARD_CAP);
  const maxRuntimeMs = clamp(
    toPositiveInt((payload as any)?.max_runtime_ms ?? (payload as any)?.maxRuntimeMs, DEFAULT_MAX_RUNTIME_MS),
    15000,
    240000,
  );
  const payloadDefaultSellerIds = normalizeSellerIds(
    Array.isArray((payload as any)?.default_seller_ids)
      ? ((payload as any).default_seller_ids as Array<number | string>)
      : Array.isArray((payload as any)?.defaultSellerIds)
        ? ((payload as any).defaultSellerIds as Array<number | string>)
        : [],
  );
  const defaultSellerIds = payloadDefaultSellerIds.length
    ? payloadDefaultSellerIds
    : DEFAULT_SELLER_IDS_FROM_ENV;
  const useAuthSellerFallback = toBoolean(
    (payload as any)?.use_auth_seller_fallback ??
      (payload as any)?.useAuthSellerFallback ??
      Deno.env.get("CATALOG_INGEST_USE_AUTH_SELLER_FALLBACK"),
    false,
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

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

  const tokenRowId = tokenState.tokenRowId;
  let currentAccessToken = tokenState.tokens.access_token ?? null;
  let currentRefreshToken = tokenState.tokens.refresh_token ?? null;

  const refresh = async () => {
    if (!currentRefreshToken) {
      return { ok: false, status: 500, body: { error: "MELI_REFRESH_TOKEN missing" } };
    }
    if (!clientId || !clientSecret) {
      return { ok: false, status: 500, body: { error: "MELI_CLIENT_ID/SECRET missing" } };
    }

    const result = await refreshAccessToken({
      refreshToken: currentRefreshToken,
      clientId,
      clientSecret,
    });
    if (!result.resp.ok) {
      return { ok: false, status: result.resp.status, body: result.data };
    }

    currentAccessToken = String((result.data as any)?.access_token ?? "") || null;
    currentRefreshToken =
      String((result.data as any)?.refresh_token ?? currentRefreshToken ?? "") || null;
    const expiresIn = Number((result.data as any)?.expires_in ?? 0);
    const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    const updateResult = await updateMeliTokens(supabase, tokenRowId, {
      access_token: currentAccessToken,
      refresh_token: currentRefreshToken,
      expires_at: expiresAt,
    });
    if ((updateResult as any)?.error) {
      return { ok: false, status: 500, body: { error: (updateResult as any).error } };
    }
    return { ok: true, status: 200, body: { refreshed: true } };
  };

  if (!currentAccessToken && currentRefreshToken && clientId && clientSecret) {
    const bootstrapRefresh = await refresh();
    if (!bootstrapRefresh.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "meli_token_refresh_failed",
          detail: bootstrapRefresh.body,
        }),
        { status: 500, headers: JSON_HEADERS },
      );
    }
  }

  const fetchMeliJson = createMeliJsonFetcher({
    getToken: () => currentAccessToken,
    refresh,
  });

  try {
    await supabase.rpc("set_cron_secret", {
      p_key: "catalog-ingest",
      p_value: cronSecret,
    });
  } catch {
    // Non-blocking: schedule can continue with existing key.
  }

  const runId = crypto.randomUUID();
  const runStartedAt = new Date().toISOString();
  const runDeadlineMs = Date.now() + maxRuntimeMs;
  const lockTtlSeconds = Math.max(DEFAULT_LOCK_TTL_SECONDS, Math.ceil((maxRuntimeMs + 60000) / 1000));
  let lockAcquired = false;
  let lockReleased = false;

  const upsertRun = async (runPayload: Record<string, unknown>) => {
    const { error } = await supabase
      .from("catalog_ingest_runs")
      .upsert(runPayload, { onConflict: "id" });
    if (error) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "catalog_ingest_runs_upsert_failed",
          run_id: runId,
          error: error.message,
        }),
      );
    }
  };

  const releaseLock = async () => {
    if (!lockAcquired || lockReleased) return;
    lockReleased = true;
    try {
      await supabase.rpc("release_price_sync_lock", {
        lock_key: LOCK_KEY,
        holder_id: runId,
      });
    } catch {
      // Non-blocking: lock has TTL.
    }
  };

  await upsertRun({
    id: runId,
    source,
    status: "running",
    dry_run: dryRun,
    started_at: runStartedAt,
  });

  const { data: lockData, error: lockError } = await supabase.rpc("acquire_price_sync_lock", {
    lock_key: LOCK_KEY,
    holder_id: runId,
    ttl_seconds: lockTtlSeconds,
  });

  if (lockError) {
    await upsertRun({
      id: runId,
      finished_at: new Date().toISOString(),
      status: "failed",
      note: `lock_error:${lockError.message}`,
    });
    return new Response(JSON.stringify({ ok: false, error: lockError.message, run_id: runId }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  if (lockData !== true) {
    await upsertRun({
      id: runId,
      finished_at: new Date().toISOString(),
      status: "skipped",
      note: "lock_busy",
    });
    return new Response(
      JSON.stringify({
        ok: true,
        run_id: runId,
        skipped: "lock_busy",
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  }
  lockAcquired = true;
  const authUserId = await resolveAuthUserId(fetchMeliJson);
  const itemCache = new Map<string, Record<string, unknown>>();

  const stats = {
    total_mappings: 0,
    categories_processed: 0,
    total_candidates: 0,
    total_processed: 0,
    inserted_products: 0,
    updated_products: 0,
    replacements: 0,
    replaced_active: 0,
    elite_added: 0,
    upserted_offers: 0,
    offers_added: 0,
    offers_updated: 0,
    inserted_history: 0,
    skipped: 0,
    discarded_no_free_shipping: 0,
    discarded_low_reputation: 0,
    discarded_not_new: 0,
    discarded_invalid_price: 0,
    discarded_low_score: 0,
    rejected_by_allowlist: 0,
    rejected_by_negative_terms: 0,
    rejected_ambiguous_without_gym_context: 0,
    rejected_low_score: 0,
    inserted_active: 0,
    inserted_standby: 0,
    standby_products: 0,
    api_errors: 0,
    errors: 0,
  };

  try {
    const mappings = await fetchMappings(supabase, {
      includeInactive,
      mappingIds,
      categoryId,
      maxMappings,
    });
    const mappingById = new Map<string, MappingRow>();
    for (const mapping of mappings) {
      mappingById.set(mapping.id, mapping);
    }

    stats.total_mappings = mappings.length;
    await upsertRun({
      id: runId,
      total_mappings: stats.total_mappings,
    });

    if (!mappings.length) {
      await upsertRun({
        id: runId,
        finished_at: new Date().toISOString(),
        status: "empty",
        total_mappings: 0,
      });
      return new Response(
        JSON.stringify({
          ok: true,
          run_id: runId,
          stats,
        }),
        { status: 200, headers: JSON_HEADERS },
      );
    }

    const mergedCandidates = new Map<string, OfferCandidate>();
    const mappingUpdates: MappingUpdateRow[] = [];
    const mappingErrorSamples: Array<{
      mapping_id: string;
      category_id: string;
      error: string;
    }> = [];
    const sellerProfileCache = new Map<number, SellerProfile | null>();
    let stoppedByRuntime = false;

    for (const mapping of mappings) {
      if (Date.now() >= runDeadlineMs) {
        stoppedByRuntime = true;
        break;
      }

      try {
        const mappingCandidates = await collectMappingCandidates(
          mapping,
          maxItemsOverride,
          runDeadlineMs,
          {
            sellerProfileCache,
            itemCache,
            defaultSellerIds,
            authUserId,
            useAuthSellerFallback,
            fetchJson: fetchMeliJson,
            stats,
          },
        );
        stats.total_candidates += mappingCandidates.length;

        for (const candidate of mappingCandidates) {
          const current = mergedCandidates.get(candidate.externalId);
          if (!current) {
            mergedCandidates.set(candidate.externalId, candidate);
            continue;
          }
          mergedCandidates.set(candidate.externalId, mergeCandidates(current, candidate));
        }

        mappingUpdates.push({
          id: mapping.id,
          last_run_at: new Date().toISOString(),
          last_error: null,
        });
      } catch (error) {
        stats.errors += 1;
        const mappedError = (error as Error)?.message?.slice(0, 500) ?? "mapping_error";
        mappingUpdates.push({
          id: mapping.id,
          last_run_at: new Date().toISOString(),
          last_error: mappedError,
        });
        mappingErrorSamples.push({
          mapping_id: mapping.id,
          category_id: mapping.category_id,
          error: mappedError,
        });
      }
    }

    for (const updateRow of mappingUpdates) {
      const { error } = await supabase
        .from("category_marketplace_map")
        .update({
          last_run_at: updateRow.last_run_at,
          last_error: updateRow.last_error,
        })
        .eq("id", updateRow.id);
      if (error) {
        stats.errors += 1;
      }
    }

    const candidates = Array.from(mergedCandidates.values());
    const categoryIds = Array.from(new Set(candidates.map((item) => item.categoryId)));
    const configMap = await loadCategoryConfigs(supabase, categoryIds);
    const runtimeLimitsMap = getCategoryRuntimeLimitsMap(categoryIds, mappings, configMap);

    const candidatesByCategory = new Map<string, OfferCandidate[]>();
    for (const candidate of candidates) {
      const mapping = mappingById.get(candidate.mappingId) ?? null;
      const config = configMap.get(candidate.categoryId) ?? toDefaultCategoryConfig(candidate.categoryId);
      if (!config.enabled) continue;
      if (mapping && mapping.enabled === false) continue;

      const fitness = evaluateCandidateFitnessGate(candidate, mapping);
      candidate.fitnessRelevanceScore = fitness.score;
      candidate.fitnessDecision = fitness.decision;

      if (fitness.blockedByAllowlist) {
        stats.rejected_by_allowlist += 1;
        continue;
      }
      if (fitness.blockedByNegative) {
        stats.rejected_by_negative_terms += 1;
        continue;
      }
      if (fitness.blockedByAmbiguous) {
        stats.rejected_ambiguous_without_gym_context += 1;
        continue;
      }
      if (fitness.decision === "reject" || fitness.equipmentPriceRejected) {
        stats.rejected_low_score += 1;
        stats.discarded_low_score += 1;
        continue;
      }

      if (!candidatesByCategory.has(candidate.categoryId)) {
        candidatesByCategory.set(candidate.categoryId, []);
      }
      candidatesByCategory.get(candidate.categoryId)?.push(candidate);
    }

    for (const [categoryKey, list] of candidatesByCategory.entries()) {
      const config = configMap.get(categoryKey) ?? toDefaultCategoryConfig(categoryKey);
      scoreCategoryCandidates(list, config);
      list.sort(sortCandidatesByPriority);
    }
    stats.categories_processed = candidatesByCategory.size;

    const enabledCandidates = Array.from(candidatesByCategory.values()).flat();
    stats.total_processed = enabledCandidates.length;

    if (dryRun) {
      await upsertRun({
        id: runId,
        finished_at: new Date().toISOString(),
        status: "success",
        categories_processed: stats.categories_processed,
        total_candidates: stats.total_candidates,
        total_processed: stats.total_processed,
        discarded_no_free_shipping: stats.discarded_no_free_shipping,
        discarded_low_reputation: stats.discarded_low_reputation,
        discarded_not_new: stats.discarded_not_new,
        discarded_invalid_price: stats.discarded_invalid_price,
        discarded_low_score: stats.discarded_low_score,
        rejected_by_allowlist: stats.rejected_by_allowlist,
        rejected_by_negative_terms: stats.rejected_by_negative_terms,
        rejected_ambiguous_without_gym_context: stats.rejected_ambiguous_without_gym_context,
        rejected_low_score: stats.rejected_low_score,
        api_errors: stats.api_errors,
        skipped: stats.skipped,
        errors: stats.errors,
        note: stoppedByRuntime ? "runtime_budget_reached_dry_run" : "dry_run",
      });
      return new Response(
        JSON.stringify({
          ok: true,
          run_id: runId,
          dry_run: true,
          seller_context: {
            default_seller_ids: defaultSellerIds,
            auth_user_id: authUserId,
            use_auth_seller_fallback: useAuthSellerFallback,
          },
          stats,
          sample: enabledCandidates.slice(0, 15).map((item) => ({
            external_id: item.externalId,
            title: item.title,
            category_id: item.categoryId,
            brand: item.brand,
            price: item.price,
            sold_quantity: item.soldQuantity,
            seller_reputation: item.sellerReputationScore,
            score_popularidade: item.scorePopularidade,
            score_custo_beneficio: item.scoreCustoBeneficio,
            is_elite: item.isElite,
            site_category: item.siteCategory,
            fitness_relevance_score: item.fitnessRelevanceScore,
            fitness_decision: item.fitnessDecision,
          })),
          mapping_errors: mappingErrorSamples.slice(0, 20),
        }),
        { status: 200, headers: JSON_HEADERS },
      );
    }

    if (!enabledCandidates.length) {
      await upsertRun({
        id: runId,
        finished_at: new Date().toISOString(),
        status: "empty",
        categories_processed: stats.categories_processed,
        total_candidates: stats.total_candidates,
        total_processed: 0,
        discarded_no_free_shipping: stats.discarded_no_free_shipping,
        discarded_low_reputation: stats.discarded_low_reputation,
        discarded_not_new: stats.discarded_not_new,
        discarded_invalid_price: stats.discarded_invalid_price,
        discarded_low_score: stats.discarded_low_score,
        rejected_by_allowlist: stats.rejected_by_allowlist,
        rejected_by_negative_terms: stats.rejected_by_negative_terms,
        rejected_ambiguous_without_gym_context: stats.rejected_ambiguous_without_gym_context,
        rejected_low_score: stats.rejected_low_score,
        api_errors: stats.api_errors,
        errors: stats.errors,
        note: stoppedByRuntime ? "runtime_budget_reached_no_candidates" : "no_candidates",
      });
      return new Response(
        JSON.stringify({
          ok: true,
          run_id: runId,
          stats,
          mapping_errors: mappingErrorSamples.slice(0, 20),
        }),
        { status: 200, headers: JSON_HEADERS },
      );
    }

    const externalIds = enabledCandidates.map((item) => item.externalId);
    const nowIso = new Date().toISOString();
    const existingOffersByExternalId = await loadExistingOffersByExternalId(supabase, externalIds);
    const existingProductsByExternalId = await loadExistingProductsByExternalId(supabase, externalIds);
    const existingCategoryProducts = await loadExistingCategoryProducts(
      supabase,
      Array.from(candidatesByCategory.keys()),
    );
    const existingProductsByCanonicalKey = new Map<string, ExistingProductRow>();
    for (const existing of existingCategoryProducts) {
      const canonicalKey = buildExistingCanonicalKey(existing);
      const current = existingProductsByCanonicalKey.get(canonicalKey);
      if (!current) {
        existingProductsByCanonicalKey.set(canonicalKey, existing);
        continue;
      }
      existingProductsByCanonicalKey.set(
        canonicalKey,
        pickPreferredExistingProductRowForCanonical(current, existing),
      );
    }
    const existingScoresByProductId = await loadProductScoresMap(
      supabase,
      existingCategoryProducts.map((item) => item.id),
    );
    const categoryStateMap = getCategoryStateMap(
      Array.from(candidatesByCategory.keys()),
      existingCategoryProducts,
      configMap,
      existingScoresByProductId,
      runtimeLimitsMap,
    );

    const acceptedCandidates: OfferCandidate[] = [];
    const standbyCandidatesPool = new Map<string, OfferCandidate[]>();
    const deactivatedProducts: ExistingProductRow[] = [];
    const deactivatedProductIds = new Set<string>();
    const curatedPinnedExternalIds = new Set<string>();
    for (const existing of existingCategoryProducts) {
      if (!isCuratedPinnedProduct(existing)) continue;
      const normalizedExternalId = normalizeExternalId(existing.external_id);
      if (!normalizedExternalId) continue;
      curatedPinnedExternalIds.add(normalizedExternalId);
    }

    for (const [categoryKey, categoryCandidates] of candidatesByCategory.entries()) {
      const state = categoryStateMap.get(categoryKey);
      if (!state) continue;

      const activeCandidates = categoryCandidates.filter((candidate) => candidate.fitnessDecision === "allow");
      const standbyCandidates = categoryCandidates.filter((candidate) => candidate.fitnessDecision === "standby");
      if (standbyCandidates.length) {
        standbyCandidatesPool.set(categoryKey, standbyCandidates);
      }

      const existingByExternal = new Map(state.existingByExternal);
      const activePool = [...state.existingActive];
      const protectedExistingIds = new Set<string>();
      for (const candidate of activeCandidates) {
        const existing = existingByExternal.get(candidate.externalId);
        if (existing) protectedExistingIds.add(existing.id);
      }
      for (const existing of activePool) {
        if (isCuratedPinnedProduct(existing)) {
          protectedExistingIds.add(existing.id);
        }
      }
      let activeCount = activePool.length;
      let newAcceptedInCategory = 0;

      for (const candidate of activeCandidates) {
        const current = existingByExternal.get(candidate.externalId) ?? null;
        const alreadyActive = Boolean(current && current.is_active === true);
        if (alreadyActive) {
          acceptedCandidates.push(candidate);
          continue;
        }

        if (newAcceptedInCategory >= state.maxNewPerDay) {
          stats.rejected_low_score += 1;
          stats.discarded_low_score += 1;
          continue;
        }

        if (activeCount < state.maxActive) {
          acceptedCandidates.push(candidate);
          activeCount += 1;
          newAcceptedInCategory += 1;
          continue;
        }

        if (!ENABLE_REPLACEMENTS) {
          stats.rejected_low_score += 1;
          stats.discarded_low_score += 1;
          continue;
        }

        let worstProduct: ExistingProductRow | null = null;
        let worstScore = Number.POSITIVE_INFINITY;
        for (const existing of activePool) {
          if (deactivatedProductIds.has(existing.id)) continue;
          if (protectedExistingIds.has(existing.id)) continue;
          if (isCuratedPinnedProduct(existing)) continue;
          const existingScore = getScoreForExistingProduct(existing.id, state.existingScoresByProductId);
          if (!worstProduct || existingScore < worstScore) {
            worstProduct = existing;
            worstScore = existingScore;
          }
        }

        if (!worstProduct) {
          stats.rejected_low_score += 1;
          stats.discarded_low_score += 1;
          continue;
        }

        const minGainForReplacement = Math.max(
          MIN_REPLACEMENT_GAIN,
          state.minDeltaScoreToReplace / 100,
        );
        if (candidate.scoreCustoBeneficio > worstScore + minGainForReplacement) {
          deactivatedProducts.push(worstProduct);
          deactivatedProductIds.add(worstProduct.id);
          acceptedCandidates.push(candidate);
          stats.replacements += 1;
          stats.replaced_active += 1;
          newAcceptedInCategory += 1;
        } else {
          stats.rejected_low_score += 1;
          stats.discarded_low_score += 1;
        }
      }
    }

    const uniqueAcceptedByExternal = new Map<string, OfferCandidate>();
    for (const candidate of acceptedCandidates) {
      const current = uniqueAcceptedByExternal.get(candidate.externalId);
      if (!current) {
        uniqueAcceptedByExternal.set(candidate.externalId, candidate);
        continue;
      }
      uniqueAcceptedByExternal.set(candidate.externalId, mergeCandidates(current, candidate));
    }

    const uniqueAcceptedByCanonical = new Map<string, OfferCandidate>();
    for (const candidate of uniqueAcceptedByExternal.values()) {
      const canonicalKey = buildCandidateCanonicalKey(candidate);
      const current = uniqueAcceptedByCanonical.get(canonicalKey);
      if (!current) {
        uniqueAcceptedByCanonical.set(canonicalKey, candidate);
        continue;
      }
      const currentIsPinned = curatedPinnedExternalIds.has(current.externalId);
      const candidateIsPinned = curatedPinnedExternalIds.has(candidate.externalId);
      if (currentIsPinned !== candidateIsPinned) {
        uniqueAcceptedByCanonical.set(canonicalKey, candidateIsPinned ? candidate : current);
        continue;
      }
      uniqueAcceptedByCanonical.set(
        canonicalKey,
        pickBestCandidateForCanonical(current, candidate),
      );
    }

    const curatedCandidates = Array.from(uniqueAcceptedByCanonical.values()).sort(sortCandidatesByPriority);

    const curatedExternalIds = new Set(curatedCandidates.map((item) => item.externalId));
    const curatedCanonicalKeys = new Map<string, string>();
    for (const candidate of curatedCandidates) {
      curatedCanonicalKeys.set(buildCandidateCanonicalKey(candidate), candidate.externalId);
    }

    const standbyByCanonical = new Map<string, OfferCandidate>();
    for (const [categoryKey, standbyPoolRaw] of standbyCandidatesPool.entries()) {
      const state = categoryStateMap.get(categoryKey);
      if (!state) continue;

      const standbyPool = [...standbyPoolRaw].sort(sortCandidatesByPriority);
      const currentStandbyCount = state.existingStandby.length;
      const availableStandbySlots = Math.max(0, state.maxStandby - currentStandbyCount);
      let newStandbyAdded = 0;

      for (const candidate of standbyPool) {
        if (curatedExternalIds.has(candidate.externalId)) continue;
        const existing = state.existingByExternal.get(candidate.externalId) ?? null;
        const isExistingRow = Boolean(existing);
        const isExistingStandby = Boolean(existing && existing.is_active !== true);
        if (!isExistingRow && newStandbyAdded >= state.maxNewPerDay) break;
        if (!isExistingRow && newStandbyAdded >= availableStandbySlots) break;

        const canonicalKey = buildCandidateCanonicalKey(candidate);
        if (curatedCanonicalKeys.has(canonicalKey)) continue;
        const current = standbyByCanonical.get(canonicalKey);
        if (!current) {
          standbyByCanonical.set(canonicalKey, candidate);
          if (!isExistingStandby && !isExistingRow) newStandbyAdded += 1;
          continue;
        }
        standbyByCanonical.set(
          canonicalKey,
          pickBestCandidateForCanonical(current, candidate),
        );
      }
    }
    const standbyCandidates = Array.from(standbyByCanonical.values()).sort(sortCandidatesByPriority);

    for (const existing of existingCategoryProducts) {
      if (!existing.is_active) continue;
      if (deactivatedProductIds.has(existing.id)) continue;
      const normalizedExistingExternalId = normalizeExternalId(existing.external_id);
      if (normalizedExistingExternalId && curatedExternalIds.has(normalizedExistingExternalId)) continue;
      const existingCanonicalKey = buildExistingCanonicalKey(existing);
      const selectedExternalId = curatedCanonicalKeys.get(existingCanonicalKey);
      if (!selectedExternalId) continue;
      if (isCuratedPinnedProduct(existing)) continue;
      deactivatedProducts.push(existing);
      deactivatedProductIds.add(existing.id);
    }

    stats.total_processed = curatedCandidates.length + standbyCandidates.length;
    if (!curatedCandidates.length && !standbyCandidates.length) {
      await upsertRun({
        id: runId,
        finished_at: new Date().toISOString(),
        status: "empty",
        total_candidates: stats.total_candidates,
        total_processed: 0,
        categories_processed: stats.categories_processed,
        replacements: stats.replacements,
        discarded_no_free_shipping: stats.discarded_no_free_shipping,
        discarded_low_reputation: stats.discarded_low_reputation,
        discarded_not_new: stats.discarded_not_new,
        discarded_invalid_price: stats.discarded_invalid_price,
        discarded_low_score: stats.discarded_low_score,
        rejected_by_allowlist: stats.rejected_by_allowlist,
        rejected_by_negative_terms: stats.rejected_by_negative_terms,
        rejected_ambiguous_without_gym_context: stats.rejected_ambiguous_without_gym_context,
        rejected_low_score: stats.rejected_low_score,
        api_errors: stats.api_errors,
        errors: stats.errors,
        note: "no_curated_candidates",
      });
      return new Response(
        JSON.stringify({
          ok: true,
          run_id: runId,
          stats,
        }),
        { status: 200, headers: JSON_HEADERS },
      );
    }

    if (deactivatedProducts.length) {
      const deactivatedIds = Array.from(new Set(deactivatedProducts.map((item) => item.id))).filter(Boolean);
      for (const chunk of chunkArray(deactivatedIds, 200)) {
        const { error } = await supabase
          .from("products")
          .update({
            is_active: false,
            status: "standby",
          })
          .in("id", chunk);
        if (error) throw new Error(error.message);
      }
    }

    const productInserts: Array<Record<string, unknown>> = [];
    const productUpdates: Array<Record<string, unknown>> = [];
    const candidateContentCache = new Map<string, CandidateContent>();
    const descriptionFetchBudget = { used: 0 };
    const scoreRowsByExternal = new Map<
      string,
      {
        category_id: string;
        score_popularidade: number;
        score_custo_beneficio: number;
        seller_reputation: number;
        sold_quantity: number;
        popularity_rank: number;
        is_elite: boolean;
      }
    >();

    const persistedCandidates = [...curatedCandidates, ...standbyCandidates];

    for (const candidate of persistedCandidates) {
      const candidateCanonicalKey = buildCandidateCanonicalKey(candidate);
      const existingByExternal = existingProductsByExternalId.get(candidate.externalId) ?? null;
      const existingByCanonical = existingProductsByCanonicalKey.get(candidateCanonicalKey) ?? null;
      const existing = existingByExternal ?? existingByCanonical;
      const forceStandby = candidate.fitnessDecision === "standby";
      const content = await resolveCandidateContent(candidate, {
        fetchJson: fetchMeliJson,
        cache: candidateContentCache,
        descriptionFetchBudget,
      });
      const resolvedOriginal =
        typeof candidate.originalPrice === "number" && candidate.originalPrice > candidate.price
          ? clampMoney(candidate.originalPrice)
          : null;
      const resolvedPrice = clampMoney(candidate.price);
      const discountPercentage =
        resolvedOriginal && resolvedOriginal > resolvedPrice
          ? Math.round(((resolvedOriginal - resolvedPrice) / resolvedOriginal) * 100)
          : 0;
      const isOnSale = discountPercentage > 0;

      scoreRowsByExternal.set(candidate.externalId, {
        category_id: candidate.categoryId,
        score_popularidade: normalizeScore(candidate.scorePopularidade),
        score_custo_beneficio: normalizeScore(candidate.scoreCustoBeneficio),
        seller_reputation: normalizeScore(candidate.sellerReputationScore),
        sold_quantity: Math.max(0, Math.floor(candidate.soldQuantity)),
        popularity_rank: Math.max(1, Math.floor(candidate.popularityRank)),
        is_elite: Boolean(candidate.isElite),
      });

      const curationBadges = buildCurationBadges(candidate);
      const curationSpecs = {
        catalog_curation: {
          score_popularidade: normalizeScore(candidate.scorePopularidade),
          score_custo_beneficio: normalizeScore(candidate.scoreCustoBeneficio),
          seller_reputation: normalizeScore(candidate.sellerReputationScore),
          sold_quantity: Math.max(0, Math.floor(candidate.soldQuantity)),
          popularity_rank: Math.max(1, Math.floor(candidate.popularityRank)),
          is_elite: Boolean(candidate.isElite),
          badges: curationBadges,
          evaluated_at: nowIso,
        },
      };

      if (existing) {
        const keepManualPix =
          existing.pix_price_source === "manual" &&
          typeof existing.pix_price === "number" &&
          Number.isFinite(existing.pix_price) &&
          existing.pix_price > 0 &&
          existing.pix_price < resolvedPrice &&
          hasMeaningfulPixDiscount(resolvedPrice, existing.pix_price);
        const resolvedPix = candidate.pixPrice ?? (keepManualPix ? existing.pix_price : null);
        const resolvedPixSource = candidate.pixPrice !== null ? "api" : keepManualPix ? "manual" : null;
        const resolvedPixCheckedAt =
          candidate.pixPrice !== null
            ? nowIso
            : keepManualPix
              ? existing.pix_price_checked_at
              : null;
        const existingAffiliateVerified = verifyAffiliateLink(
          existing.affiliate_link,
          existing.source_url ?? candidate.permalink,
        );
        const resolvedAffiliateLink = existingAffiliateVerified
          ? existing.affiliate_link
          : candidate.affiliateLink;
        const resolvedAffiliateVerified = verifyAffiliateLink(
          resolvedAffiliateLink,
          existing.source_url ?? candidate.permalink,
        );
        const resolvedAffiliateGeneratedAt = existingAffiliateVerified
          ? (existing.affiliate_generated_at ?? nowIso)
          : nowIso;

        const resolvedImageOriginal = existing.image_url_original ?? content.imageUrlOriginal;
        const resolvedImageMain =
          existing.image_url ??
          existing.image_url_cached ??
          resolvedImageOriginal;

        const descriptionManualOverride = Boolean(existing.description_manual_override);
        const existingDescription = normalizeSingleLine(existing.description) ?? "";
        const existingDescriptionHash = normalizeSingleLine(existing.last_ml_description_hash);
        const hasDescriptionHashChanged = content.descriptionHash !== existingDescriptionHash;
        const shouldSyncDescription = !descriptionManualOverride &&
          (hasDescriptionHashChanged || existingDescription.length < DESCRIPTION_MIN_CHARS);

        const nextDescription = shouldSyncDescription
          ? content.description
          : existing.description ?? content.description;
        const nextShortDescription = shouldSyncDescription
          ? content.shortDescription
          : existing.short_description ?? buildShortDescription(nextDescription, candidate.title);
        const nextDescriptionHash = shouldSyncDescription
          ? content.descriptionHash
          : existing.last_ml_description_hash;
        const nextDescriptionSyncedAt = shouldSyncDescription
          ? nowIso
          : existing.description_last_synced_at;
        const specsBase = shouldSyncDescription
          ? mergeSpecifications(content.specifications, curationSpecs)
          : curationSpecs;
        const nextSpecifications = mergeSpecifications(existing.specifications, specsBase);
        const nextAdvantages = shouldSyncDescription
          ? (content.advantages.length ? content.advantages : existing.advantages ?? [])
          : (existing.advantages ?? content.advantages);

        const quality = evaluateQuality({
          candidate,
          content: {
            ...content,
            description: normalizeSingleLine(nextDescription) ?? "",
            imageUrlOriginal: resolvedImageOriginal ?? resolvedImageMain ?? content.imageUrlOriginal,
          },
          affiliateLink: resolvedAffiliateLink,
        });
        const qualityIssues = forceStandby
          ? Array.from(new Set([...(quality.issues ?? []), "fitness_gate_standby"]))
          : quality.issues;
        const qualityBadges = forceStandby
          ? Array.from(new Set([...(quality.badges ?? []), "STANDBY_REVIEW"]))
          : quality.badges;
        if (!quality.publishable) stats.standby_products += 1;
        if (forceStandby) stats.standby_products += 1;
        const keepPaused = existing.status === "paused" && !isCuratedPinnedProduct(existing);
        const keepPinnedActive = forceStandby && isCuratedPinnedProduct(existing) && existing.is_active === true;
        const nextStatus = keepPaused
          ? "paused"
          : keepPinnedActive
            ? "active"
            : forceStandby
              ? "standby"
              : quality.publishable
                ? "active"
                : "standby";
        const nextIsActive = keepPaused
          ? false
          : keepPinnedActive
            ? true
            : forceStandby
              ? false
              : quality.publishable;

        const previousScore = existingScoresByProductId.get(existing.id);
        if (candidate.isElite && !previousScore?.is_elite) {
          stats.elite_added += 1;
        }

        productUpdates.push({
          id: existing.id,
          category_id: existing.category_id ?? candidate.categoryId,
          source_url: existing.source_url ?? candidate.permalink,
          affiliate_link: resolvedAffiliateLink,
          affiliate_verified: resolvedAffiliateVerified,
          affiliate_generated_at: resolvedAffiliateGeneratedAt,
          description: nextDescription,
          short_description: nextShortDescription,
          last_ml_description_hash: nextDescriptionHash,
          description_last_synced_at: nextDescriptionSyncedAt,
          description_manual_override: existing.description_manual_override ?? false,
          specifications: nextSpecifications,
          advantages: nextAdvantages,
          image_url: resolvedImageMain,
          image_url_original: resolvedImageOriginal,
          image_url_cached: existing.image_url_cached,
          images:
            existing.images && existing.images.length
              ? existing.images
              : resolvedImageMain
                ? [resolvedImageMain]
                : [],
          price: resolvedPrice,
          original_price: resolvedOriginal,
          pix_price: resolvedPix,
          pix_price_source: resolvedPixSource,
          pix_price_checked_at: resolvedPixCheckedAt,
          discount_percentage: discountPercentage,
          is_on_sale: isOnSale,
          is_featured: Boolean(existing.is_featured) || Boolean(candidate.isElite),
          free_shipping: candidate.freeShipping,
          quality_issues: qualityIssues,
          curation_badges: qualityBadges,
          marketplace: "mercadolivre",
          external_id: candidate.externalId,
          status: nextStatus,
          is_active: nextIsActive,
          last_sync: nowIso,
          last_price_source: "catalog_ingest",
          last_price_verified_at: nowIso,
        });

        const previousExternalId = normalizeExternalId(existing.external_id);
        if (previousExternalId && previousExternalId !== candidate.externalId) {
          existingProductsByExternalId.delete(previousExternalId);
        }
        const updatedExistingRow: ExistingProductRow = {
          ...existing,
          external_id: candidate.externalId,
          category_id: existing.category_id ?? candidate.categoryId,
          source_url: existing.source_url ?? candidate.permalink,
          affiliate_link: resolvedAffiliateLink,
          affiliate_verified: resolvedAffiliateVerified,
          affiliate_generated_at: resolvedAffiliateGeneratedAt,
          price: resolvedPrice,
          original_price: resolvedOriginal,
          pix_price: resolvedPix,
          status: nextStatus,
          is_active: nextIsActive,
          free_shipping: candidate.freeShipping,
        };
        existingProductsByExternalId.set(candidate.externalId, updatedExistingRow);
        existingProductsByCanonicalKey.set(candidateCanonicalKey, updatedExistingRow);
      } else {
        if (candidate.isElite) stats.elite_added += 1;
        const slug = slugify(candidate.title, candidate.externalId);
        const quality = evaluateQuality({
          candidate,
          content,
          affiliateLink: candidate.affiliateLink,
        });
        const qualityIssues = forceStandby
          ? Array.from(new Set([...(quality.issues ?? []), "fitness_gate_standby"]))
          : quality.issues;
        const qualityBadges = forceStandby
          ? Array.from(new Set([...(quality.badges ?? []), "STANDBY_REVIEW"]))
          : quality.badges;
        if (!quality.publishable || forceStandby) stats.standby_products += 1;
        const shouldActivate = !forceStandby && quality.publishable;
        productInserts.push({
          name: candidate.title,
          slug,
          description: content.description,
          short_description: content.shortDescription,
          last_ml_description_hash: content.descriptionHash,
          description_last_synced_at: nowIso,
          description_manual_override: false,
          specifications: mergeSpecifications(content.specifications, curationSpecs),
          advantages: content.advantages,
          price: resolvedPrice,
          original_price: resolvedOriginal,
          pix_price: candidate.pixPrice,
          pix_price_source: candidate.pixPrice !== null ? "api" : null,
          pix_price_checked_at: candidate.pixPrice !== null ? nowIso : null,
          discount_percentage: discountPercentage,
          is_on_sale: isOnSale,
          is_featured: Boolean(candidate.isElite),
          category_id: candidate.categoryId,
          image_url: content.imageUrlOriginal,
          image_url_original: content.imageUrlOriginal,
          image_url_cached: null,
          images: content.imageUrlOriginal ? [content.imageUrlOriginal] : [],
          source_url: candidate.permalink,
          affiliate_link: candidate.affiliateLink,
          affiliate_verified: verifyAffiliateLink(candidate.affiliateLink, candidate.permalink),
          affiliate_generated_at: nowIso,
          marketplace: "mercadolivre",
          external_id: candidate.externalId,
          free_shipping: candidate.freeShipping,
          quality_issues: qualityIssues,
          curation_badges: qualityBadges,
          status: shouldActivate ? "active" : "standby",
          is_active: shouldActivate,
          last_sync: nowIso,
          last_price_source: "catalog_ingest",
          last_price_verified_at: nowIso,
        });
      }
    }

    if (productInserts.length) {
      for (const chunk of chunkArray(productInserts, 100)) {
        const { data, error } = await supabase
          .from("products")
          .insert(chunk)
          .select(
            "id, external_id, name, slug, description, short_description, specifications, advantages, image_url, image_url_original, image_url_cached, images, category_id, affiliate_link, affiliate_verified, affiliate_generated_at, source_url, pix_price, pix_price_source, pix_price_checked_at, last_ml_description_hash, description_last_synced_at, description_manual_override, quality_issues, curation_badges, is_featured, status, is_active, price, original_price, discount_percentage, is_on_sale, free_shipping",
          );
        if (error) throw new Error(error.message);
        for (const row of (data as ExistingProductRow[] | null) ?? []) {
          const normalized = normalizeExternalId(row.external_id);
          if (!normalized) continue;
          existingProductsByExternalId.set(normalized, row);
          const canonicalKey = buildExistingCanonicalKey(row);
          const currentCanonical = existingProductsByCanonicalKey.get(canonicalKey);
          if (!currentCanonical) {
            existingProductsByCanonicalKey.set(canonicalKey, row);
          } else {
            existingProductsByCanonicalKey.set(
              canonicalKey,
              pickPreferredExistingProductRowForCanonical(currentCanonical, row),
            );
          }
          stats.inserted_products += 1;
          if (row.is_active === true || row.status === "active") {
            stats.inserted_active += 1;
          } else {
            stats.inserted_standby += 1;
          }
        }
      }
    }

    if (productUpdates.length) {
      for (const chunk of chunkArray(productUpdates, 40)) {
        for (const rawRow of chunk) {
          const row = { ...rawRow } as Record<string, unknown>;
          const id = normalizeSingleLine(row.id);
          if (!id) continue;
          delete row.id;
          const { error } = await supabase
            .from("products")
            .update(row)
            .eq("id", id);
          if (error) throw new Error(error.message);
          stats.updated_products += 1;
        }
      }
    }

    const productScoreUpserts: Array<Record<string, unknown>> = [];
    for (const candidate of persistedCandidates) {
      const linkedProduct = existingProductsByExternalId.get(candidate.externalId);
      if (!linkedProduct) continue;
      const score = scoreRowsByExternal.get(candidate.externalId);
      if (!score) continue;
      productScoreUpserts.push({
        product_id: linkedProduct.id,
        category_id: score.category_id,
        score_popularidade: score.score_popularidade,
        score_custo_beneficio: score.score_custo_beneficio,
        seller_reputation: score.seller_reputation,
        sold_quantity: score.sold_quantity,
        popularity_rank: score.popularity_rank,
        is_elite: score.is_elite,
        score_version: "v3_fitness_gate",
        last_evaluated_at: nowIso,
      });
    }

    if (productScoreUpserts.length) {
      for (const chunk of chunkArray(productScoreUpserts, 200)) {
        const { error } = await supabase
          .from("product_scores")
          .upsert(chunk, { onConflict: "product_id" });
        if (error) throw new Error(error.message);
      }
    }

    const offerRows = persistedCandidates.map((candidate) => {
      const linkedProduct = existingProductsByExternalId.get(candidate.externalId);
      return {
        product_id: linkedProduct?.id ?? null,
        category_id: linkedProduct?.category_id ?? candidate.categoryId,
        marketplace: "mercadolivre",
        site_id: candidate.siteId,
        external_id: candidate.externalId,
        ml_category_id: candidate.mlCategoryId,
        seller_id: candidate.sellerId,
        seller_name: candidate.sellerName,
        title: candidate.title,
        permalink: candidate.permalink,
        affiliate_link: candidate.affiliateLink,
        thumbnail_url: candidate.thumbnailUrl,
        price: candidate.price,
        original_price: candidate.originalPrice,
        pix_price: candidate.pixPrice,
        currency_id: candidate.currencyId || "BRL",
        free_shipping: candidate.freeShipping,
        item_condition: candidate.itemCondition,
        item_status: candidate.itemStatus,
        raw_payload: candidate.rawPayload,
        last_seen_at: nowIso,
      };
    });

    const upsertedOfferMap = new Map<
      string,
      { id: string; external_id: string; price: number; original_price: number | null; pix_price: number | null }
    >();

    for (const chunk of chunkArray(offerRows, 100)) {
      const { data, error } = await supabase
        .from("product_offers")
        .upsert(chunk, { onConflict: "marketplace,external_id" })
        .select("id, external_id, price, original_price, pix_price");
      if (error) throw new Error(error.message);
      stats.upserted_offers += chunk.length;
      for (const row of (data as ExistingOfferRow[] | null) ?? []) {
        const normalized = normalizeExternalId(row.external_id);
        if (!normalized) continue;
        upsertedOfferMap.set(normalized, row);
        if (existingOffersByExternalId.has(normalized)) {
          stats.offers_updated += 1;
        } else {
          stats.offers_added += 1;
        }
      }
    }

    const historyRows: Array<Record<string, unknown>> = [];
    for (const candidate of persistedCandidates) {
      const upsertedOffer = upsertedOfferMap.get(candidate.externalId);
      if (!upsertedOffer) {
        stats.errors += 1;
        continue;
      }

      const previous = existingOffersByExternalId.get(candidate.externalId);
      const changed =
        !previous ||
        !moneyEquals(previous.price, candidate.price) ||
        !moneyEquals(previous.original_price, candidate.originalPrice) ||
        !moneyEquals(previous.pix_price, candidate.pixPrice);

      if (!changed) {
        stats.skipped += 1;
        continue;
      }

      historyRows.push({
        offer_id: upsertedOffer.id,
        run_id: runId,
        source: "catalog_ingest",
        captured_at: nowIso,
        price: candidate.price,
        original_price: candidate.originalPrice,
        pix_price: candidate.pixPrice,
      });
    }

    if (historyRows.length) {
      for (const chunk of chunkArray(historyRows, 300)) {
        const { error } = await supabase.from("offer_price_history").insert(chunk);
        if (error) throw new Error(error.message);
        stats.inserted_history += chunk.length;
      }
    }
    stats.skipped +=
      stats.discarded_no_free_shipping +
      stats.discarded_low_reputation +
      stats.discarded_not_new +
      stats.discarded_invalid_price +
      stats.discarded_low_score +
      stats.rejected_by_allowlist +
      stats.rejected_by_negative_terms +
      stats.rejected_ambiguous_without_gym_context;

    const hasCatalogChanges =
      stats.inserted_products > 0 ||
      stats.updated_products > 0 ||
      deactivatedProducts.length > 0 ||
      stats.replacements > 0;

    await upsertRun({
      id: runId,
      finished_at: new Date().toISOString(),
      status: "success",
      total_mappings: stats.total_mappings,
      categories_processed: stats.categories_processed,
      total_candidates: stats.total_candidates,
      total_processed: stats.total_processed,
      inserted_products: stats.inserted_products,
      inserted_active: stats.inserted_active,
      inserted_standby: stats.inserted_standby,
      updated_products: stats.updated_products,
      replacements: stats.replacements,
      replaced_active: stats.replaced_active,
      elite_added: stats.elite_added,
      upserted_offers: stats.upserted_offers,
      offers_added: stats.offers_added,
      offers_updated: stats.offers_updated,
      inserted_history: stats.inserted_history,
      skipped: stats.skipped,
      discarded_no_free_shipping: stats.discarded_no_free_shipping,
      discarded_low_reputation: stats.discarded_low_reputation,
      discarded_not_new: stats.discarded_not_new,
      discarded_invalid_price: stats.discarded_invalid_price,
      discarded_low_score: stats.discarded_low_score,
      rejected_by_allowlist: stats.rejected_by_allowlist,
      rejected_by_negative_terms: stats.rejected_by_negative_terms,
      rejected_ambiguous_without_gym_context: stats.rejected_ambiguous_without_gym_context,
      rejected_low_score: stats.rejected_low_score,
      api_errors: stats.api_errors,
      errors: stats.errors,
      note: stoppedByRuntime ? "runtime_budget_reached" : null,
    });

    const postSyncTrigger = await triggerPriceSyncAfterIngest({
      enabled: TRIGGER_PRICE_SYNC_AFTER_INGEST && !dryRun && hasCatalogChanges,
      supabase,
      supabaseUrl: SUPABASE_URL,
      cronSecret,
      source: "catalog_ingest_post_run",
      timeoutMs: POST_SYNC_TIMEOUT_MS,
    });

    console.log(
      JSON.stringify({
        level: "info",
        message: "catalog_ingest_run",
        run_id: runId,
        stats,
        post_sync: postSyncTrigger,
      }),
    );

    return new Response(
      JSON.stringify({
        ok: true,
        run_id: runId,
        stats,
        post_sync: postSyncTrigger,
        note: stoppedByRuntime ? "runtime_budget_reached" : null,
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (error) {
    await upsertRun({
      id: runId,
      finished_at: new Date().toISOString(),
      status: "failed",
      total_mappings: stats.total_mappings,
      categories_processed: stats.categories_processed,
      total_candidates: stats.total_candidates,
      total_processed: stats.total_processed,
      inserted_products: stats.inserted_products,
      inserted_active: stats.inserted_active,
      inserted_standby: stats.inserted_standby,
      updated_products: stats.updated_products,
      replacements: stats.replacements,
      replaced_active: stats.replaced_active,
      elite_added: stats.elite_added,
      upserted_offers: stats.upserted_offers,
      offers_added: stats.offers_added,
      offers_updated: stats.offers_updated,
      inserted_history: stats.inserted_history,
      skipped: stats.skipped,
      discarded_no_free_shipping: stats.discarded_no_free_shipping,
      discarded_low_reputation: stats.discarded_low_reputation,
      discarded_not_new: stats.discarded_not_new,
      discarded_invalid_price: stats.discarded_invalid_price,
      discarded_low_score: stats.discarded_low_score,
      rejected_by_allowlist: stats.rejected_by_allowlist,
      rejected_by_negative_terms: stats.rejected_by_negative_terms,
      rejected_ambiguous_without_gym_context: stats.rejected_ambiguous_without_gym_context,
      rejected_low_score: stats.rejected_low_score,
      api_errors: stats.api_errors,
      errors: stats.errors + 1,
      note: (error as Error)?.message?.slice(0, 500) ?? "catalog_ingest_failed",
    });
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "catalog_ingest_failed",
        run_id: runId,
        error: (error as Error)?.message ?? String(error),
        stats,
      }),
    );
    return new Response(
      JSON.stringify({
        ok: false,
        run_id: runId,
        error: (error as Error)?.message ?? String(error),
        stats,
      }),
      { status: 500, headers: JSON_HEADERS },
    );
  } finally {
    await releaseLock();
  }
});
