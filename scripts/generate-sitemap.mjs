import fs from "fs";
import path from "path";

const projectRoot = process.cwd();
const publicDir = path.join(projectRoot, "public");
const seedPath = path.join(projectRoot, "src", "config", "programmaticSeoSeeds.json");
const schedulerEnvPath = path.join(projectRoot, "supabase", "functions", ".env.scheduler");

const nowIso = new Date().toISOString();
const baseUrl = process.env.SITE_URL || "https://arsenalfit.com.br";

const staticRoutes = [
  "/",
  "/home",
  "/produtos",
  "/categorias",
  "/melhores-ofertas",
  "/como-monitorar",
  "/afiliados",
  "/privacidade",
  "/termos"
];

const parseDotEnvText = (text) => {
  const out = {};
  const lines = String(text || "").split(/\r?\n/);
  for (const lineRaw of lines) {
    const line = String(lineRaw || "").trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
};

const loadOptionalSchedulerEnv = () => {
  if (!fs.existsSync(schedulerEnvPath)) return {};
  try {
    return parseDotEnvText(fs.readFileSync(schedulerEnvPath, "utf8"));
  } catch {
    return {};
  }
};

const normalizeSeoRouteFromSlug = (slug) => {
  let normalized = String(slug || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!normalized) return null;
  if (normalized.startsWith("seo/")) normalized = normalized.slice(4);
  if (!normalized) return null;
  return `/seo/${normalized}`;
};

const readSeoRoutes = () => {
  if (!fs.existsSync(seedPath)) return [];
  const raw = fs.readFileSync(seedPath, "utf8");
  const parsed = JSON.parse(raw);
  const categories = Array.isArray(parsed?.categories) ? parsed.categories : [];

  const routes = [];
  for (const category of categories) {
    const categorySlug = String(category?.slug || "")
      .toLowerCase()
      .trim();
    const keywords = Array.isArray(category?.keywords) ? category.keywords : [];
    if (!categorySlug || keywords.length === 0) continue;
    for (const keyword of keywords) {
      const keywordSlug = String(keyword || "")
        .toLowerCase()
        .trim();
      if (!keywordSlug) continue;
      routes.push(`/seo/${categorySlug}/${keywordSlug}`);
    }
  }

  return routes;
};

const fetchReleasedSeoDbRoutes = async () => {
  const fallbackEnv = loadOptionalSchedulerEnv();
  const supabaseUrl = process.env.SUPABASE_URL || fallbackEnv.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || fallbackEnv.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !serviceRoleKey) {
    console.log("[sitemap] Skipping DB SEO routes (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set)");
    return [];
  }

  const endpoint = `${String(supabaseUrl).replace(/\/+$/, "")}/rest/v1/seo_pages?select=slug&release_status=eq.released&is_active=eq.true&limit=50000`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) {
      console.log(`[sitemap] Skipping DB SEO routes (HTTP ${response.status})`);
      return [];
    }

    const rows = await response.json();
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => normalizeSeoRouteFromSlug(row?.slug))
      .filter(Boolean);
  } catch (error) {
    console.log(`[sitemap] Skipping DB SEO routes (${String(error?.message || error || "unknown_error")})`);
    return [];
  }
};

const dbSeoRoutes = await fetchReleasedSeoDbRoutes();
const uniqueRoutes = Array.from(new Set([...staticRoutes, ...readSeoRoutes(), ...dbSeoRoutes]));

const buildUrlNode = (route) => {
  const loc = `${baseUrl}${route}`;
  const priority = route === "/" ? "1.0" : route.startsWith("/seo/") ? "0.7" : "0.8";
  const changefreq = route.startsWith("/seo/") ? "daily" : "weekly";
  return [
    "  <url>",
    `    <loc>${loc}</loc>`,
    `    <lastmod>${nowIso}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>",
  ].join("\n");
};

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...uniqueRoutes.map(buildUrlNode),
  '</urlset>',
  '',
].join("\n");

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const sitemapPath = path.join(publicDir, "sitemap.xml");
fs.writeFileSync(sitemapPath, sitemap, "utf8");

const robotsPath = path.join(publicDir, "robots.txt");
const robotsText = [
  "User-agent: *",
  "Allow: /",
  "",
  `Sitemap: ${baseUrl}/sitemap.xml`,
  "",
].join("\n");
fs.writeFileSync(robotsPath, robotsText, "utf8");

console.log(`[sitemap] Generated ${uniqueRoutes.length} routes in public/sitemap.xml`);
