import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  chunk,
  writeJson,
} from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "logs/programmatic-seo-engine.json");
const pageLimit = Math.max(100, Math.min(10000, Number(getArg("--page-limit", "10000")) || 10000));
const productsPerPage = Math.max(5, Math.min(50, Number(getArg("--products-per-page", "20")) || 20));

const FITNESS_KEYWORDS = [
  "whey protein barato",
  "creatina monohidratada",
  "equipamentos academia casa",
  "luva academia crossfit",
  "kit academia residencial",
  "suplementos mais vendidos",
  "melhores acessorios academia",
  "halter em promocao",
  "elastico fitness",
  "bicicleta ergometrica",
];

const parseMissingColumn = (error) => {
  const text = String(error?.message || error || "");
  const a = text.match(/column\s+([a-zA-Z0-9_\.]+)\s+does not exist/i);
  if (a?.[1]) return a[1].split(".").pop();
  const b = text.match(/Could not find the '([^']+)' column/i);
  if (b?.[1]) return b[1];
  return null;
};

const normalize = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const slugify = (value = "") =>
  normalize(value)
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90)
    .replace(/^-+|-+$/g, "") || "seo-ofertas";

const titleCase = (value = "") =>
  String(value)
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const seoMeta = (keyword) => {
  const pretty = titleCase(normalize(keyword));
  return {
    slug: `${slugify(keyword)}-promocao`,
    title: `Melhores Ofertas de ${pretty} em 2026`,
    description: `Veja as melhores promocoes de ${normalize(keyword)} no Mercado Livre com ate 60% de desconto.`,
    meta_title: `${pretty} em Promocao | Melhores Ofertas Hoje`,
    meta_description: `Compare ofertas de ${normalize(keyword)} com foco em preco, ranking e potencial de lucro.`,
    seo_keywords: [...new Set(normalize(keyword).split(" ").filter((w) => w.length >= 3))].slice(0, 12),
  };
};

const pickKeywordsFromProducts = (products) => {
  const counts = new Map();
  for (const row of products) {
    const source = normalize(row?.title || row?.name || "");
    for (const token of source.split(" ")) {
      if (token.length < 4) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map(([token]) => token);
};

const loadTrendKeywords = async (client) => {
  try {
    const rows = await client.fetchPagedRows(
      "/predicted_trends?select=keyword,trend_score&order=trend_score.desc&limit=500",
      500,
    );
    return (rows || []).map((r) => normalize(r?.keyword || "")).filter(Boolean);
  } catch {
    return [];
  }
};

const loadProductsAdaptive = async (client) => {
  const required = ["id"];
  const optional = [
    "title",
    "name",
    "rank_score",
    "profit_score",
    "discount_score",
    "visible",
    "is_active",
    "status",
    "marketplace",
    "removed_at",
  ];

  const excluded = new Set();
  for (let i = 0; i < 20; i += 1) {
    const selectCols = [...required, ...optional.filter((c) => !excluded.has(c))].join(",");
    try {
      const rows = await client.fetchPagedRows(
        `/products?select=${selectCols}&marketplace=eq.mercadolivre&removed_at=is.null&order=rank_score.desc&limit=50000`,
        1000,
      );
      const filtered = (rows || [])
        .filter((r) => String(r?.status || "active").toLowerCase() === "active")
        .filter((r) => r?.is_active !== false);
      return { rows: filtered, missingColumns: [...excluded] };
    } catch (error) {
      const missing = parseMissingColumn(error);
      if (!missing || required.includes(missing) || excluded.has(missing)) throw error;
      excluded.add(missing);
    }
  }
  return { rows: [], missingColumns: [...excluded] };
};

const main = async () => {
  const { client } = parseEnvAndClient(envFile);
  const nowIso = new Date().toISOString();

  let seoPagesTableReady = true;
  try {
    await client.request("/seo_pages?select=id&limit=1", { method: "GET" });
  } catch {
    seoPagesTableReady = false;
  }

  if (!seoPagesTableReady) {
    const report = {
      generated_at: nowIso,
      ok: true,
      skipped: true,
      reason: "seo_tables_missing_apply_migrations_first",
      totals: {
        keywords: 0,
        pages_upserted: 0,
        page_products_upserted: 0,
      },
    };
    writeJson(outFile, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const { rows: products, missingColumns: missingProductColumns } = await loadProductsAdaptive(client);
  const trendKeywords = await loadTrendKeywords(client);
  const productKeywords = pickKeywordsFromProducts(products);

  const mergedKeywords = [...new Set([...trendKeywords, ...FITNESS_KEYWORDS.map(normalize), ...productKeywords])]
    .filter((k) => k.length >= 4)
    .slice(0, pageLimit);

  const productTokens = new Map();
  for (const p of products) {
    productTokens.set(p.id, normalize(p?.title || p?.name || ""));
  }

  const pageRows = [];
  for (const keyword of mergedKeywords) {
    const meta = seoMeta(keyword);
    pageRows.push({
      slug: meta.slug,
      title: meta.title,
      description: meta.description,
      keyword,
      search_intent: keyword,
      meta_title: meta.meta_title,
      meta_description: meta.meta_description,
      seo_keywords: meta.seo_keywords,
      updated_at: nowIso,
      is_active: true,
    });
  }

  const upsertedPages = [];
  for (const part of chunk(pageRows, 200)) {
    const inserted = await client.request("/seo_pages", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(part),
    });
    if (Array.isArray(inserted)) upsertedPages.push(...inserted);
  }

  const slugToPageId = new Map();
  for (const row of upsertedPages) {
    if (row?.slug && row?.id) slugToPageId.set(String(row.slug), Number(row.id));
  }

  if (slugToPageId.size < pageRows.length) {
    const fresh = await client.fetchPagedRows(
      "/seo_pages?select=id,slug,is_active&is_active=eq.true&limit=20000",
      1000,
    );
    for (const row of fresh || []) {
      if (row?.slug && row?.id) slugToPageId.set(String(row.slug), Number(row.id));
    }
  }

  const pageProducts = [];
  for (const row of pageRows) {
    const pageId = slugToPageId.get(row.slug);
    if (!pageId) continue;

    const ranked = products
      .filter((p) => {
        const text = productTokens.get(p.id) || "";
        return text.includes(row.keyword);
      })
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

  let removedOldLinks = 0;
  for (const part of chunk([...slugToPageId.values()], 200)) {
    if (!part.length) continue;
    const inList = part.join(",");
    const deleted = await client.request(`/seo_page_products?page_id=in.(${inList})`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    });
    if (Array.isArray(deleted)) removedOldLinks += deleted.length;
  }

  let insertedLinks = 0;
  for (const part of chunk(pageProducts, 500)) {
    const inserted = await client.request("/seo_page_products", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(part),
    });
    if (Array.isArray(inserted)) insertedLinks += inserted.length;
  }

  const metricRows = [...slugToPageId.values()].map((pageId) => ({
    page_id: pageId,
    updated_at: nowIso,
  }));

  let metricsUpserted = 0;
  for (const part of chunk(metricRows, 500)) {
    const inserted = await client.request("/seo_page_metrics", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(part),
    });
    if (Array.isArray(inserted)) metricsUpserted += inserted.length;
  }

  const report = {
    generated_at: nowIso,
    ok: true,
    totals: {
      keywords: mergedKeywords.length,
      pages_upserted: slugToPageId.size,
      page_products_upserted: insertedLinks,
      old_page_products_removed: removedOldLinks,
      metrics_upserted: metricsUpserted,
    },
    missing_columns_ignored: {
      products_read: missingProductColumns,
    },
    samples: {
      keywords: mergedKeywords.slice(0, 20),
      pages: pageRows.slice(0, 10).map((p) => ({ slug: p.slug, keyword: p.keyword })),
    },
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
