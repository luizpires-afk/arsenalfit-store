import { resolvePricePresentation, resolvePromotionMetrics } from "./pricing.js";
import { ROOT_COMMERCE_RULES } from "./rootCommerceRules.js";

const DEFAULT_TZ = "America/Sao_Paulo";

const toMs = (value) => {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const getProductRefMs = (product) =>
  toMs(product?.detected_at || product?.last_sync || product?.updated_at || product?.created_at || null);

const getDayKey = (value, timeZone = DEFAULT_TZ) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const isActiveProduct = (product) => product?.is_active !== false;
const isVerifiedProduct = (product) => product?.affiliate_verified !== false;

const getProductScore = (product) => {
  const direct = Number(product?.product_score ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const relation = Array.isArray(product?.product_scores)
    ? product.product_scores[0]
    : product?.product_scores || null;
  const related = Number(relation?.product_score ?? relation?.score_custo_beneficio ?? 0);
  return Number.isFinite(related) ? related : 0;
};

const diversifyByCategory = (items, pickProduct, limit) => {
  const usedCategories = new Set();
  const primary = [];
  const overflow = [];

  for (const item of items) {
    const product = pickProduct(item);
    const categoryId = product?.category_id || "sem-categoria";
    if (!usedCategories.has(categoryId)) {
      usedCategories.add(categoryId);
      primary.push(item);
    } else {
      overflow.push(item);
    }
  }

  return [...primary, ...overflow].slice(0, limit);
};

export const selectBestDeals = ({
  products,
  minDiscountPercent = ROOT_COMMERCE_RULES.bestDeals.minDiscountPercent,
  limit = ROOT_COMMERCE_RULES.bestDeals.limit,
}) => {
  const ranked = (products || [])
    .filter(isActiveProduct)
    .filter(isVerifiedProduct)
    .map((product) => {
      const promo = resolvePromotionMetrics(product);
      const discountPercent = Number(
        product?.discount_percentage ?? promo.discountPercent ?? 0,
      );
      return {
        product,
        discountPercent,
        productScore: getProductScore(product),
        refMs: getProductRefMs(product),
      };
    })
    .filter((item) => item.discountPercent >= minDiscountPercent)
    .sort((a, b) => {
      if (b.discountPercent !== a.discountPercent) return b.discountPercent - a.discountPercent;
      if (b.productScore !== a.productScore) return b.productScore - a.productScore;
      return b.refMs - a.refMs;
    });

  return diversifyByCategory(ranked, (item) => item.product, limit).map((item) => item.product);
};

export const selectPriceDropsToday = ({
  products,
  bestDealIds = new Set(),
  minDiscountExclusive = ROOT_COMMERCE_RULES.priceDropsToday.maxDiscountExclusivePercent,
  timeZone = ROOT_COMMERCE_RULES.priceDropsToday.timeZone || DEFAULT_TZ,
  now = new Date(),
  limit = ROOT_COMMERCE_RULES.priceDropsToday.limit,
}) => {
  const todayKey = getDayKey(now, timeZone);
  if (!todayKey) return [];

  const ranked = (products || [])
    .filter(isActiveProduct)
    .filter(isVerifiedProduct)
    .filter((product) => !bestDealIds.has(product.id))
    .map((product) => {
      const promo = resolvePromotionMetrics(product);
      const refMs = getProductRefMs(product);
      const refDate = refMs > 0 ? new Date(refMs) : null;
      const dayKey = refDate ? getDayKey(refDate, timeZone) : null;
      const price = Number(product?.price ?? 0);
      const originalPrice = Number(product?.original_price ?? 0);
      const computedDiscountPercent =
        Number.isFinite(price) &&
        Number.isFinite(originalPrice) &&
        originalPrice > 0 &&
        originalPrice > price
          ? Math.round(((originalPrice - price) / originalPrice) * 100)
          : null;
      return {
        product,
        refMs,
        dropValue: Number(promo.discountValue || 0),
        // For intraday drops, prioritize computed discount from current anchor/price.
        // Declared discount can be stale and incorrectly exclude valid drops.
        discountPercent: Number(
          computedDiscountPercent ?? promo.discountPercent ?? product?.discount_percentage ?? 0,
        ),
        hasDrop:
          product?.price_drop_last_24h === true ||
          (Number.isFinite(originalPrice) && Number.isFinite(price) && originalPrice > price) ||
          (promo.anchor !== null && promo.anchor > promo.price),
        dayKey,
      };
    })
    .filter(
      (item) =>
        item.hasDrop &&
        item.discountPercent > 0 &&
        item.discountPercent < minDiscountExclusive &&
        item.dayKey === todayKey,
    )
    .sort((a, b) => {
      if (b.discountPercent !== a.discountPercent) return b.discountPercent - a.discountPercent;
      if (b.refMs !== a.refMs) return b.refMs - a.refMs;
      return b.dropValue - a.dropValue;
    });

  return diversifyByCategory(ranked, (item) => item.product, limit).map((item) => item.product);
};

export const selectEliteProducts = ({ products, limit = 16 }) => {
  const ranked = (products || [])
    .filter(isActiveProduct)
    .map((product) => {
      const pricing = resolvePricePresentation(product);
      const price = Number(pricing.displayPricePrimary || product?.price || 0);
      const qualityScore = Number(product?.quality_score || 0);
      const featured = product?.is_featured === true ? 1 : 0;
      const hasEliteBadge = Array.isArray(product?.curation_badges)
        ? product.curation_badges.includes("ELITE")
        : false;
      return {
        product,
        price,
        featured,
        qualityScore,
        hasEliteBadge: hasEliteBadge ? 1 : 0,
        refMs: getProductRefMs(product),
      };
    })
    .filter((item) => item.price > 0)
    .sort((a, b) => {
      if (b.featured !== a.featured) return b.featured - a.featured;
      if (b.hasEliteBadge !== a.hasEliteBadge) return b.hasEliteBadge - a.hasEliteBadge;
      if (b.price !== a.price) return b.price - a.price;
      if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
      return b.refMs - a.refMs;
    });

  return diversifyByCategory(ranked, (item) => item.product, limit).map((item) => item.product);
};

export const selectLatestDiversifiedProducts = ({ products, limit = 12 }) => {
  const ranked = (products || [])
    .filter(isActiveProduct)
    .map((product) => ({ product, refMs: getProductRefMs(product) }))
    .sort((a, b) => b.refMs - a.refMs);

  return diversifyByCategory(ranked, (item) => item.product, limit).map((item) => item.product);
};
