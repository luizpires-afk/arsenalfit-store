import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  chunk,
  writeJson,
} from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "logs/ai-dynamic-pricing.json");
const limit = Math.max(100, Number(getArg("--limit", "50000")) || 50000);
const updateDiffPct = Math.max(0.01, Number(getArg("--update-diff-pct", "0.05")) || 0.05);

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));
const round2 = (value) => Number((Number(value) || 0).toFixed(2));
const round6 = (value) => Number((Number(value) || 0).toFixed(6));

const normalize = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseMissingColumn = (error) => {
  const text = String(error?.message || error || "");
  const a = text.match(/column\s+([a-zA-Z0-9_\.]+)\s+does not exist/i);
  if (a?.[1]) return a[1].split(".").pop();
  const b = text.match(/Could not find the '([^']+)' column/i);
  if (b?.[1]) return b[1];
  return null;
};

const fetchProductsAdaptive = async (client, rowLimit) => {
  const required = ["id", "price"];
  const optional = [
    "name",
    "title",
    "rank_score",
    "trend_score",
    "conversion_score",
    "profit_score",
    "marketplace",
    "removed_at",
  ];

  const excluded = new Set();
  for (let i = 0; i < 20; i += 1) {
    const selectCols = [...required, ...optional.filter((c) => !excluded.has(c))].join(",");
    try {
      const rows = await client.fetchPagedRows(
        `/products?select=${selectCols}&marketplace=eq.mercadolivre&removed_at=is.null&rank_score=gt.0.5&order=rank_score.desc&limit=${rowLimit}`,
        1000,
      );
      return { rows: rows || [], missingColumns: [...excluded] };
    } catch (error) {
      const missing = parseMissingColumn(error);
      if (!missing || required.includes(missing) || excluded.has(missing)) throw error;
      excluded.add(missing);
    }
  }
  return { rows: [], missingColumns: [...excluded] };
};

const computeStrategy = ({ demand, elasticity, rankScore, discountScore }) => {
  if (discountScore > 0.7) return "clearance_price";
  if (demand > 0.75 && elasticity < 0.35) return "premium_price";
  if (demand > 0.7 && rankScore > 0.8) return "trend_maximization_price";
  if (elasticity > 0.7) return "penetration_price";
  return "competitive_price";
};

const main = async () => {
  const { client } = parseEnvAndClient(envFile);
  const nowIso = new Date().toISOString();

  try {
    await client.request("/product_price_intelligence?select=id&limit=1", { method: "GET" });
  } catch {
    const report = {
      generated_at: nowIso,
      ok: true,
      skipped: true,
      reason: "pricing_tables_missing_apply_migrations_first",
      totals: {
        products_scanned: 0,
        intelligence_rows_upserted: 0,
        products_price_updated: 0,
      },
    };
    writeJson(outFile, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const { rows: products, missingColumns } = await fetchProductsAdaptive(client, limit);

  const tokenMap = new Map();
  for (const p of products) {
    const text = normalize(p?.title || p?.name || "");
    const tokens = text.split(" ").filter((t) => t.length >= 4);
    tokenMap.set(p.id, tokens);
  }

  const intelligenceRows = [];
  const productPricePatches = [];

  for (const p of products) {
    const currentPrice = Math.max(0, Number(p?.price || 0));
    if (currentPrice <= 0) continue;

    const ownTokens = new Set(tokenMap.get(p.id) || []);
    const competitors = products.filter((candidate) => {
      if (candidate.id === p.id) return false;
      const ct = tokenMap.get(candidate.id) || [];
      return ct.some((t) => ownTokens.has(t));
    });

    const prices = [currentPrice, ...competitors.map((c) => Number(c?.price || 0)).filter((n) => n > 0)];
    const marketAvg = prices.reduce((acc, n) => acc + n, 0) / Math.max(1, prices.length);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    const trendScore = clamp(Number(p?.trend_score || 0));
    const conversionScore = clamp(Number(p?.conversion_score || 0));
    const rankScore = clamp(Number(p?.rank_score || 0));
    const discountScore = clamp(Number(p?.discount_score || 0));

    const demandScore = clamp((trendScore * 0.55) + (conversionScore * 0.45));
    const spread = marketAvg > 0 ? (maxPrice - minPrice) / marketAvg : 0;
    const elasticityScore = clamp(spread * (1 - demandScore));

    const strategy = computeStrategy({ demand: demandScore, elasticity: elasticityScore, rankScore, discountScore });

    let optimalPrice = marketAvg;
    if (strategy === "penetration_price") optimalPrice = Math.max(minPrice, marketAvg * 0.96);
    if (strategy === "competitive_price") optimalPrice = marketAvg;
    if (strategy === "premium_price") optimalPrice = Math.min(maxPrice, marketAvg * 1.08);
    if (strategy === "trend_maximization_price") optimalPrice = Math.min(maxPrice, marketAvg * 1.12);
    if (strategy === "clearance_price") optimalPrice = Math.max(minPrice, marketAvg * 0.9);

    optimalPrice = round2(optimalPrice);

    intelligenceRows.push({
      product_id: p.id,
      market_avg_price: round2(marketAvg),
      competitor_min_price: round2(minPrice),
      competitor_max_price: round2(maxPrice),
      demand_score: round6(demandScore),
      elasticity_score: round6(elasticityScore),
      optimal_price: optimalPrice,
      pricing_strategy: strategy,
      updated_at: nowIso,
    });

    const diffPct = currentPrice > 0 ? Math.abs(optimalPrice - currentPrice) / currentPrice : 0;
    if (diffPct >= updateDiffPct) {
      productPricePatches.push({ id: p.id, price: optimalPrice, updated_at: nowIso });
    }
  }

  let intelligenceUpserted = 0;
  for (const part of chunk(intelligenceRows, 200)) {
    const inserted = await client.request("/product_price_intelligence", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(part),
    });
    if (Array.isArray(inserted)) intelligenceUpserted += inserted.length;
  }

  let productsPriceUpdated = 0;
  for (const patch of productPricePatches) {
    const changed = await client.patch(`/products?id=eq.${encodeURIComponent(patch.id)}`, {
      price: patch.price,
      updated_at: patch.updated_at,
    });
    if (Array.isArray(changed) && changed.length > 0) productsPriceUpdated += 1;
  }

  const report = {
    generated_at: nowIso,
    ok: true,
    totals: {
      products_scanned: products.length,
      intelligence_rows_upserted: intelligenceUpserted,
      products_price_updated: productsPriceUpdated,
    },
    missing_columns_ignored: {
      products_read: missingColumns,
    },
    sample_strategies: intelligenceRows.slice(0, 20).map((row) => ({
      product_id: row.product_id,
      strategy: row.pricing_strategy,
      optimal_price: row.optimal_price,
      demand_score: row.demand_score,
      elasticity_score: row.elasticity_score,
    })),
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
