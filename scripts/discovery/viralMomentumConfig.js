import fs from "fs";
import path from "path";

const configPath = path.resolve(process.cwd(), "config/viral_momentum_config.json");

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
};

const clamp01 = (value, fallback = 0) => {
  const n = num(value, fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
};

const readBaseConfig = () => {
  if (!fs.existsSync(configPath)) {
    throw new Error(`viral_momentum_config_missing:${configPath}`);
  }
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
};

export const loadViralMomentumConfig = (env = process.env) => {
  const base = readBaseConfig();

  const weights = {
    engagement_growth: clamp01(env.VIRAL_WEIGHT_ENGAGEMENT_GROWTH, base?.weights?.engagement_growth ?? 0.2),
    sales_growth: clamp01(env.VIRAL_WEIGHT_SALES_GROWTH, base?.weights?.sales_growth ?? 0.24),
    search_growth: clamp01(env.VIRAL_WEIGHT_SEARCH_GROWTH, base?.weights?.search_growth ?? 0.2),
    social_mentions: clamp01(env.VIRAL_WEIGHT_SOCIAL_MENTIONS, base?.weights?.social_mentions ?? 0.18),
    rating_quality: clamp01(env.VIRAL_WEIGHT_RATING_QUALITY, base?.weights?.rating_quality ?? 0.1),
    reliability_penalty: clamp01(env.VIRAL_WEIGHT_RELIABILITY_PENALTY, base?.weights?.reliability_penalty ?? 0.08),
  };

  const windows = {
    w1d_weight: clamp01(env.VIRAL_WINDOW_1D_WEIGHT, base?.windows?.w1d_weight ?? 0.5),
    w3d_weight: clamp01(env.VIRAL_WINDOW_3D_WEIGHT, base?.windows?.w3d_weight ?? 0.3),
    w7d_weight: clamp01(env.VIRAL_WINDOW_7D_WEIGHT, base?.windows?.w7d_weight ?? 0.2),
    slope_weight: clamp01(env.VIRAL_SLOPE_WEIGHT, base?.windows?.slope_weight ?? 0.6),
    acceleration_weight: clamp01(env.VIRAL_ACCELERATION_WEIGHT, base?.windows?.acceleration_weight ?? 0.4),
    consistency_bonus_cap: num(env.VIRAL_CONSISTENCY_BONUS_CAP, base?.windows?.consistency_bonus_cap ?? 12),
  };

  const qualityFilters = {
    min_rating: num(env.VIRAL_FILTER_MIN_RATING, base?.quality_filters?.min_rating ?? 4.1),
    min_reviews: Math.max(0, Math.floor(num(env.VIRAL_FILTER_MIN_REVIEWS, base?.quality_filters?.min_reviews ?? 8))),
    min_stock: Math.max(0, Math.floor(num(env.VIRAL_FILTER_MIN_STOCK, base?.quality_filters?.min_stock ?? 1))),
    min_signal_confidence: Math.max(0, Math.min(1, num(env.VIRAL_FILTER_MIN_SIGNAL_CONFIDENCE, base?.quality_filters?.min_signal_confidence ?? 0.45))),
    blocked_seller_tokens: Array.isArray(base?.quality_filters?.blocked_seller_tokens)
      ? base.quality_filters.blocked_seller_tokens.map((row) => String(row).toLowerCase())
      : ["red"],
    allowed_category_tokens: Array.isArray(base?.quality_filters?.allowed_category_tokens)
      ? base.quality_filters.allowed_category_tokens.map((row) => String(row).toUpperCase())
      : [],
  };

  const thresholds = {
    min_viral_momentum_score: num(env.VIRAL_MIN_MOMENTUM_SCORE, base?.thresholds?.min_viral_momentum_score ?? 38),
    min_opportunity_for_priority: num(env.VIRAL_MIN_OPPORTUNITY_SCORE, base?.thresholds?.min_opportunity_for_priority ?? 45),
    high_viral_alert_score: num(env.VIRAL_HIGH_ALERT_SCORE, base?.thresholds?.high_viral_alert_score ?? 78),
  };

  return {
    score_version: String(env.VIRAL_SCORE_VERSION || base?.score_version || "v1.0.0"),
    dry_run: bool(env.VIRAL_DRY_RUN, false),
    weights,
    windows,
    quality_filters: qualityFilters,
    thresholds,
  };
};
