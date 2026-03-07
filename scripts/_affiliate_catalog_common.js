import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  readRunnerEnv,
  createSupabaseRestClient,
  resolveCanonicalMlItemId,
  extractMlItemIdFromUrl,
} = require("./_supabase_runner_utils.cjs");

export const DEFAULT_ENV = "supabase/functions/.env.scheduler";

export const args = process.argv.slice(2);

export const getArg = (name, fallback = null) => {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

export const hasArg = (name) => args.includes(name);

export const toInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
};

export const parseEnvAndClient = (envFile = DEFAULT_ENV) => {
  const env = readRunnerEnv(envFile);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }
  const restClient = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });
  const client = {
    ...restClient,
    get: (path) => restClient.request(path, { method: "GET" }),
    post: (path, body, headers = {}) =>
      restClient.request(path, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
  };
  return { env, client };
};

export const normalizeMlItemId = (value) => {
  const raw = String(value || "").toUpperCase();
  const match = raw.match(/MLB\d{6,14}/i);
  return match ? match[0].toUpperCase() : null;
};

export const toSlug = (value, fallback = "produto") => {
  const base = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return base || fallback;
};

export const normalizePrice = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  return Number(n.toFixed(2));
};

export const chunk = (rows, size = 100) => {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
};

export const writeJson = (filePath, payload) => {
  const full = path.resolve(filePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return full;
};

export const readTextLines = (filePath) => {
  if (!fs.existsSync(filePath)) return [];
  return String(fs.readFileSync(filePath, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

export const getMlToken = (env) =>
  process.env.MELI_ACCESS_TOKEN ||
  process.env.MERCADOLIVRE_ACCESS_TOKEN ||
  process.env.ACCESS_TOKEN ||
  env?.MELI_ACCESS_TOKEN ||
  env?.MERCADOLIVRE_ACCESS_TOKEN ||
  env?.ACCESS_TOKEN ||
  null;

export const fetchMlJson = async (pathWithQuery, token = null, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const resp = await fetch(`https://api.mercadolibre.com${pathWithQuery}`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const text = await resp.text();
    const body = text ? JSON.parse(text) : null;
    if (!resp.ok) {
      throw new Error(`ml_api_${resp.status}:${JSON.stringify(body || {})}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
};

export const fetchMlItem = async (mlItemId, token = null, timeoutMs = 12000) => {
  const itemId = normalizeMlItemId(mlItemId);
  if (!itemId) return null;
  return fetchMlJson(`/items/${encodeURIComponent(itemId)}`, token, timeoutMs);
};

export const mlPriceFromItem = (item) => {
  if (!item || typeof item !== "object") return 0;
  const candidate = Number(item.price ?? 0);
  if (Number.isFinite(candidate) && candidate > 0) return Number(candidate.toFixed(2));
  return 0;
};

export const resolveProductMlItemId = (row) =>
  normalizeMlItemId(row?.ml_item_id) ||
  normalizeMlItemId(row?.external_id) ||
  extractMlItemIdFromUrl(row?.canonical_offer_url) ||
  extractMlItemIdFromUrl(row?.source_url) ||
  resolveCanonicalMlItemId(row);

export const isSecOrShortLink = (url) => {
  const link = String(url || "").trim();
  if (!link) return false;
  try {
    const parsed = new URL(link);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname || "";
    if ((host === "meli.la" || host === "www.meli.la") && pathname.length > 1) return true;
    if (
      (host === "mercadolivre.com" ||
        host === "www.mercadolivre.com" ||
        host === "mercadolivre.com.br" ||
        host === "www.mercadolivre.com.br") &&
      /^\/sec\/[a-z0-9_-]+/i.test(pathname)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
};
