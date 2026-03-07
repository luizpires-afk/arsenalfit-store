import fs from "fs";
import path from "path";

const projectRoot = process.cwd();
const publicDir = path.join(projectRoot, "public");
const seedPath = path.join(projectRoot, "src", "config", "programmaticSeoSeeds.json");

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

const uniqueRoutes = Array.from(new Set([...staticRoutes, ...readSeoRoutes()]));

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
