import { loadViralMomentumConfig } from "./viralMomentumConfig.js";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const normalizeCategory = (value) => String(value || "").trim().toUpperCase();

export function discoveryFilterService({ product, opportunityScore, viralScore, signalConfidence = 0, config = null }) {
  const resolvedConfig = config || loadViralMomentumConfig(process.env);
  const qf = resolvedConfig.quality_filters;

  const reasons = [];
  const sellerReputation = String(product?.seller_reputation || "").toLowerCase();
  const category = normalizeCategory(product?.category);
  const hasAllowedCategory =
    !qf.allowed_category_tokens.length || qf.allowed_category_tokens.some((token) => category.includes(String(token).toUpperCase()));

  if (num(product?.rating) < num(qf.min_rating)) reasons.push("rating_below_minimum");
  if (num(product?.reviews_count) < num(qf.min_reviews)) reasons.push("insufficient_reviews");
  if (num(product?.stock) < num(qf.min_stock)) reasons.push("stock_unavailable");
  if (num(signalConfidence) < num(qf.min_signal_confidence)) reasons.push("signal_confidence_low");
  if (qf.blocked_seller_tokens.some((token) => sellerReputation.includes(token))) reasons.push("seller_reputation_low");
  if (!hasAllowedCategory) reasons.push("category_irrelevant");
  if (num(opportunityScore) < num(resolvedConfig.thresholds.min_opportunity_for_priority)) reasons.push("opportunity_score_low");
  if (num(viralScore) < num(resolvedConfig.thresholds.min_viral_momentum_score)) reasons.push("viral_score_low");

  return {
    accepted: reasons.length === 0,
    reasons,
  };
}
