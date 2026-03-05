import fs from "fs";
import path from "path";
import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
} from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const baseUrl = String(getArg("--base-url", process.env.SITE_URL || "https://arsenalfit.store")).replace(/\/$/, "");
const outFile = getArg("--out-file", "public/sitemap.xml");
const maxUrlsPerFile = Math.max(1000, Number(getArg("--max-urls-per-file", "50000")) || 50000);

const CATEGORY_PAGES = [
  "/fitness/halteres",
  "/fitness/whey",
  "/fitness/bicicleta-ergometrica",
  "/fitness/esteira",
];

const xmlEscape = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

const makeUrlEntry = ({ loc, lastmod, changefreq = "daily", priority = "0.7" }) => `\n  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    ${lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : ""}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;

const makeSitemapFile = (entries) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}\n</urlset>\n`;

const makeIndexFile = (sitemaps) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps
    .map(
      ({ loc, lastmod }) =>
        `\n  <sitemap>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${xmlEscape(lastmod)}</lastmod>\n  </sitemap>`,
    )
    .join("")}\n</sitemapindex>\n`;

const main = async () => {
  const { client } = parseEnvAndClient(envFile);

  let products = [];
  try {
    products = await client.fetchPagedRows(
      "/products?select=slug,updated_at,last_sync,is_active,status,visible&visible=eq.true&is_active=eq.true&status=eq.active&removed_at=is.null",
      1000,
    );
  } catch {
    products = [];
  }

  if (!Array.isArray(products) || products.length === 0) {
    try {
      products = await client.fetchPagedRows(
        "/products?select=slug,updated_at,last_sync,is_active,status,visible&visible=eq.true&is_active=eq.true",
        1000,
      );
    } catch {
      products = [];
    }
  }

  if (!Array.isArray(products) || products.length === 0) {
    try {
      products = await client.fetchPagedRows(
        "/products?select=slug,updated_at,last_sync,status,visible&visible=eq.true&status=eq.active",
        1000,
      );
    } catch {
      products = [];
    }
  }

  const productEntries = (products || [])
    .filter((p) => String(p?.slug || "").trim().length > 0)
    .map((p) => {
      const lastmod = p?.updated_at || p?.last_sync || new Date().toISOString();
      return makeUrlEntry({
        loc: `${baseUrl}/produto/${encodeURIComponent(String(p.slug))}`,
        lastmod,
        changefreq: "daily",
        priority: "0.8",
      });
    });

  const categoryEntries = CATEGORY_PAGES.map((page) =>
    makeUrlEntry({
      loc: `${baseUrl}${page}`,
      lastmod: new Date().toISOString(),
      changefreq: "daily",
      priority: "0.9",
    }),
  );

  const staticEntries = [
    makeUrlEntry({ loc: `${baseUrl}/`, lastmod: new Date().toISOString(), changefreq: "daily", priority: "1.0" }),
  ];

  let seoPages = [];
  try {
    seoPages = await client.fetchPagedRows(
      "/seo_pages?select=slug,updated_at,is_active&is_active=eq.true&limit=20000",
      1000,
    );
  } catch {
    seoPages = [];
  }

  const seoEntries = (seoPages || [])
    .filter((p) => String(p?.slug || "").trim().length > 0)
    .map((p) =>
      makeUrlEntry({
        loc: `${baseUrl}/${encodeURIComponent(String(p.slug))}`,
        lastmod: p?.updated_at || new Date().toISOString(),
        changefreq: "daily",
        priority: "0.7",
      }),
    );

  const allEntries = [...staticEntries, ...categoryEntries, ...productEntries, ...seoEntries];

  const finalPath = path.resolve(outFile);
  const outDir = path.dirname(finalPath);
  const outName = path.basename(finalPath, path.extname(finalPath));
  fs.mkdirSync(outDir, { recursive: true });

  const chunks = [];
  for (let i = 0; i < allEntries.length; i += maxUrlsPerFile) {
    chunks.push(allEntries.slice(i, i + maxUrlsPerFile));
  }

  const generatedFiles = [];
  if (chunks.length <= 1) {
    fs.writeFileSync(finalPath, makeSitemapFile(chunks[0] || []), "utf8");
    generatedFiles.push(path.basename(finalPath));
  } else {
    const nowIso = new Date().toISOString();
    const sitemaps = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const file = `${outName}-${i + 1}.xml`;
      const full = path.join(outDir, file);
      fs.writeFileSync(full, makeSitemapFile(chunks[i]), "utf8");
      generatedFiles.push(file);
      sitemaps.push({ loc: `${baseUrl}/${file}`, lastmod: nowIso });
    }
    fs.writeFileSync(finalPath, makeIndexFile(sitemaps), "utf8");
    generatedFiles.push(path.basename(finalPath));
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        generated_at: new Date().toISOString(),
        totals: {
          products: productEntries.length,
          seo_pages: seoEntries.length,
          categories: categoryEntries.length,
          static: staticEntries.length,
          urls: allEntries.length,
          sitemap_files: chunks.length <= 1 ? 1 : chunks.length,
        },
        output: {
          index: finalPath,
          files: generatedFiles,
          max_urls_per_file: maxUrlsPerFile,
        },
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
