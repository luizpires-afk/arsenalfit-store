const fs = require("fs");

const MLB_REGEX = /MLB\d{6,14}/i;

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  let text = fs.readFileSync(filePath, "utf8");
  text = text.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  const out = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    out[key] = value;
  }
  return out;
};

const readRunnerEnv = (envFilePath) => {
  const envFile = parseEnvFile(envFilePath);
  const supabaseEnv = parseEnvFile("supabase/.env");
  const rootEnv = parseEnvFile(".env");

  const SUPABASE_URL =
    process.env.SUPABASE_URL ||
    envFile.SUPABASE_URL ||
    supabaseEnv.SUPABASE_URL ||
    rootEnv.SUPABASE_URL ||
    rootEnv.VITE_SUPABASE_URL;

  const SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    envFile.SUPABASE_SERVICE_ROLE_KEY ||
    supabaseEnv.SUPABASE_SERVICE_ROLE_KEY ||
    rootEnv.SUPABASE_SERVICE_ROLE_KEY;

  const CRON_SECRET =
    process.env.CRON_SECRET ||
    envFile.CRON_SECRET ||
    supabaseEnv.CRON_SECRET ||
    rootEnv.CRON_SECRET;

  return {
    SUPABASE_URL,
    SERVICE_ROLE_KEY,
    CRON_SECRET,
    envFilePath,
  };
};

const normalizeBaseUrl = (value) => String(value || "").replace(/\/$/, "");

const buildApiBase = (supabaseUrl) => {
  const base = normalizeBaseUrl(supabaseUrl);
  return {
    rest: base.endsWith("/rest/v1") ? base : `${base}/rest/v1`,
    functions: base.endsWith("/functions/v1") ? base : `${base}/functions/v1`,
  };
};

const toFiniteNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const hasMeaningfulPixDiscount = (price, pix) => {
  if (!(Number.isFinite(price) && Number.isFinite(pix))) return false;
  if (!(price > 0 && pix > 0 && pix < price)) return false;
  const diff = price - pix;
  return diff >= 0.5 || diff / price >= 0.005;
};

const normalizeUrl = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
};

const extractHost = (urlValue) => {
  try {
    return new URL(String(urlValue)).host.toLowerCase();
  } catch {
    return "";
  }
};

const isMercadoLivreHost = (host) => {
  const normalized = String(host || "").toLowerCase();
  return (
    normalized === "mercadolivre.com" ||
    normalized === "www.mercadolivre.com" ||
    normalized === "mercadolivre.com.br" ||
    normalized === "www.mercadolivre.com.br"
  );
};

const isMercadoLivreShortAffiliateLink = (value) => {
  const link = normalizeUrl(value);
  if (!link) return false;
  try {
    const parsed = new URL(link);
    const host = String(parsed.host || "").toLowerCase();
    if (host !== "meli.la" && host !== "www.meli.la") return false;
    const pathname = String(parsed.pathname || "").replace(/\/+$/g, "");
    return pathname.length > 1;
  } catch {
    return false;
  }
};

const isMercadoLivreSocialAffiliateLink = (value) => {
  const link = normalizeUrl(value);
  if (!link) return false;
  try {
    const parsed = new URL(link);
    if (!isMercadoLivreHost(parsed.host)) return false;
    const pathname = String(parsed.pathname || "");
    if (!/^\/social\/pb[a-z0-9]+(?:\/|$)/i.test(pathname)) return false;
    const mattTool = String(parsed.searchParams.get("matt_tool") || "").trim();
    if (!mattTool) return false;
    const mattWord = String(parsed.searchParams.get("matt_word") || "").trim();
    const hasRef = String(parsed.searchParams.get("ref") || "").trim().length > 0;
    return Boolean(mattWord || hasRef);
  } catch {
    return false;
  }
};

const isMercadoLivreSecLink = (value) => {
  const link = normalizeUrl(value);
  if (!link) return false;
  if (isMercadoLivreShortAffiliateLink(link)) return true;
  const host = extractHost(link);
  if (!isMercadoLivreHost(host)) return false;
  try {
    const parsed = new URL(link);
    const pathname = String(parsed.pathname || "");
    if (/^\/sec\/[a-z0-9]+/i.test(pathname)) return true;
    return isMercadoLivreSocialAffiliateLink(link);
  } catch {
    return false;
  }
};

const normalizeMlItemId = (value) => {
  if (!value) return null;
  const match = String(value).toUpperCase().match(MLB_REGEX);
  return match?.[0] ?? null;
};

const extractMlItemIdFromUrl = (urlValue) => {
  if (!urlValue || typeof urlValue !== "string") return null;
  const raw = urlValue.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const wid = normalizeMlItemId(parsed.searchParams.get("wid"));
    if (wid) return wid;
    const itemId = normalizeMlItemId(parsed.searchParams.get("item_id"));
    if (itemId) return itemId;
    const pdpFilters = parsed.searchParams.get("pdp_filters");
    if (pdpFilters) {
      const decoded = decodeURIComponent(String(pdpFilters));
      const pdpItemId = decoded.match(/(?:^|[,;])\s*item_id[:=]\s*(MLB\d{6,14})/i)?.[1] ?? null;
      const normalizedPdpItem = normalizeMlItemId(pdpItemId);
      if (normalizedPdpItem) return normalizedPdpItem;
    }
    const fromPath = normalizeMlItemId(parsed.pathname);
    if (fromPath) return fromPath;
    for (const key of ["item_id", "item", "wid", "id"]) {
      const param = parsed.searchParams.get(key);
      const fromParam = normalizeMlItemId(param);
      if (fromParam) return fromParam;
    }
  } catch {
    const wid = raw.match(/[?&#]wid=(MLB\d{6,14})/i)?.[1] ?? null;
    const normalizedWid = normalizeMlItemId(wid);
    if (normalizedWid) return normalizedWid;
    const itemId = raw.match(/[?&#]item_id=(MLB\d{6,14})/i)?.[1] ?? null;
    const normalizedItemId = normalizeMlItemId(itemId);
    if (normalizedItemId) return normalizedItemId;
    const pdpRaw = raw.match(/pdp_filters=([^&#]+)/i)?.[1] ?? null;
    if (pdpRaw) {
      const decoded = decodeURIComponent(String(pdpRaw));
      const pdpItemId = decoded.match(/(?:^|[,;])\s*item_id[:=]\s*(MLB\d{6,14})/i)?.[1] ?? null;
      const normalizedPdpItem = normalizeMlItemId(pdpItemId);
      if (normalizedPdpItem) return normalizedPdpItem;
    }
    return normalizeMlItemId(raw);
  }
  return normalizeMlItemId(raw);
};

const resolveCanonicalMlItemId = (product) =>
  normalizeMlItemId(product?.ml_item_id) ||
  extractMlItemIdFromUrl(product?.canonical_offer_url) ||
  extractMlItemIdFromUrl(product?.source_url) ||
  extractMlItemIdFromUrl(product?.affiliate_link) ||
  normalizeMlItemId(product?.external_id);

const resolveSiteFinalPrice = (product) => {
  const current = toFiniteNumber(product?.price);
  const pix = toFiniteNumber(product?.pix_price);
  if (current !== null && pix !== null && hasMeaningfulPixDiscount(current, pix)) {
    return pix;
  }
  return current;
};

const classifyDelta = (
  deltaAbs,
  deltaPct,
  {
    warnPct = 25,
    warnAbs = 20,
    criticalPct = 50,
    criticalAbs = 30,
  } = {},
) => {
  const mismatch = (deltaPct ?? 0) >= warnPct || (deltaAbs ?? 0) >= warnAbs;
  const critical = (deltaPct ?? 0) >= criticalPct || (deltaAbs ?? 0) >= criticalAbs;
  return { mismatch, critical };
};

const createSupabaseRestClient = ({ supabaseUrl, serviceRoleKey }) => {
  const apiBase = buildApiBase(supabaseUrl);

  const request = async (path, init = {}) => {
    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    };
    const response = await fetch(`${apiBase.rest}${path}`, {
      ...init,
      headers,
    });
    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!response.ok) {
      const detail = typeof parsed === "string" ? parsed : JSON.stringify(parsed || {});
      throw new Error(`${response.status} ${response.statusText}: ${detail}`);
    }
    return parsed;
  };

  const rpc = async (name, body = {}) =>
    request(`/rpc/${name}`, {
      method: "POST",
      body: JSON.stringify(body),
    });

  const fetchPagedRows = async (pathWithQuery, pageSize = 1000) => {
    let from = 0;
    const rows = [];
    while (true) {
      const to = from + pageSize - 1;
      const batch = await request(pathWithQuery, {
        method: "GET",
        headers: {
          Range: `${from}-${to}`,
          Prefer: "count=exact",
        },
      });
      if (!Array.isArray(batch) || batch.length === 0) break;
      rows.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }
    return rows;
  };

  const patch = async (pathWithQuery, body) =>
    request(pathWithQuery, {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    });

  return {
    apiBase,
    request,
    rpc,
    fetchPagedRows,
    patch,
  };
};

const toCsv = (rows) => {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const encode = (value) => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => encode(row[header])).join(","));
  }
  return lines.join("\n");
};

module.exports = {
  parseEnvFile,
  readRunnerEnv,
  buildApiBase,
  toFiniteNumber,
  hasMeaningfulPixDiscount,
  normalizeUrl,
  isMercadoLivreSecLink,
  normalizeMlItemId,
  extractMlItemIdFromUrl,
  resolveCanonicalMlItemId,
  resolveSiteFinalPrice,
  classifyDelta,
  createSupabaseRestClient,
  toCsv,
};
