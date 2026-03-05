import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  chunk,
  writeJson,
} from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "logs/seo-keyword-expander.json");
const maxKeywords = Math.max(1000, Math.min(100000, Number(getArg("--max-keywords", "100000")) || 100000));
const productsPerPage = Math.max(5, Math.min(50, Number(getArg("--products-per-page", "20")) || 20));

const BASE_CLUSTERS = [
  "best whey protein",
  "cheap whey protein",
  "whey protein for muscle gain",
  "creatine benefits",
  "home gym equipment",
  "adjustable dumbbells",
  "best creatine",
  "crossfit gloves",
  "residential gym kit",
  "supplements best sellers",
];

const MODIFIERS = [
  "best",
  "cheap",
  "for beginners",
  "for home gym",
  "for hypertrophy",
  "with discount",
  "top rated",
  "high conversion",
  "2026 guide",
  "premium",
];

const normalize = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const slugify = (value = "") =>
  normalize(value).replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "seo-page";

const parseMissingColumn = (error) => {
  const text = String(error?.message || error || "");
  const a = text.match(/column\s+([a-zA-Z0-9_\.]+)\s+does not exist/i);
  if (a?.[1]) return a[1].split(".").pop();
  const b = text.match(/Could not find the '([^']+)' column/i);
  if (b?.[1]) return b[1];
  return null;
};

const buildUniverse = (trendKeywords) => {
  const out = new Set();
  for (const seed of [...BASE_CLUSTERS, ...trendKeywords]) {
    const base = normalize(seed);
    if (!base) continue;
    out.add(base);
    for (const mod of MODIFIERS) {
      out.add(`${normalize(mod)} ${base}`.trim());
      out.add(`${base} ${normalize(mod)}`.trim());
    }
  }
  return [...out].slice(0, maxKeywords);
};

const main = async () => {
  const { client } = parseEnvAndClient(envFile);
  const nowIso = new Date().toISOString();

  try {
    await client.request("/seo_keyword_universe?select=id&limit=1", { method: "GET" });
  } catch {
    const report = {
      generated_at: nowIso,
      ok: true,
      skipped: true,
      reason: "seo_keyword_universe_missing_apply_migrations_first",
      totals: {
        keywords_generated: 0,
        pages_upserted: 0,
      },
    };
    writeJson(outFile, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  let trendKeywords = [];
  try {
    const rows = await client.fetchPagedRows(
      "/predicted_trends?select=keyword,trend_score&order=trend_score.desc&limit=1000",
      1000,
    );
    trendKeywords = (rows || []).map((r) => normalize(r?.keyword || "")).filter(Boolean);
  } catch {
    trendKeywords = [];
  }

  const universe = buildUniverse(trendKeywords);

  const universeRows = universe.map((keyword, idx) => ({
    keyword,
    search_volume: Math.max(10, 5000 - (idx % 3000)),
    keyword_difficulty: Number((Math.min(1, 0.2 + ((idx % 100) / 120))).toFixed(6)),
    intent: keyword.includes("cheap") || keyword.includes("discount") ? "transactional" : "commercial",
    cluster: keyword.split(" ").slice(0, 2).join(" "),
    created_at: nowIso,
  }));

  let keywordsUpserted = 0;
  for (const part of chunk(universeRows, 500)) {
    const inserted = await client.request("/seo_keyword_universe?on_conflict=keyword", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(part),
    });
    if (Array.isArray(inserted)) keywordsUpserted += inserted.length;
  }

  const required = ["id"];
  const optional = ["title", "name", "rank_score", "profit_score", "discount_score", "marketplace", "removed_at"];
  const excluded = new Set();
  let products = [];
  for (let i = 0; i < 20; i += 1) {
    const selectCols = [...required, ...optional.filter((c) => !excluded.has(c))].join(",");
    try {
      products = await client.fetchPagedRows(
        `/products?select=${selectCols}&marketplace=eq.mercadolivre&removed_at=is.null&order=rank_score.desc&limit=50000`,
        1000,
      );
      break;
    } catch (error) {
      const missing = parseMissingColumn(error);
      if (!missing || required.includes(missing) || excluded.has(missing)) throw error;
      excluded.add(missing);
    }
  }

  const productText = new Map((products || []).map((p) => [p.id, normalize(p?.title || p?.name || "")]));

  const pageRows = universe.map((keyword) => ({
    slug: `${slugify(keyword)}-promocao`,
    title: `Melhores Ofertas para ${keyword} em 2026`,
    description: `Compare as melhores ofertas para ${keyword} com foco em preco, lucro e conversao.`,
    keyword,
    search_intent: keyword,
    meta_title: `${keyword} | Ofertas e Guia Completo`,
    meta_description: `Veja os melhores produtos para ${keyword} com atualizacao automatica e recomendacoes inteligentes.`,
    seo_keywords: keyword.split(" ").filter((w) => w.length >= 3),
    updated_at: nowIso,
    is_active: true,
  }));

  let pagesUpserted = 0;
  for (const part of chunk(pageRows, 200)) {
    const inserted = await client.request("/seo_pages?on_conflict=slug", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(part),
    });
    if (Array.isArray(inserted)) pagesUpserted += inserted.length;
  }

  const pageLookupRows = await client.fetchPagedRows(
    "/seo_pages?select=id,slug,keyword,is_active&is_active=eq.true&limit=120000",
    2000,
  );
  const pageIdBySlug = new Map((pageLookupRows || []).map((p) => [String(p.slug), Number(p.id)]));

  const pageProducts = [];
  for (const page of pageRows) {
    const pageId = pageIdBySlug.get(page.slug);
    if (!pageId) continue;

    const ranked = (products || [])
      .filter((p) => (productText.get(p.id) || "").includes(page.keyword))
      .sort((a, b) => {
        const ar = Number(a?.rank_score || 0);
        const br = Number(b?.rank_score || 0);
        if (br !== ar) return br - ar;
        const ap = Number(a?.profit_score || 0);
        const bp = Number(b?.profit_score || 0);
        if (bp !== ap) return bp - ap;
        const ad = Number(a?.discount_score || 0);
        const bd = Number(b?.discount_score || 0);
        return bd - ad;
      })
      .slice(0, productsPerPage);

    for (let i = 0; i < ranked.length; i += 1) {
      pageProducts.push({
        page_id: pageId,
        product_id: ranked[i].id,
        position: i + 1,
      });
    }
  }

  let pageLinksUpserted = 0;
  for (const part of chunk(pageProducts, 500)) {
    const inserted = await client.request("/seo_page_products", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(part),
    });
    if (Array.isArray(inserted)) pageLinksUpserted += inserted.length;
  }

  const report = {
    generated_at: nowIso,
    ok: true,
    totals: {
      keywords_generated: universe.length,
      keyword_rows_upserted: keywordsUpserted,
      pages_upserted: pagesUpserted,
      page_product_links_upserted: pageLinksUpserted,
    },
    missing_columns_ignored: [...excluded],
    samples: {
      keywords: universe.slice(0, 20),
      page_slugs: pageRows.slice(0, 20).map((p) => p.slug),
    },
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
