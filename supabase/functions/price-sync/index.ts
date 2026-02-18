// @ts-ignore - Remote module resolution is handled by Deno at runtime.
import { createClient } from "npm:@supabase/supabase-js@2";

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
const SYNC_LOCK_KEY = Deno?.env?.get?.("PRICE_SYNC_LOCK_KEY") ?? "price_sync_edge";
const DEFAULT_LOCK_TTL_SECONDS = Number(
  Deno?.env?.get?.("PRICE_SYNC_LOCK_TTL_SECONDS") ?? "900",
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
const MAX_PIX_SCRAPES_PER_RUN = Number(Deno?.env?.get?.("PRICE_SYNC_MAX_PIX_SCRAPES") ?? "8");
const PIX_MIN_RATIO_VS_STANDARD = Number(
  Deno?.env?.get?.("PIX_MIN_RATIO_VS_STANDARD") ?? "0.2",
);

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
    /item_id(?:=|%3A|:)\s*(MLB\d{6,12})/i,
    /wid(?:=|%3D)\s*(MLB\d{6,12})/i,
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
    const minRatio = Number.isFinite(PIX_MIN_RATIO_VS_STANDARD)
      ? Math.min(0.95, Math.max(0, PIX_MIN_RATIO_VS_STANDARD))
      : 0.2;
    const minAllowed = referencePrice * minRatio;
    const comparable = filtered.filter(
      (value) => value < referencePrice && value >= minAllowed,
    );
    if (!comparable.length) return null;
    return Math.max(...comparable);
  }

  return Math.min(...filtered);
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

  const pixNearPriceRegexes = [
    /(?:no|via|com|pagamento(?:\s+no)?|a\s+vista(?:\s+no)?)\s*pix[^0-9r$]{0,40}r\$\s*([0-9][0-9\s\.,]{0,16})/gi,
    /r\$\s*([0-9][0-9\s\.,]{0,16})[^0-9]{0,40}(?:no|via|com|pagamento(?:\s+no)?|a\s+vista(?:\s+no)?)\s*pix/gi,
  ];

  const collectMoneyCandidates = (source: string) => {
    const moneyRegex =
      /r\$\s*([0-9]{1,3}(?:[\s\.,][0-9]{3})*|[0-9]+)(?:\s*[.,]\s*([0-9]{1,2}))?/gi;
    let match: RegExpExecArray | null;
    while ((match = moneyRegex.exec(source))) {
      const integerPart = (match[1] || "").trim();
      if (!integerPart) continue;
      const centsPart = (match[2] || "").trim();
      const rawAmount = centsPart ? `${integerPart},${centsPart}` : integerPart;
      const parsed = parseMoney(rawAmount);
      if (parsed !== null) candidates.push(parsed);
    }
  };

  const scanForPix = (source: string) => {
    const lower = source.toLowerCase();
    let idx = 0;
    while ((idx = lower.indexOf("pix", idx)) !== -1) {
      const start = Math.max(0, idx - 140);
      const end = Math.min(source.length, idx + 140);
      const slice = source.slice(start, end);
      collectMoneyCandidates(slice);
      idx += 3;
    }
  };

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
  scanForPix(compactHtml);
  scanForPix(plainText);

  return pickBestPixCandidate(candidates, referencePrice);
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

const extractStandardPriceFromHtml = (html: string): number | null => {
  if (!html) return null;

  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const jsonCandidates: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = jsonLdRegex.exec(html))) {
    const jsonText = (match[1] || "").trim();
    if (!jsonText) continue;
    const parsed = parseJsonSafe(jsonText);
    collectPriceCandidates(parsed, jsonCandidates);
  }

  const fromJson = pickMin(jsonCandidates);
  if (fromJson !== null) return fromJson;

  const regex = /"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi;
  const candidates: number[] = [];
  while ((match = regex.exec(html))) {
    const parsed = toNumber(match[1]);
    if (parsed !== null) candidates.push(parsed);
  }

  return pickMin(candidates);
};

const resolveScrapeUrl = (
  product: { source_url?: string | null; affiliate_link?: string | null },
  normalizedExternalId: string,
  itemBody: any,
) => {
  const candidates = [
    itemBody?.permalink,
    product?.source_url,
    product?.affiliate_link,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("http")) {
      return candidate;
    }
  }
  return normalizedExternalId ? `https://www.mercadolivre.com.br/${normalizedExternalId}` : null;
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
) => {
  const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
  if (!results.length) return null;

  if (preferredItemId) {
    const exact = results.find(
      (item: any) =>
        String(item?.item_id || item?.id || "").toUpperCase() === preferredItemId,
    );
    return exact ?? null;
  }

  const withPrice = results.filter((item: any) => typeof item?.price === "number");
  if (!withPrice.length) return null;

  withPrice.sort((a: any, b: any) => Number(a.price) - Number(b.price));
  return withPrice[0];
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
        "id, marketplace, external_id, price, pix_price, source_url, affiliate_link",
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

    const adUrl = product.source_url || product.affiliate_link || null;
    const normalizedExternalId =
      normalizeExternalId(product.external_id) || extractItemIdFromUrl(adUrl) || null;
    const catalogId = extractCatalogIdFromUrl(adUrl);
    const preferredItemId = extractItemIdFromUrl(adUrl);
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
          const best = pickBestProductItem(productItemsResp.body as any, preferredItemId);
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

    const basePrice = toNumber((itemResp.body as any)?.price);
    const standardPrice = ENABLE_PIX_PRICE
      ? priceSignalsFromItem.standard ?? priceSignalsFromPrices.standard ?? null
      : null;
    const pixCandidate = ENABLE_PIX_PRICE
      ? priceSignalsFromItem.pix ?? priceSignalsFromPrices.pix ?? null
      : null;

    let resolvedPrice = standardPrice ?? basePrice ?? null;
    let resolvedPix = pickBestPixCandidate([pixCandidate], resolvedPrice);
    let pixSource: "api" | "scraper" | null = resolvedPix ? "api" : null;
    let usedScraperPix = false;

    if (
      ENABLE_PIX_PRICE &&
      !resolvedPix &&
      typeof resolvedPrice === "number" &&
      resolvedPrice > 0
    ) {
      const scrapeUrl = resolveScrapeUrl(
        product,
        normalizedExternalId ?? fetchItemId ?? "",
        itemResp.body,
      );
      if (scrapeUrl) {
        let scrapedPix: number | null = null;
        const html = await fetchScrapedHtml(scrapeUrl);
        scrapedPix = html ? extractPixPriceFromHtml(html, resolvedPrice) : null;

        if (!scrapedPix) {
          const directHtml = await fetchScrapedHtml(scrapeUrl, undefined, true);
          scrapedPix = directHtml ? extractPixPriceFromHtml(directHtml, resolvedPrice) : null;
        }

        if (!scrapedPix) {
          const jinaHtml = await fetchJinaHtml(scrapeUrl);
          scrapedPix = jinaHtml ? extractPixPriceFromHtml(jinaHtml, resolvedPrice) : null;
        }

        if (scrapedPix && scrapedPix > 0 && scrapedPix < resolvedPrice) {
          resolvedPix = scrapedPix;
          pixSource = "scraper";
          usedScraperPix = true;
        }
      }
    }

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
        used_scraper_pix: usedScraperPix,
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
      .select("id, price, original_price, source_url, affiliate_link")
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

    const extractPriceFromHtml = (html: string | null) =>
      html ? extractStandardPriceFromHtml(html) : null;

    let price: number | null = null;
    let source: "scraper" | "direct" | "jina" | "none" = "none";

    const html = await fetchScrapedHtml(adUrl);
    price = extractPriceFromHtml(html);
    if (price !== null) source = SCRAPER_API_KEY || SCRAPER_API_URL_TEMPLATE ? "scraper" : "direct";

    if (price === null) {
      const directHtml = await fetchScrapedHtml(adUrl, undefined, true);
      price = extractPriceFromHtml(directHtml);
      if (price !== null) source = "direct";
    }

    if (price === null) {
      const jinaHtml = await fetchJinaHtml(adUrl);
      price = extractPriceFromHtml(jinaHtml);
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
    const nextOriginal =
      currentOriginal === null
        ? Math.max(currentPrice ?? 0, price)
        : Math.max(currentOriginal, price);
    const discountPercentage =
      nextOriginal > price ? Math.round(((nextOriginal - price) / nextOriginal) * 100) : 0;
    const nowIso = new Date().toISOString();
    const normalizedPriceSource = source === "none" ? null : "scraper";

    const { error: updateError } = await supabase
      .from("products")
      .update({
        previous_price: currentPrice,
        price,
        detected_price: price,
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

    return new Response(JSON.stringify({ ok: true, price, source }), {
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
  const maxPixScrapesPerRun = Math.max(0, MAX_PIX_SCRAPES_PER_RUN);
  let scraperFallbacksUsed = 0;
  let pixScrapesUsed = 0;
  let stoppedByRuntime = false;

  const now = new Date();
  const nowIso = now.toISOString();
  const nowGraceIso = new Date(now.getTime() + SCHEDULE_GRACE_MS).toISOString();
  let query = supabase
    .from("products")
    .select(
      "id, marketplace, external_id, price, pix_price, pix_price_source, pix_price_checked_at, original_price, etag, status, last_sync, next_check_at, is_active, auto_disabled_reason, auto_disabled_at, stock_quantity, source_url, affiliate_link",
    )
    .eq("marketplace", "mercadolivre")
    .not("external_id", "is", null)
    .neq("status", "paused");

  if (!forceSync) {
    query = query.lte("next_check_at", nowGraceIso);
  }

  const { data: products, error } = await query
    .order("next_check_at", { ascending: true })
    .limit(batchSize);

  if (error) {
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
    return new Response(JSON.stringify({ ok: true, run_id: runId, stats }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }

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
      extractCatalogIdFromUrl(product?.source_url) ||
      extractCatalogIdFromUrl(product?.affiliate_link);
    const preferredItemId =
      extractItemIdFromUrl(product?.source_url) ||
      extractItemIdFromUrl(product?.affiliate_link);
    const fetchItemId = preferredItemId || normalizedExternalId;

    if (
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
    let catalogFallbackPrice: number | null = null;
    let catalogFallbackItemId: string | null = null;
    let usedScraperFallback = false;
    let policyUnauthorized = false;
    let catalogLookupFailed = false;

    try {
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
              const best = pickBestProductItem(
                productItemsResp.body as any,
                preferredItemId,
              );

              let minPrice: number | null = null;
              let minItemId: string | null = null;
              for (const item of results) {
                if (typeof item?.price === "number") {
                  if (minPrice === null || item.price < minPrice) {
                    minPrice = item.price;
                    minItemId = (item as any)?.item_id ?? (item as any)?.id ?? null;
                  }
                }
              }

              if (preferredItemId && !best && minPrice !== null) {
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
                catalogFallbackItemId = typeof bestId === "string" ? bestId : null;
              } else if (!preferredItemId && minPrice !== null) {
                // Sem item preferido, mantemos o menor preço do catálogo como fallback.
                catalogFallbackPrice = minPrice;
                catalogFallbackItemId = typeof minItemId === "string" ? minItemId : null;
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

      let scrapedFallback: { price: number; pix_price: number | null } | null = null;

      if (
        SCRAPER_ENABLED &&
        scraperFallbacksUsed < maxScraperFallbacksPerRun &&
        itemResp.status !== 200 &&
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
            const scrapedPrice = extractStandardPriceFromHtml(html);
            const scrapedPix = ENABLE_PIX_PRICE
              ? extractPixPriceFromHtml(html, scrapedPrice)
              : null;
            if (typeof scrapedPrice === "number" && Number.isFinite(scrapedPrice) && scrapedPrice > 0) {
              let resolvedPix: number | null = null;
              if (
                typeof scrapedPix === "number" &&
                Number.isFinite(scrapedPix) &&
                scrapedPix > 0 &&
                scrapedPix < scrapedPrice
              ) {
                resolvedPix = scrapedPix;
              }
              return { price: scrapedPrice, pix_price: resolvedPix };
            }
            return null;
          };

          const html = await fetchScrapedHtml(scrapeUrl);
          scrapedFallback = extractFromHtml(html);

          if (!scrapedFallback) {
            const directHtml = await fetchScrapedHtml(scrapeUrl, undefined, true);
            scrapedFallback = extractFromHtml(directHtml);
          }

          if (!scrapedFallback) {
            const jinaHtml = await fetchJinaHtml(scrapeUrl);
            scrapedFallback = extractFromHtml(jinaHtml);
          }
        }
      }

      if (itemResp.status === 304) {
        result = { statusCode: 304, etag: itemResp?.etag ?? null };
      } else if (itemResp.status === 200) {
        const basePrice = toNumber((itemResp.body as any)?.price);
        const standardPrice = ENABLE_PIX_PRICE
          ? priceSignalsFromItem.standard ?? priceSignalsFromPrices.standard ?? null
          : null;
        const pixCandidate = ENABLE_PIX_PRICE
          ? priceSignalsFromItem.pix ?? priceSignalsFromPrices.pix ?? null
          : null;
        const resolvedPrice = standardPrice ?? basePrice;
        let resolvedPix = pickBestPixCandidate([pixCandidate], resolvedPrice);
        let pixSource: "api" | "scraper" | null = resolvedPix !== null ? "api" : null;

        if (resolvedPix !== null && typeof resolvedPrice === "number" && resolvedPix >= resolvedPrice) {
          resolvedPix = null;
          pixSource = null;
        }

        result = {
          statusCode: 200,
          price: resolvedPrice,
          pix_price: resolvedPix,
          pix_source: pixSource,
          status: mapStatus((itemResp.body as any) || {}),
          available_quantity: (itemResp.body as any)?.available_quantity,
          etag: itemResp?.etag ?? null,
        };

        if (
          ENABLE_PIX_PRICE &&
          !result.pix_price &&
          typeof resolvedPrice === "number" &&
          pixScrapesUsed < maxPixScrapesPerRun
        ) {
          const scrapeUrl = resolveScrapeUrl(product, normalizedExternalId, itemResp.body);
          if (scrapeUrl) {
            pixScrapesUsed += 1;
            let scrapedPix: number | null = null;
            const html = await fetchScrapedHtml(scrapeUrl, controller.signal);
            scrapedPix = html ? extractPixPriceFromHtml(html, resolvedPrice) : null;

            if (!scrapedPix) {
              const directHtml = await fetchScrapedHtml(scrapeUrl, controller.signal, true);
              scrapedPix = directHtml ? extractPixPriceFromHtml(directHtml, resolvedPrice) : null;
            }

            if (!scrapedPix) {
              const jinaHtml = await fetchJinaHtml(scrapeUrl, controller.signal);
              scrapedPix = jinaHtml ? extractPixPriceFromHtml(jinaHtml, resolvedPrice) : null;
            }

            if (scrapedPix && scrapedPix > 0 && scrapedPix < resolvedPrice) {
              result.pix_price = scrapedPix;
              (result as any).pix_source = "scraper";
              console.log(
                JSON.stringify({
                  level: "info",
                  message: "pix_price_scraped",
                  run_id: runId,
                  item_id: normalizedExternalId,
                  pix_price: scrapedPix,
                }),
              );
            }
          }
        }
      } else if (scrapedFallback) {
        usedScraperFallback = true;
        result = {
          statusCode: 200,
          price: scrapedFallback.price,
          pix_price: scrapedFallback.pix_price,
          pix_source: scrapedFallback.pix_price ? "scraper" : null,
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
      } else {
        result = { statusCode: 0, error: "provider_error" };
        errorMessage = (error as any)?.message || String(error);
      }
    }

    let update: Record<string, unknown> = {};
    let nextCheckAt = addMs(now, HOURS_12_MS).toISOString();

    if (result?.statusCode === 304) {
      const wasAutoBlocked = product?.auto_disabled_reason === "blocked";
      const source: PriceChangeRow["source"] = usedScraperFallback
        ? "scraper"
        : usedProductFallback
          ? "catalog"
          : usedPublicFallback
            ? "public"
            : "auth";
      nextCheckAt = addMs(now, wasAutoBlocked ? HOURS_2_MS : HOURS_6_MS).toISOString();
      update = {
        last_sync: now.toISOString(),
        last_price_source: source,
        last_price_verified_at: now.toISOString(),
        next_check_at: nextCheckAt,
        etag: result?.etag ?? product?.etag ?? null,
        ...(wasAutoBlocked
          ? { is_active: false, auto_disabled_reason: "blocked", auto_disabled_at: product?.auto_disabled_at ?? now.toISOString() }
          : {}),
      };
      stats.total_304 += 1;
    } else if (result?.statusCode === 200 && typeof result?.price === "number") {
      nextCheckAt = addMs(now, HOURS_6_MS).toISOString();
      const mappedStatus = result?.status ?? product?.status ?? "active";
      const resolvedStatus = product?.status === "paused" ? "paused" : mappedStatus;
      const wasAutoBlocked = product?.auto_disabled_reason === "blocked";
      const availableQty =
        typeof result?.available_quantity === "number" ? result.available_quantity : null;
      const resolvedStockQty =
        availableQty !== null ? Math.max(availableQty, 0) : resolvedStatus === "out_of_stock" ? 0 : null;

      const currentOriginal = product?.original_price ?? null;
      const candidateOriginal = Math.max(product?.price ?? 0, result.price);
      const nextOriginal =
        currentOriginal === null
          ? candidateOriginal
          : result.price > currentOriginal
            ? result.price
            : currentOriginal;

      const discountPercentage =
        nextOriginal && nextOriginal > result.price
          ? Math.round(((nextOriginal - result.price) / nextOriginal) * 100)
          : 0;

      const hasPriceChange =
        product?.price === null || product?.price === undefined || result.price !== product.price;
      const isOnSale = discountPercentage > 0;
      const source: PriceChangeRow["source"] = usedScraperFallback
        ? "scraper"
        : usedProductFallback
          ? "catalog"
          : usedPublicFallback
            ? "public"
            : "auth";
      const isReliableSource = source === "auth" || source === "public";
      const shouldReactivate = wasAutoBlocked && resolvedStatus !== "paused" && isReliableSource;
      const isActive =
        resolvedStatus === "paused"
          ? false
          : shouldReactivate
            ? true
            : product?.is_active ?? true;

      if (wasAutoBlocked && !isReliableSource) {
        nextCheckAt = addMs(now, HOURS_2_MS).toISOString();
        update = {
          last_sync: now.toISOString(),
          next_check_at: nextCheckAt,
          is_active: false,
          auto_disabled_reason: "blocked",
          auto_disabled_at: product?.auto_disabled_at ?? now.toISOString(),
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
            etag_before: etagBefore,
            etag_after: etagAfter,
            error: updateError?.message || errorMessage || result?.error || null,
          }),
        );
        await sleep(randomInt(itemDelayMin, itemDelayMax));
        continue;
      }

      const existingPix =
        typeof product?.pix_price === "number" ? product.pix_price : null;
      const existingPixSource =
        (product as any)?.pix_price_source ?? (existingPix !== null ? "manual" : null);
      const incomingPix =
        typeof (result as any)?.pix_price === "number" ? (result as any).pix_price : null;
      const incomingPixSource =
        incomingPix !== null ? ((result as any)?.pix_source ?? "api") : null;
      const minRatio = Number.isFinite(PIX_MIN_RATIO_VS_STANDARD)
        ? Math.min(0.95, Math.max(0, PIX_MIN_RATIO_VS_STANDARD))
        : 0.2;
      const existingPixLooksValid =
        existingPix !== null &&
        existingPix > 0 &&
        existingPix < result.price &&
        existingPix >= result.price * minRatio;
      const shouldKeepExistingPix =
        existingPix !== null &&
        (existingPixSource === "manual" || existingPixLooksValid);
      const resolvedPix = incomingPix !== null ? incomingPix : shouldKeepExistingPix ? existingPix : null;
      const resolvedPixSource =
        resolvedPix !== null
          ? incomingPix !== null
            ? incomingPixSource
            : existingPixSource
          : null;
      const resolvedPixCheckedAt =
        incomingPix !== null ? now.toISOString() : (product as any)?.pix_price_checked_at ?? null;

      update = {
        previous_price: product?.price ?? null,
        original_price: nextOriginal,
        price: result.price,
        last_price_source: source,
        last_price_verified_at: now.toISOString(),
        pix_price: resolvedPix,
        pix_price_source: resolvedPix !== null ? resolvedPixSource : null,
        pix_price_checked_at: resolvedPix !== null ? resolvedPixCheckedAt : null,
        discount_percentage: discountPercentage,
        is_on_sale: isOnSale,
        ...(resolvedStatus === "paused" ? { is_active: false } : { is_active: isActive }),
        ...(shouldReactivate ? { auto_disabled_reason: null, auto_disabled_at: null } : {}),
        ...(resolvedStockQty !== null ? { stock_quantity: resolvedStockQty } : {}),
        ...(hasPriceChange ? { detected_price: result.price, detected_at: now.toISOString() } : {}),
        etag: result?.etag ?? product?.etag ?? null,
        status: resolvedStatus,
        last_sync: now.toISOString(),
        next_check_at: nextCheckAt,
      };
      stats.total_200 += 1;

        if (hasPriceChange) {
          priceChanges.push({
            run_id: runId,
            product_id: product.id,
            marketplace: product.marketplace ?? null,
            external_id: normalizedExternalId,
            old_price: product?.price ?? null,
            new_price: result.price,
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
    } else if (result?.statusCode === 404) {
      nextCheckAt = addMs(now, HOURS_24_MS).toISOString();
      update = {
        status: "paused",
        is_active: false,
        stock_quantity: 0,
        last_sync: now.toISOString(),
        next_check_at: nextCheckAt,
      };
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
          is_active: false,
          auto_disabled_reason: "blocked",
          auto_disabled_at: now.toISOString(),
        };
      } else if (isAccessDenied) {
        nextCheckAt = addMs(now, HOURS_24_MS).toISOString();
        update = {
          status: "paused",
          is_active: false,
          stock_quantity: 0,
          last_sync: now.toISOString(),
          next_check_at: nextCheckAt,
        };
      } else {
        nextCheckAt = addMs(now, HOURS_12_MS).toISOString();
        update = { last_sync: now.toISOString(), next_check_at: nextCheckAt };
      }

      stats.total_403 += 1;
    } else if (result?.statusCode === 429 || result?.isTimeout) {
      nextCheckAt = addMs(now, HOURS_12_MS).toISOString();
      update = { last_sync: now.toISOString(), next_check_at: nextCheckAt };
      if (result?.statusCode === 429) stats.total_429 += 1;
      if (result?.isTimeout) stats.total_timeout += 1;
    } else {
      stats.total_erros_desconhecidos += 1;
      update = { last_sync: now.toISOString(), next_check_at: nextCheckAt };
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
        etag_before: etagBefore,
        etag_after: etagAfter,
        error: updateError?.message || errorMessage || result?.error || null,
      }),
    );

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
    const dueQuery = supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("marketplace", "mercadolivre")
      .not("external_id", "is", null)
      .neq("status", "paused");

    const dueResult = forceSync
      ? await dueQuery
      : await dueQuery.lte("next_check_at", new Date(Date.now() + SCHEDULE_GRACE_MS).toISOString());

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

