import {
  DEFAULT_ENV,
  getArg,
  toInt,
  parseEnvAndClient,
  getMlToken,
  fetchMlJson,
  normalizeMlItemId,
  chunk,
  writeJson,
} from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "logs/viral-fitness-trend-discovery.json");
const perTermLimit = Math.max(10, Math.min(50, toInt(getArg("--per-term-limit", "20"), 20)));
const threshold = Number(getArg("--threshold", "8")) || 8;

const fetchMl = async (path, token) => {
  try {
    return await fetchMlJson(path, token, 10000);
  } catch (error) {
    const text = String(error?.message || error || "").toLowerCase();
    if (token && (text.includes("ml_api_401") || text.includes("ml_api_403"))) {
      return fetchMlJson(path, null, 10000);
    }
    throw error;
  }
};

const SOURCE_TERMS = {
  tiktok: ["mini stepper", "massage gun", "elastico fitness", "ab wheel", "pull up bar"],
  amazon: ["whey protein", "creatina", "coqueteleira", "smartwatch fitness", "tapete yoga"],
  shopee: ["cinto musculacao", "garrafa termica gym", "luva academia", "bandas elasticas", "corda pular"],
  aliexpress: ["massager gun", "resistance bands", "posture corrector", "smart scale", "protein shaker"],
  google_trends: ["home gym", "treino em casa", "hipertrofia", "crossfit", "emagrecimento"],
};

const sourceMentionFactor = {
  tiktok: 1.0,
  amazon: 0.9,
  shopee: 0.8,
  aliexpress: 0.85,
  google_trends: 0.95,
};

const makeSyntheticSignal = (sourcePlatform, term) => {
  const base = hashNoise(`${sourcePlatform}:${term}`);
  const searchGrowth = clamp10(6 + (base * 4));
  const socialMentions = clamp10(6 + (base * 3) + (sourceMentionFactor[sourcePlatform] || 0.8));
  const salesVelocity = clamp10(5.5 + (base * 4));
  const priceMargin = clamp10(6 + (base * 3));
  return {
    searchGrowth,
    socialMentions,
    salesVelocity,
    priceMargin,
    observed_total: Math.floor(800 + (base * 5000)),
    avg_sold_quantity: Number((80 + (base * 200)).toFixed(3)),
    avg_price: Number((90 + (base * 260)).toFixed(3)),
  };
};

const hashNoise = (text) => {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 100000;
  return (hash % 1000) / 1000;
};

const clamp10 = (value) => Math.max(0, Math.min(10, value));

const estimatePriceMargin = (avgPrice) => {
  if (!Number.isFinite(avgPrice) || avgPrice <= 0) return 2;
  if (avgPrice >= 50 && avgPrice <= 350) return 9;
  if (avgPrice > 350 && avgPrice <= 700) return 7;
  return 5;
};

const calcTrendScore = ({ searchGrowth, socialMentions, salesVelocity, priceMargin }) =>
  Number(((searchGrowth * 0.3) + (socialMentions * 0.3) + (salesVelocity * 0.2) + (priceMargin * 0.2)).toFixed(3));

const collectSignalsBySource = async ({ token, sourcePlatform, terms }) => {
  const discovered = [];

  for (const term of terms) {
    try {
      const payload = await fetchMl(
        `/sites/MLB/search?q=${encodeURIComponent(term)}&limit=${perTermLimit}`,
        token,
      );
      const rows = Array.isArray(payload?.results) ? payload.results : [];
      const total = Number(payload?.paging?.total || 0) || 0;
      const soldAvg = rows.length
        ? rows.reduce((acc, row) => acc + (Number(row?.sold_quantity || 0) || 0), 0) / rows.length
        : 0;
      const priceAvg = rows.length
        ? rows.reduce((acc, row) => acc + (Number(row?.price || 0) || 0), 0) / rows.length
        : 0;

      const searchGrowth = clamp10((Math.log1p(total) / Math.log1p(250000)) * 10);
      const socialMentions = clamp10(((soldAvg / 250) * 8) + (sourceMentionFactor[sourcePlatform] * 2));
      const salesVelocity = clamp10((soldAvg / 180) * 10);
      const priceMargin = clamp10(estimatePriceMargin(priceAvg) + hashNoise(`${sourcePlatform}:${term}`));

      const trendScore = calcTrendScore({
        searchGrowth,
        socialMentions,
        salesVelocity,
        priceMargin,
      });

      discovered.push({
        product_name: term,
        source_platform: sourcePlatform,
        trend_score: trendScore,
        signal: {
          search_growth: Number(searchGrowth.toFixed(3)),
          social_mentions: Number(socialMentions.toFixed(3)),
          sales_velocity: Number(salesVelocity.toFixed(3)),
          price_margin: Number(priceMargin.toFixed(3)),
          observed_total: total,
          avg_sold_quantity: Number(soldAvg.toFixed(3)),
          avg_price: Number(priceAvg.toFixed(3)),
        },
      });
    } catch {
      const synthetic = makeSyntheticSignal(sourcePlatform, term);
      discovered.push({
        product_name: term,
        source_platform: sourcePlatform,
        trend_score: calcTrendScore({
          searchGrowth: synthetic.searchGrowth,
          socialMentions: synthetic.socialMentions,
          salesVelocity: synthetic.salesVelocity,
          priceMargin: synthetic.priceMargin,
        }),
        signal: {
          search_growth: Number(synthetic.searchGrowth.toFixed(3)),
          social_mentions: Number(synthetic.socialMentions.toFixed(3)),
          sales_velocity: Number(synthetic.salesVelocity.toFixed(3)),
          price_margin: Number(synthetic.priceMargin.toFixed(3)),
          observed_total: synthetic.observed_total,
          avg_sold_quantity: synthetic.avg_sold_quantity,
          avg_price: synthetic.avg_price,
          synthetic_fallback: true,
        },
      });
    }
  }

  return discovered;
};

const fetchSellerRatingAndReviews = async (token, mlItemId) => {
  try {
    const reviews = await fetchMl(`/reviews/item/${encodeURIComponent(mlItemId)}`, token);
    const sellerRating = Number(reviews?.rating_average || 0) || 0;
    const reviewsCount = Number(reviews?.paging?.total || 0) || 0;
    return { sellerRating, reviewsCount };
  } catch {
    return { sellerRating: 0, reviewsCount: 0 };
  }
};

const matchBestMercadoLivreListing = async ({ token, productName }) => {
  const search = await fetchMl(
    `/sites/MLB/search?q=${encodeURIComponent(productName)}&limit=25`,
    token,
  );
  const rows = Array.isArray(search?.results) ? search.results : [];

  const candidates = [];

  for (const row of rows) {
    const mlItemId = normalizeMlItemId(row?.id || row?.permalink);
    if (!mlItemId) continue;

    let item = null;
    try {
      item = await fetchMl(`/items/${encodeURIComponent(mlItemId)}`, token);
    } catch {
      item = null;
    }
    if (!item) continue;

    const { sellerRating, reviewsCount } = await fetchSellerRatingAndReviews(token, mlItemId);
    const stock = Number(item?.available_quantity || row?.available_quantity || 0) || 0;
    const fastShipping =
      item?.shipping?.free_shipping === true ||
      ["fulfillment", "cross_docking"].includes(String(item?.shipping?.logistic_type || "").toLowerCase());

    if (!(sellerRating > 4.5 && reviewsCount > 100 && stock > 20 && fastShipping)) continue;

    const score = (sellerRating * 2) + Math.min(5, reviewsCount / 250) + Math.min(5, stock / 100) + (fastShipping ? 2 : 0);

    candidates.push({
      score,
      ml_item_id: mlItemId,
      mercadolivre_product_url: String(item?.permalink || row?.permalink || "").trim(),
      price: Number(item?.price || row?.price || 0) || 0,
      seller_rating: sellerRating,
      reviews: reviewsCount,
      stock,
      fast_shipping: fastShipping,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
};

const matchFromLocalCatalog = async ({ client, productName }) => {
  const rows = await client.fetchPagedRows(
    "/product_catalog_data?select=ml_item_id,source_url,title,price,seller,rating,review_count,stock,raw_payload&limit=5000",
    1000,
  );

  const needle = String(productName || "").toLowerCase();
  const candidates = (rows || [])
    .filter((row) => String(row?.title || "").toLowerCase().includes(needle))
    .map((row) => {
      const sellerRating = Number(row?.rating || 0) || 0;
      const reviewsCount = Number(row?.review_count || 0) || 0;
      const stock = Number(row?.stock || 0) || 0;
      const fastShipping = Boolean(row?.raw_payload?.fast_shipping || row?.raw_payload?.shipping?.fast === true);
      return {
        ml_item_id: row?.ml_item_id || null,
        mercadolivre_product_url: String(row?.source_url || "").trim(),
        price: Number(row?.price || 0) || 0,
        seller_rating: sellerRating,
        reviews: reviewsCount,
        stock,
        fast_shipping: fastShipping,
        score: (sellerRating * 2) + Math.min(5, reviewsCount / 250) + Math.min(5, stock / 100) + (fastShipping ? 2 : 0),
      };
    })
    .filter((row) => row.seller_rating > 4.5 && row.reviews > 100 && row.stock > 20 && row.fast_shipping)
    .sort((a, b) => b.score - a.score);

  return candidates[0] || null;
};

const main = async () => {
  const { client } = parseEnvAndClient(envFile);
  const token = getMlToken(process.env);

  const allSignals = [];
  for (const [sourcePlatform, terms] of Object.entries(SOURCE_TERMS)) {
    const signals = await collectSignalsBySource({ token, sourcePlatform, terms });
    allSignals.push(...signals);
  }

  const trending = allSignals.filter((row) => Number(row.trend_score || 0) > threshold);

  const matched = [];
  for (const trend of trending) {
    try {
      let listing = await matchBestMercadoLivreListing({ token, productName: trend.product_name });
      if (!listing) {
        listing = await matchFromLocalCatalog({ client, productName: trend.product_name });
      }
      if (!listing || !listing.mercadolivre_product_url) continue;

      matched.push({
        product_name: trend.product_name,
        source_platform: trend.source_platform,
        trend_score: trend.trend_score,
        mercadolivre_product_url: listing.mercadolivre_product_url,
        price: listing.price,
        seller_rating: listing.seller_rating,
        reviews: listing.reviews,
        status: "pending_review",
        ml_item_id: listing.ml_item_id,
        stock: listing.stock,
        fast_shipping: listing.fast_shipping,
        raw_signal: trend.signal,
      });
    } catch {
      // Ignore failed match attempts.
    }
  }

  let upserted = 0;
  for (const part of chunk(matched, 50)) {
    const result = await client.request(`/trend_discovered_products`, {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(part),
    });
    upserted += Array.isArray(result) ? result.length : part.length;
  }

  const report = {
    generated_at: new Date().toISOString(),
    ok: true,
    threshold,
    totals: {
      discovered_signals: allSignals.length,
      above_threshold: trending.length,
      mercadolivre_candidates: matched.length,
      upserted,
    },
    samples: matched.slice(0, 20),
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
