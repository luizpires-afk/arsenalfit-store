import fs from "fs";
import path from "path";

const projectRoot = process.cwd();
const sitemapPath = path.join(projectRoot, "public", "sitemap.xml");
const baseUrl = process.env.SITE_URL || "https://arsenalfit.com.br";
const baseOrigin = new URL(baseUrl).origin;

const fail = (message) => {
  console.error(`[sitemap:validate] ${message}`);
  process.exit(1);
};

if (!fs.existsSync(sitemapPath)) {
  fail("public/sitemap.xml not found. Run npm run generate:sitemap first.");
}

const xml = fs.readFileSync(sitemapPath, "utf8");
const locMatches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => String(match[1] || "").trim());

if (locMatches.length === 0) {
  fail("Sitemap has no <loc> entries.");
}

const seen = new Set();
for (const loc of locMatches) {
  if (!loc) fail("Found empty <loc> entry.");
  if (loc.includes(" ")) fail(`URL contains spaces: ${loc}`);
  if (seen.has(loc)) fail(`Duplicate URL found: ${loc}`);
  seen.add(loc);

  let parsed;
  try {
    parsed = new URL(loc);
  } catch {
    fail(`Invalid URL: ${loc}`);
  }

  if (parsed.origin !== baseOrigin) {
    fail(`URL origin mismatch. Expected ${baseOrigin}, got ${parsed.origin} in ${loc}`);
  }

  const pathname = parsed.pathname || "/";
  if (!pathname.startsWith("/")) {
    fail(`Pathname must start with '/': ${loc}`);
  }

  if (pathname.includes("//")) {
    fail(`Pathname contains double slash: ${loc}`);
  }

  if (pathname === "/seo" || pathname === "/seo/") {
    fail(`Invalid SEO route root in sitemap: ${loc}`);
  }

  if (pathname.startsWith("/seo/")) {
    const seoSlug = pathname.slice(5);
    if (!seoSlug) {
      fail(`Invalid SEO slug in URL: ${loc}`);
    }
    const segments = seoSlug.split("/").filter(Boolean);
    for (const segment of segments) {
      if (!/^[a-z0-9-]+$/.test(segment)) {
        fail(`SEO segment contains invalid chars (${segment}) in ${loc}`);
      }
    }
  }
}

console.log(`[sitemap:validate] OK (${locMatches.length} URLs)`);
