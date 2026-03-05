import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  chunk,
  writeJson,
} from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "logs/ai-product-description-generator.json");
const limit = Math.max(100, Number(getArg("--limit", "50000")) || 50000);

const normalize = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const titleCase = (value = "") =>
  String(value)
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const unique = (arr) => [...new Set(arr.filter(Boolean))];

const parseMissingColumn = (error) => {
  const text = String(error?.message || error || "");
  const a = text.match(/column\s+([a-zA-Z0-9_\.]+)\s+does not exist/i);
  if (a?.[1]) return a[1].split(".").pop();
  const b = text.match(/Could not find the '([^']+)' column/i);
  if (b?.[1]) return b[1];
  return null;
};

const main = async () => {
  const { client } = parseEnvAndClient(envFile);
  const nowIso = new Date().toISOString();

  try {
    await client.request("/product_content_ai?select=id&limit=1", { method: "GET" });
  } catch {
    const report = {
      generated_at: nowIso,
      ok: true,
      skipped: true,
      reason: "content_ai_tables_missing_apply_migrations_first",
      totals: {
        products_scanned: 0,
        content_generated: 0,
      },
    };
    writeJson(outFile, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  let trendKeywords = [];
  try {
    const rows = await client.fetchPagedRows(
      "/predicted_trends?select=keyword,trend_score&order=trend_score.desc&limit=300",
      300,
    );
    trendKeywords = unique((rows || []).map((r) => normalize(r?.keyword || ""))).slice(0, 100);
  } catch {
    trendKeywords = [];
  }

  let seoKeywords = [];
  try {
    const rows = await client.fetchPagedRows(
      "/seo_pages?select=seo_keywords&is_active=eq.true&limit=500",
      500,
    );
    seoKeywords = unique((rows || []).flatMap((r) => Array.isArray(r?.seo_keywords) ? r.seo_keywords.map((k) => normalize(k)) : []));
  } catch {
    seoKeywords = [];
  }

  const keywordPool = unique([...trendKeywords, ...seoKeywords]).filter((k) => k.length >= 4);

  const required = ["id"];
  const optional = ["name", "title", "slug", "meta_title", "meta_description", "marketplace", "removed_at"];
  const excluded = new Set();
  let products = [];

  for (let i = 0; i < 20; i += 1) {
    const selectCols = [...required, ...optional.filter((c) => !excluded.has(c))].join(",");
    try {
      products = await client.fetchPagedRows(
        `/products?select=${selectCols}&marketplace=eq.mercadolivre&removed_at=is.null&order=updated_at.desc&limit=${limit}`,
        1000,
      );
      break;
    } catch (error) {
      const missing = parseMissingColumn(error);
      if (!missing || required.includes(missing) || excluded.has(missing)) throw error;
      excluded.add(missing);
    }
  }

  const existing = await client.fetchPagedRows(
    "/product_content_ai?select=product_id&limit=50000",
    1000,
  );
  const existingIds = new Set((existing || []).map((row) => String(row?.product_id || "")));

  const targetProducts = (products || []).filter((p) => !existingIds.has(String(p.id)));

  const contentRows = [];
  for (const p of targetProducts) {
    const titleBase = String(p?.title || p?.name || "Produto Fitness").trim();
    const normalizedTitle = normalize(titleBase);
    const matched = keywordPool.filter((k) => normalizedTitle.includes(k)).slice(0, 6);
    const finalKeywords = unique([...matched, ...normalizedTitle.split(" ").filter((w) => w.length >= 4)]).slice(0, 8);

    const primaryKeyword = finalKeywords[0] || "fitness";
    const seoTitle = `${titleCase(titleBase)} | Oferta ${titleCase(primaryKeyword)}`.slice(0, 120);
    const metaDescription = `Descubra ${titleBase} com foco em ${primaryKeyword}, beneficios reais e melhor custo-beneficio para sua rotina de treino.`.slice(0, 155);

    const bulletPoints = [
      `Desempenho otimizado para ${primaryKeyword}`,
      "Qualidade validada por sinais de mercado",
      "Excelente relacao custo-beneficio",
      "Entrega e compra seguras no marketplace",
    ];

    const faq = [
      {
        question: `Para quem ${titleBase} e indicado?`,
        answer: `${titleBase} atende usuarios que buscam performance e praticidade no treino diario.`,
      },
      {
        question: "Como escolher o melhor modelo?",
        answer: "Compare tamanho, material, reputacao do vendedor e score de conversao antes da compra.",
      },
      {
        question: "Vale comprar em promocao?",
        answer: "Sim. Priorize anuncios com bom desconto, score de lucro e tendencia de demanda crescente.",
      },
    ];

    const longDescription = `${titleBase} e uma opcao recomendada para quem busca evolucao nos treinos com mais eficiencia. Este produto foi analisado por sinais de tendencia, conversao e lucratividade para garantir relevancia na vitrine. Use os pontos de comparacao e avalie reputacao do vendedor para tomar a melhor decisao.`;

    const schemaMarkup = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: titleBase,
      description: metaDescription,
      category: "Fitness",
      keywords: finalKeywords.join(", "),
    };

    contentRows.push({
      product_id: p.id,
      seo_title: seoTitle,
      meta_description: metaDescription,
      long_description: longDescription,
      bullet_points: bulletPoints,
      faq,
      schema_markup: schemaMarkup,
      generated_at: nowIso,
    });
  }

  let inserted = 0;
  for (const part of chunk(contentRows, 200)) {
    const rows = await client.request("/product_content_ai", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(part),
    });
    if (Array.isArray(rows)) inserted += rows.length;
  }

  const report = {
    generated_at: nowIso,
    ok: true,
    totals: {
      products_scanned: (products || []).length,
      products_pending_content: targetProducts.length,
      content_generated: inserted,
    },
    keyword_pool_size: keywordPool.length,
    missing_columns_ignored: [...excluded],
    samples: contentRows.slice(0, 10).map((row) => ({
      product_id: row.product_id,
      seo_title: row.seo_title,
    })),
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
