import { resolvePricePresentation, resolvePromotionMetrics } from "./pricing.js";

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
  minDiscountPercent = 20,
  limit = 16,
}) => {
  const ranked = (products || [])
    .filter(isActiveProduct)
    .map((product) => {
      const promo = resolvePromotionMetrics(product);
      return {
        product,
        discountPercent: Number(promo.discountPercent || 0),
        refMs: getProductRefMs(product),
      };
    })
    .filter((item) => item.discountPercent >= minDiscountPercent)
    .sort((a, b) => {
      if (b.discountPercent !== a.discountPercent) return b.discountPercent - a.discountPercent;
      return b.refMs - a.refMs;
    });

  return diversifyByCategory(ranked, (item) => item.product, limit).map((item) => item.product);
};

export const selectPriceDropsToday = ({
  products,
  bestDealIds = new Set(),
  minDiscountExclusive = 20,
  timeZone = DEFAULT_TZ,
  now = new Date(),
  limit = 16,
}) => {
  const todayKey = getDayKey(now, timeZone);
  if (!todayKey) return [];

  const ranked = (products || [])
    .filter(isActiveProduct)
    .filter((product) => !bestDealIds.has(product.id))
    .map((product) => {
      const promo = resolvePromotionMetrics(product);
      const refMs = getProductRefMs(product);
      const refDate = refMs > 0 ? new Date(refMs) : null;
      const dayKey = refDate ? getDayKey(refDate, timeZone) : null;
      return {
        product,
        refMs,
        dropValue: Number(promo.discountValue || 0),
        discountPercent: Number(promo.discountPercent || 0),
        hasDrop: promo.anchor !== null && promo.anchor > promo.price,
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
