const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function viralScoringService({ product, previousSnapshot = null }) {
  const previousSold = num(previousSnapshot?.sold_quantity);
  const soldQuantity = num(product?.sold_quantity);
  const salesVelocityPct = previousSold > 0 ? ((soldQuantity - previousSold) / previousSold) * 100 : 0;

  const previousReviews = num(previousSnapshot?.reviews_count);
  const reviews = num(product?.reviews_count);
  const recentReviewGrowth = previousReviews > 0 ? ((reviews - previousReviews) / previousReviews) * 100 : 0;

  const matchedTermsCount = num(product?.matched_terms_count);
  const favorites = num(product?.favorites_count);

  const components = {
    sales_velocity: Number(clamp(salesVelocityPct * 0.45, 0, 45).toFixed(2)),
    review_momentum: Number(clamp(recentReviewGrowth * 0.25, 0, 20).toFixed(2)),
    multi_search_repetition: Number(clamp(matchedTermsCount * 8, 0, 25).toFixed(2)),
    favorites_signal: Number(clamp(favorites > 0 ? 10 : 0, 0, 10).toFixed(2)),
  };

  const score = Number(clamp(Object.values(components).reduce((a, b) => a + b, 0), 0, 100).toFixed(2));

  return {
    score,
    components,
    explanation: {
      sales_velocity_pct: Number(salesVelocityPct.toFixed(2)),
      review_growth_pct: Number(recentReviewGrowth.toFixed(2)),
      matched_terms_count: matchedTermsCount,
    },
  };
}
