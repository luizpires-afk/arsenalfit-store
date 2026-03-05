const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function opportunityScoringService({ product, previousSnapshot = null, historicalAvgPrice = null }) {
  const discountPct = num(product?.discount_percent);
  const currentPrice = num(product?.current_price);

  const baselinePrice =
    num(historicalAvgPrice) > 0
      ? num(historicalAvgPrice)
      : num(previousSnapshot?.current_price) > 0
        ? num(previousSnapshot?.current_price)
        : currentPrice;

  const belowBaselinePct =
    baselinePrice > 0 && currentPrice > 0 && baselinePrice > currentPrice
      ? ((baselinePrice - currentPrice) / baselinePrice) * 100
      : 0;

  const previousSold = num(previousSnapshot?.sold_quantity);
  const soldQuantity = num(product?.sold_quantity);
  const salesGrowthPct = previousSold > 0 ? ((soldQuantity - previousSold) / previousSold) * 100 : 0;

  const reviews = num(product?.reviews_count);
  const rating = num(product?.rating);

  const components = {
    discount: Number(clamp(discountPct * 1.1, 0, 40).toFixed(2)),
    price_below_baseline: Number(clamp(belowBaselinePct * 1.2, 0, 30).toFixed(2)),
    sales_growth: Number(clamp(salesGrowthPct * 0.35, 0, 20).toFixed(2)),
    social_proof: Number(clamp((reviews >= 20 ? 6 : reviews >= 10 ? 4 : reviews > 0 ? 2 : 0) + (rating >= 4.7 ? 4 : rating >= 4.3 ? 2 : 0), 0, 10).toFixed(2)),
  };

  const score = Number(clamp(Object.values(components).reduce((a, b) => a + b, 0), 0, 100).toFixed(2));

  return {
    score,
    components,
    explanation: {
      baseline_price: Number(baselinePrice.toFixed(2)),
      below_baseline_pct: Number(belowBaselinePct.toFixed(2)),
      sales_growth_pct: Number(salesGrowthPct.toFixed(2)),
      discount_pct: Number(discountPct.toFixed(2)),
    },
  };
}
