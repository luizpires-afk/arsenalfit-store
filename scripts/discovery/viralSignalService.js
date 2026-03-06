import { buildTrendKeywordSignals } from "./trendKeywordSignalService.js";

const toN = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const pct = (current, previous) => {
  const c = toN(current, 0);
  const p = toN(previous, 0);
  if (p <= 0) return c > 0 ? 100 : 0;
  return ((c - p) / p) * 100;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const inferQuestionCount = (product, previousSnapshot) => {
  const currentReviews = toN(product?.reviews_count, 0);
  const prevReviews = toN(previousSnapshot?.reviews_count, 0);
  const current = Math.max(0, Math.round(currentReviews * 0.18));
  const prev = Math.max(0, Math.round(prevReviews * 0.18));
  return { current, prev };
};

const inferSearchSignals = (product) => {
  const matchedTermsCount = toN(product?.matched_terms_count, 0);
  const googleTrendsGrowth = clamp(matchedTermsCount * 12 + (toN(product?.favorites_count, 0) > 0 ? 8 : 0), 0, 100);
  const relatedQueriesGrowth = clamp(matchedTermsCount * 9, 0, 100);
  const emergingKeywordsCount = Math.max(0, Math.round(matchedTermsCount));
  const serpSignalScore = clamp((googleTrendsGrowth * 0.6) + (relatedQueriesGrowth * 0.4), 0, 100);
  return {
    google_trends_growth: Number(googleTrendsGrowth.toFixed(2)),
    related_queries_growth: Number(relatedQueriesGrowth.toFixed(2)),
    emerging_keywords_count: emergingKeywordsCount,
    serp_signal_score: Number(serpSignalScore.toFixed(2)),
  };
};

const inferSocialSignals = (product, previousSnapshot) => {
  const salesGrowth = pct(product?.sold_quantity, previousSnapshot?.sold_quantity);
  const reviewGrowth = pct(product?.reviews_count, previousSnapshot?.reviews_count);
  const favoritesGrowth = pct(product?.favorites_count, previousSnapshot?.favorites_count);

  const socialMentionsVelocity = clamp((salesGrowth * 0.35) + (reviewGrowth * 0.25) + (favoritesGrowth * 0.4), -100, 500);
  const hashtagAcceleration = clamp(socialMentionsVelocity * 0.55, -100, 300);
  const engagementVelocity = clamp((toN(product?.rating, 0) * 12) + (reviewGrowth * 0.35), 0, 100);
  const purchaseIntentComments = Math.max(0, Math.round(toN(product?.reviews_count, 0) * 0.07));

  return {
    social_mentions_velocity: Number(socialMentionsVelocity.toFixed(2)),
    hashtag_acceleration: Number(hashtagAcceleration.toFixed(2)),
    engagement_velocity: Number(engagementVelocity.toFixed(2)),
    purchase_intent_comments: purchaseIntentComments,
  };
};

export const buildProductSignalSnapshot = ({ product, previousSnapshot = null, roundId, nowIso = new Date().toISOString() }) => {
  const salesGrowth = pct(product?.sold_quantity, previousSnapshot?.sold_quantity);
  const reviewGrowth = pct(product?.reviews_count, previousSnapshot?.reviews_count);
  const favoritesGrowth = pct(product?.favorites_count, previousSnapshot?.favorites_count);
  const stockGrowth = pct(product?.stock, previousSnapshot?.stock);
  const rankMovement = clamp(
    toN(previousSnapshot?.opportunity_score, 0) - toN(product?.opportunity_score, 0),
    -100,
    100,
  );

  const questions = inferQuestionCount(product, previousSnapshot);
  const questionGrowth = pct(questions.current, questions.prev);

  const searchSignals = inferSearchSignals(product);
  const socialSignals = inferSocialSignals(product, previousSnapshot);

  const signalPayload = {
    market: {
      sales_growth: Number(salesGrowth.toFixed(2)),
      review_growth: Number(reviewGrowth.toFixed(2)),
      question_growth: Number(questionGrowth.toFixed(2)),
      favorites_growth: Number(favoritesGrowth.toFixed(2)),
      category_rank_movement: Number(rankMovement.toFixed(2)),
      stock_replenishment_frequency: Number(Math.max(0, stockGrowth).toFixed(2)),
    },
    search: searchSignals,
    social: socialSignals,
    quality: {
      rating_quality: Number(toN(product?.rating, 0).toFixed(2)),
      seller_reputation: String(product?.seller_reputation || ""),
      stock_health: Number(toN(product?.stock, 0).toFixed(2)),
      category_relevance: String(product?.category || ""),
    },
    confidence: {
      source_terms_count: Math.max(0, Math.round(toN(product?.matched_terms_count, 0))),
      has_previous_snapshot: Boolean(previousSnapshot),
    },
  };

  const windowsRows = ["1d", "3d", "7d", "30d"].map((windowKey) => ({
    round_id: roundId,
    marketplace: String(product?.marketplace || "mercadolivre"),
    external_product_id: String(product?.external_product_id || ""),
    signal_window: windowKey,
    signal_payload: {
      ...signalPayload,
      window: windowKey,
    },
    collected_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  }));

  const trendKeywordRows = buildTrendKeywordSignals({ product, roundId, nowIso });

  const trendHistoryRow = {
    marketplace: String(product?.marketplace || "mercadolivre"),
    external_product_id: String(product?.external_product_id || ""),
    captured_at: nowIso,
    sales_count: Math.max(0, Math.round(toN(product?.sold_quantity, 0))),
    reviews_count: Math.max(0, Math.round(toN(product?.reviews_count, 0))),
    questions_count: questions.current,
    favorites_count: Math.max(0, Math.round(toN(product?.favorites_count, 0))),
    stock: Math.max(0, Math.round(toN(product?.stock, 0))),
    category_rank: Math.max(0, Math.round(toN(product?.opportunity_score, 0))),
    search_trend_score: Number(searchSignals.google_trends_growth.toFixed(3)),
    social_mentions: Math.max(0, Math.round(toN(socialSignals.social_mentions_velocity, 0))),
    engagement_score: Number(socialSignals.engagement_velocity.toFixed(3)),
    signal_confidence: Number(Math.min(1, Math.max(0, (toN(product?.matched_terms_count, 0) / 4))).toFixed(3)),
    raw_signal: signalPayload,
    created_at: nowIso,
  };

  return {
    signalPayload,
    windowsRows,
    trendKeywordRows,
    trendHistoryRow,
  };
};
