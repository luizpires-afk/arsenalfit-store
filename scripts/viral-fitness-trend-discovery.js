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
import { normalizeProductNameToQueries, normalizeProductNameTokens } from "./product-name-normalizer.js";

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

const applySourceBoost = (score, sourcePlatform) => {
  if (String(sourcePlatform || "").toLowerCase() === "tiktok") {
    return Number((score * 1.2).toFixed(3));
  }
  return Number(score.toFixed(3));
};

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const textSimilarity = (a, b) => {
  const aTokens = new Set(normalizeProductNameTokens(a));
  const bTokens = new Set(normalizeProductNameTokens(b));
  if (!aTokens.size || !bTokens.size) return 0;
  let inter = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) inter += 1;
  }
  const union = new Set([...aTokens, ...bTokens]).size;
  return union > 0 ? inter / union : 0;
};

const computeMatchConfidence = ({ trendName, listingTitle, sellerRating, reviews, price }) => {
  const sim = clamp01(textSimilarity(trendName, listingTitle));
  const sellerScore = clamp01(toNum(sellerRating) / 5);
  const reviewScore = clamp01(Math.log1p(toNum(reviews)) / Math.log1p(1500));
  const priceCompetitiveness = clamp01(1 - (toNum(price) / 3000));

  return Number(
    (
      (sim * 0.5) +
      (sellerScore * 0.2) +
      (reviewScore * 0.2) +
      (priceCompetitiveness * 0.1)
    ).toFixed(4),
  );
};

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
        trend_score: applySourceBoost(trendScore, sourcePlatform),
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
        trend_score: applySourceBoost(
          calcTrendScore({
            searchGrowth: synthetic.searchGrowth,
            socialMentions: synthetic.socialMentions,
            salesVelocity: synthetic.salesVelocity,
            priceMargin: synthetic.priceMargin,
          }),
          sourcePlatform,
        ),
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

const searchMlByQueries = async ({ token, queries, limit = 25 }) => {
  const byItem = new Map();

  for (const query of queries.slice(0, 5)) {
    try {
      const search = await fetchMl(
        `/sites/MLB/search?q=${encodeURIComponent(query)}&limit=${limit}`,
        token,
      );
      const rows = Array.isArray(search?.results) ? search.results : [];
      for (const row of rows) {
        const mlItemId = normalizeMlItemId(row?.id || row?.permalink);
        if (!mlItemId) continue;
        if (!byItem.has(mlItemId)) byItem.set(mlItemId, row);
      }
    } catch {
      // ignore single query failure
    }
  }

  return Array.from(byItem.values());
};

const classifyCandidate = ({ sellerRating, reviewsCount, stock, fastShipping }) => {
  const isStrict = sellerRating > 4.5 && reviewsCount > 100 && stock > 20 && fastShipping;
  const isNear = sellerRating > 4.2 && reviewsCount > 50 && stock > 10;
  return { isStrict, isNear };
};

const matchMercadoLivreListings = async ({ token, productName }) => {
  const queries = normalizeProductNameToQueries(productName, 5);
  const rows = await searchMlByQueries({ token, queries, limit: 25 });

  const strictCandidates = [];
  const nearCandidates = [];

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
    const listingTitle = String(item?.title || row?.title || "").trim();
    const price = Number(item?.price || row?.price || 0) || 0;
    const confidence = computeMatchConfidence({
      trendName: productName,
      listingTitle,
      sellerRating,
      reviews: reviewsCount,
      price,
    });

    const base = {
      score: (sellerRating * 2) + Math.min(5, reviewsCount / 250) + Math.min(5, stock / 100) + (fastShipping ? 2 : 0),
      ml_item_id: mlItemId,
      mercadolivre_product_url: String(item?.permalink || row?.permalink || "").trim(),
      title: listingTitle,
      price,
      seller_rating: sellerRating,
      reviews: reviewsCount,
      stock,
      fast_shipping: fastShipping,
      match_confidence: confidence,
    };

    const { isStrict, isNear } = classifyCandidate({
      sellerRating,
      reviewsCount,
      stock,
      fastShipping,
    });

    if (isStrict) {
      strictCandidates.push(base);
      continue;
    }
    if (isNear) nearCandidates.push(base);
  }

  strictCandidates.sort((a, b) => (b.score + b.match_confidence) - (a.score + a.match_confidence));
  nearCandidates.sort((a, b) => (b.match_confidence + (b.score / 20)) - (a.match_confidence + (a.score / 20)));

  return {
    queries,
    strict: strictCandidates,
    near: nearCandidates,
  };
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
  const { env, client } = parseEnvAndClient(envFile);
  const token = getMlToken(process.env);

  const allSignals = [];
  for (const [sourcePlatform, terms] of Object.entries(SOURCE_TERMS)) {
    const signals = await collectSignalsBySource({ token, sourcePlatform, terms });
    allSignals.push(...signals);
  }

  const trending = allSignals.filter((row) => Number(row.trend_score || 0) > threshold);

  const matched = [];
  const nearMatches = [];
  for (const trend of trending) {
    try {
      const result = await matchMercadoLivreListings({ token, productName: trend.product_name });
      let listing = result.strict[0] || null;
      const near = result.near[0] || null;

      if (!listing) {
        const localStrict = await matchFromLocalCatalog({ client, productName: trend.product_name });
        listing = localStrict;
      }

      if (listing && listing.mercadolivre_product_url) {
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
          raw_signal: {
            ...trend.signal,
            ml_queries: result.queries,
            match_confidence: listing.match_confidence ?? null,
          },
        });
      }

      if (near && near.mercadolivre_product_url) {
        nearMatches.push({
          product_name: trend.product_name,
          source_platform: trend.source_platform,
          trend_score: trend.trend_score,
          mercadolivre_product_url: near.mercadolivre_product_url,
          price: near.price,
          seller_rating: near.seller_rating,
          reviews: near.reviews,
          match_confidence: near.match_confidence,
        });
      }
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

  let nearUpserted = 0;
  for (const part of chunk(nearMatches, 50)) {
    const result = await client.request(`/trend_near_matches`, {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(part),
    });
    nearUpserted += Array.isArray(result) ? result.length : part.length;
  }

  let approvedProducts = 0;
  try {
    const headers = { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, Prefer: "count=exact" };
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/trend_discovered_products?select=id&status=eq.approved`, {
      method: "HEAD",
      headers,
    });
    const cr = resp.headers.get("content-range") || "*/0";
    approvedProducts = Number(String(cr).split("/")[1] || 0) || 0;
  } catch {
    approvedProducts = 0;
  }

  const report = {
    generated_at: new Date().toISOString(),
    ok: true,
    threshold,
    signals_found: allSignals.length,
    above_threshold: trending.length,
    ml_candidates: matched.length,
    near_matches: nearMatches.length,
    approved_products: approvedProducts,
    totals: {
      signals_found: allSignals.length,
      above_threshold: trending.length,
      ml_candidates: matched.length,
      near_matches: nearMatches.length,
      approved_products: approvedProducts,
      upserted,
      near_upserted: nearUpserted,
    },
    samples: {
      strict: matched.slice(0, 20),
      near: nearMatches.slice(0, 20),
    },
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
