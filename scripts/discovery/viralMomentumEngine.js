const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

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

const safeArr = (rows) => (Array.isArray(rows) ? rows : []);

const growthWindow = (historySeries, field, size) => {
  const rows = safeArr(historySeries)
    .slice()
    .sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());

  if (rows.length < Math.max(2, size + 1)) return 0;

  const current = rows[rows.length - 1];
  const previous = rows[Math.max(0, rows.length - 1 - size)];
  return pct(current?.[field], previous?.[field]);
};

const slopeFromWindows = ({ w1d, w3d, w7d }) => {
  return ((toN(w1d, 0) * 1.6) + (toN(w3d, 0) * 1.1) + (toN(w7d, 0) * 0.7)) / 3.4;
};

const accelerationFromWindows = ({ w1d, w3d, w7d }) => {
  const firstOrder = toN(w1d, 0) - toN(w3d, 0);
  const secondOrder = (toN(w1d, 0) - toN(w3d, 0)) - (toN(w3d, 0) - toN(w7d, 0));
  return (firstOrder * 0.6) + (secondOrder * 0.4);
};

const consistencyScore = ({ w1d, w3d, w7d }, cap) => {
  const values = [toN(w1d, 0), toN(w3d, 0), toN(w7d, 0)];
  const positives = values.filter((v) => v > 0).length;
  const negatives = values.filter((v) => v < 0).length;
  const volatility = Math.max(...values) - Math.min(...values);

  const base = positives >= 2 && negatives === 0 ? cap : positives >= 2 ? cap * 0.55 : cap * 0.25;
  const volatilityPenalty = clamp(volatility * 0.08, 0, cap * 0.6);
  return clamp(base - volatilityPenalty, 0, cap);
};

const normPct = (value, capPct = 300) => {
  const v = clamp(toN(value, 0), -100, capPct);
  if (v <= 0) return 0;
  return (v / capPct) * 100;
};

const reliabilityPenaltyFromSignals = (signals) => {
  const rating = toN(signals?.quality?.rating_quality, 0);
  const stock = toN(signals?.quality?.stock_health, 0);
  const confidence = toN(signals?.confidence?.signal_confidence, 0);
  const sellerRep = String(signals?.quality?.seller_reputation || "").toLowerCase();

  let penalty = 0;
  if (rating < 4.2) penalty += (4.2 - rating) * 8;
  if (stock <= 0) penalty += 14;
  if (confidence < 0.5) penalty += (0.5 - confidence) * 50;
  if (sellerRep.includes("red")) penalty += 18;

  return clamp(penalty, 0, 100);
};

const weighted = (weights, values) => {
  const keys = Object.keys(weights || {});
  if (!keys.length) return 0;
  const totalWeight = keys.reduce((acc, key) => acc + toN(weights[key], 0), 0);
  if (totalWeight <= 0) return 0;
  const result = keys.reduce((acc, key) => acc + (toN(values[key], 0) * toN(weights[key], 0)), 0);
  return result / totalWeight;
};

const summarizeReasons = (parts) => {
  const sorted = Object.entries(parts || {})
    .sort((a, b) => toN(b[1], 0) - toN(a[1], 0))
    .slice(0, 3)
    .map(([key, value]) => `${key}:${Number(toN(value, 0).toFixed(1))}`);
  return sorted.join(" | ");
};

export const computeViralMomentumScore = ({
  signals,
  historySeries = [],
  config,
}) => {
  const windowsCfg = config?.windows || {};

  const salesWindow = {
    w1d: growthWindow(historySeries, "sales_count", 1) || toN(signals?.market?.sales_growth, 0),
    w3d: growthWindow(historySeries, "sales_count", 3) || toN(signals?.market?.sales_growth, 0) * 0.72,
    w7d: growthWindow(historySeries, "sales_count", 7) || toN(signals?.market?.sales_growth, 0) * 0.45,
  };

  const reviewWindow = {
    w1d: growthWindow(historySeries, "reviews_count", 1) || toN(signals?.market?.review_growth, 0),
    w3d: growthWindow(historySeries, "reviews_count", 3) || toN(signals?.market?.review_growth, 0) * 0.7,
    w7d: growthWindow(historySeries, "reviews_count", 7) || toN(signals?.market?.review_growth, 0) * 0.45,
  };

  const searchWindow = {
    w1d: toN(signals?.search?.google_trends_growth, 0),
    w3d: toN(signals?.search?.related_queries_growth, 0),
    w7d: toN(signals?.search?.serp_signal_score, 0),
  };

  const socialWindow = {
    w1d: toN(signals?.social?.social_mentions_velocity, 0),
    w3d: toN(signals?.social?.hashtag_acceleration, 0),
    w7d: toN(signals?.social?.engagement_velocity, 0),
  };

  const mkMomentum = (window) => {
    const weightedWindowGrowth = (
      toN(window.w1d, 0) * toN(windowsCfg.w1d_weight, 0.5)
      + toN(window.w3d, 0) * toN(windowsCfg.w3d_weight, 0.3)
      + toN(window.w7d, 0) * toN(windowsCfg.w7d_weight, 0.2)
    );

    const slope = slopeFromWindows(window);
    const acceleration = accelerationFromWindows(window);
    const consistency = consistencyScore(window, toN(windowsCfg.consistency_bonus_cap, 12));

    const momentum = (
      weightedWindowGrowth
      + (slope * toN(windowsCfg.slope_weight, 0.6))
      + (acceleration * toN(windowsCfg.acceleration_weight, 0.4))
      + consistency
    );

    return {
      weighted_window_growth: Number(weightedWindowGrowth.toFixed(3)),
      slope: Number(slope.toFixed(3)),
      acceleration: Number(acceleration.toFixed(3)),
      consistency: Number(consistency.toFixed(3)),
      momentum: Number(momentum.toFixed(3)),
    };
  };

  const salesMomentum = mkMomentum(salesWindow);
  const reviewMomentum = mkMomentum(reviewWindow);
  const searchMomentum = mkMomentum(searchWindow);
  const socialMomentum = mkMomentum(socialWindow);

  const engagementGrowth = clamp((normPct(reviewMomentum.momentum, 240) * 0.55) + (normPct(socialMomentum.momentum, 240) * 0.45), 0, 100);
  const salesGrowth = clamp(normPct(salesMomentum.momentum, 320), 0, 100);
  const searchGrowth = clamp(normPct(searchMomentum.momentum, 220), 0, 100);
  const socialMentions = clamp(normPct(socialMomentum.momentum, 260), 0, 100);
  const ratingQuality = clamp((toN(signals?.quality?.rating_quality, 0) / 5) * 100, 0, 100);
  const reliabilityPenalty = reliabilityPenaltyFromSignals(signals);

  const weightedBase = weighted(config?.weights || {}, {
    engagement_growth: engagementGrowth,
    sales_growth: salesGrowth,
    search_growth: searchGrowth,
    social_mentions: socialMentions,
    rating_quality: ratingQuality,
    reliability_penalty: Math.max(0, 100 - reliabilityPenalty),
  });

  const score = clamp(weightedBase - (reliabilityPenalty * toN(config?.weights?.reliability_penalty, 0.08)), 0, 100);

  const scoreComponents = {
    engagement_growth: Number(engagementGrowth.toFixed(3)),
    sales_growth: Number(salesGrowth.toFixed(3)),
    search_growth: Number(searchGrowth.toFixed(3)),
    social_mentions: Number(socialMentions.toFixed(3)),
    rating_quality: Number(ratingQuality.toFixed(3)),
    reliability_penalty: Number(reliabilityPenalty.toFixed(3)),
    windows: {
      sales: { ...salesWindow, ...salesMomentum },
      reviews: { ...reviewWindow, ...reviewMomentum },
      search: { ...searchWindow, ...searchMomentum },
      social: { ...socialWindow, ...socialMomentum },
    },
  };

  const topSignals = {
    sales_acceleration: salesMomentum.acceleration,
    review_acceleration: reviewMomentum.acceleration,
    search_slope: searchMomentum.slope,
    social_velocity: socialMomentum.momentum,
    confidence: toN(signals?.confidence?.signal_confidence, 0) * 100,
  };

  return {
    score: Number(score.toFixed(3)),
    reliability_penalty: Number(reliabilityPenalty.toFixed(3)),
    score_components: scoreComponents,
    decision_reason: summarizeReasons(topSignals),
    top_signals: topSignals,
    windows: scoreComponents.windows,
  };
};
