const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function discoveryFilterService({ product, opportunityScore, viralScore }) {
  const reasons = [];

  if (num(product?.rating) < 4.0) reasons.push("rating_below_minimum");
  if (num(product?.reviews_count) < 5) reasons.push("insufficient_reviews");
  if (String(product?.seller_reputation || "").toLowerCase().includes("red")) reasons.push("seller_reputation_low");
  if (num(opportunityScore) < 45) reasons.push("opportunity_score_low");
  if (num(viralScore) < 35) reasons.push("viral_score_low");

  return {
    accepted: reasons.length === 0,
    reasons,
  };
}
