const fs = require("fs");

const args = process.argv.slice(2);
const hasArg = (name) => args.includes(name);
const getArgAny = (names, fallback) => {
  for (const name of names) {
    const idx = args.indexOf(name);
    if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  }
  return fallback;
};

const dailyImport = hasArg("--daily-import") || hasArg("--daily_import");

const envFile = getArgAny(["--env"], "supabase/functions/.env.scheduler");
const source = getArgAny(["--source"], dailyImport ? "daily_import" : "manual");
const timeoutMs = Number(getArgAny(["--timeout"], "180000")) || 180000;
const configFile = getArgAny(["--config"], "config/daily_catalog_config.json");
const searchFilterConfigFile = getArgAny(
  ["--search-filter-config", "--search_filter_config"],
  "config/catalog_search_filter.json",
);

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

const parseJsonFile = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const parseNumberArg = (names) => {
  const raw = getArgAny(names, null);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
};

const parseListArg = (names) => {
  const raw = getArgAny(names, "");
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
};

const envFromFile = parseEnvFile(envFile);
const supabaseEnv = parseEnvFile("supabase/.env");
const rootEnv = parseEnvFile(".env");

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  envFromFile.SUPABASE_URL ||
  supabaseEnv.SUPABASE_URL ||
  rootEnv.SUPABASE_URL ||
  rootEnv.VITE_SUPABASE_URL;

const CRON_SECRET =
  process.env.CRON_SECRET ||
  envFromFile.CRON_SECRET ||
  supabaseEnv.CRON_SECRET ||
  rootEnv.CRON_SECRET;

if (!SUPABASE_URL) {
  console.error("SUPABASE_URL nao definido. Informe no ambiente ou no arquivo:", envFile);
  process.exit(1);
}
if (!CRON_SECRET) {
  console.error("CRON_SECRET nao definido. Informe no ambiente ou no arquivo:", envFile);
  process.exit(1);
}

process.env.HTTP_PROXY = "";
process.env.HTTPS_PROXY = "";
process.env.ALL_PROXY = "";
process.env.GIT_HTTP_PROXY = "";
process.env.GIT_HTTPS_PROXY = "";

const base = SUPABASE_URL.replace(/\/$/, "");
const endpoint = base.endsWith("/functions/v1")
  ? `${base}/catalog-ingest`
  : `${base}/functions/v1/catalog-ingest`;

const mappingIds = parseListArg(["--mapping-ids"]);
const defaultSellerIds = parseListArg(["--default-seller-ids"])
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0)
  .map((value) => Math.floor(value));
const siteCategories = parseListArg(["--site-categories", "--site_categories"]);
const dailyConfig = parseJsonFile(configFile) || {};
const searchFilterConfig = parseJsonFile(searchFilterConfigFile);
const cliMaxMappings = parseNumberArg(["--max-mappings"]);
const cliMaxItems = parseNumberArg(["--max-items"]);
const cliMaxRuntime = parseNumberArg(["--max-runtime"]);

const supplementsTarget = parseNumberArg(["--supplements", "--suplementos"]);
const accessoriesTarget = parseNumberArg(["--accessories", "--acessorios"]);
const equipmentTarget = parseNumberArg(["--equipment", "--equipamentos"]);
const menClothingTarget = parseNumberArg([
  "--men-clothing",
  "--men_clothing",
  "--roupas-masc",
  "--roupas_masc",
]);
const womenClothingTarget = parseNumberArg([
  "--women-clothing",
  "--women_clothing",
  "--roupas-fem",
  "--roupas_fem",
]);

const targetsBySiteCategory = {
  ...(supplementsTarget && supplementsTarget > 0 ? { suplementos: supplementsTarget } : {}),
  ...(accessoriesTarget && accessoriesTarget > 0 ? { acessorios: accessoriesTarget } : {}),
  ...(equipmentTarget && equipmentTarget > 0 ? { equipamentos: equipmentTarget } : {}),
  ...(menClothingTarget && menClothingTarget > 0 ? { roupas_masc: menClothingTarget } : {}),
  ...(womenClothingTarget && womenClothingTarget > 0 ? { roupas_fem: womenClothingTarget } : {}),
};
const hasBulkTargets = Object.keys(targetsBySiteCategory).length > 0;
const bulkImport = hasArg("--bulk-import") || hasArg("--bulk_import") || hasBulkTargets;
const hasDailyTargets = hasBulkTargets;

const targetCategories = Object.keys(targetsBySiteCategory);
const effectiveSiteCategories =
  siteCategories.length > 0 ? siteCategories : targetCategories.length > 0 ? targetCategories : [];
const dailyQuotas = dailyConfig?.dailyQuotas && typeof dailyConfig.dailyQuotas === "object"
  ? dailyConfig.dailyQuotas
  : null;
const configuredMaxBrandPerDay = Number(dailyConfig?.maxBrandPerDay);
const configuredCandidatePoolSize = Number(dailyConfig?.candidatePoolSize);
const configuredMaxRuntimeMs = Number(dailyConfig?.maxRuntimeMs);
const maxBrandPerDay = Number.isFinite(configuredMaxBrandPerDay) && configuredMaxBrandPerDay > 0
  ? Math.floor(configuredMaxBrandPerDay)
  : null;
const candidatePoolSize = Number.isFinite(configuredCandidatePoolSize) && configuredCandidatePoolSize > 0
  ? Math.floor(configuredCandidatePoolSize)
  : null;
const maxRuntimeMs = cliMaxRuntime !== null
  ? cliMaxRuntime
  : (dailyImport && Number.isFinite(configuredMaxRuntimeMs) && configuredMaxRuntimeMs > 0
    ? Math.floor(configuredMaxRuntimeMs)
    : null);

const body = {
  source,
  ...(hasArg("--dry-run") ? { dry_run: true } : {}),
  ...(hasArg("--include-inactive") ? { include_inactive: true } : {}),
  ...(hasArg("--use-auth-seller-fallback") ? { use_auth_seller_fallback: true } : {}),
  ...(mappingIds.length ? { mapping_ids: mappingIds } : {}),
  ...(defaultSellerIds.length ? { default_seller_ids: defaultSellerIds } : {}),
  ...(getArgAny(["--category-id"], null) ? { category_id: getArgAny(["--category-id"], null) } : {}),
  ...(cliMaxMappings !== null ? { max_mappings: cliMaxMappings } : {}),
  ...(cliMaxItems !== null ? { max_items: cliMaxItems } : {}),
  ...(maxRuntimeMs !== null ? { max_runtime_ms: maxRuntimeMs } : {}),
  ...(bulkImport ? { bulk_import: true } : {}),
  ...(dailyImport ? { daily_growth: true } : {}),
  ...(dailyImport && dailyQuotas ? { daily_quotas: dailyQuotas } : {}),
  ...(dailyImport && maxBrandPerDay !== null ? { max_brand_per_day: maxBrandPerDay } : {}),
  ...(dailyImport && candidatePoolSize !== null ? { candidate_pool_size: candidatePoolSize } : {}),
  ...(searchFilterConfig && typeof searchFilterConfig === "object"
    ? { search_filter_config: searchFilterConfig }
    : {}),
  ...(effectiveSiteCategories.length ? { site_categories: effectiveSiteCategories } : {}),
  ...(hasDailyTargets ? targetsBySiteCategory : {}),
};

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-cron-secret": CRON_SECRET,
  },
  body: JSON.stringify(body),
  signal: controller.signal,
})
  .then(async (resp) => {
    clearTimeout(timer);
    const text = await resp.text();
    console.log("Status:", resp.status);
    if (text) console.log(text);
    if (!resp.ok) process.exit(1);
  })
  .catch((err) => {
    clearTimeout(timer);
    console.error(err?.message || err);
    process.exit(1);
  });
