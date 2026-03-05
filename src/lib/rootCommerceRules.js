export const ROOT_COMMERCE_RULES = {
  bestDeals: {
    minDiscountPercent: 20,
    limit: 16,
    poolLimit: 600,
    maxVerifyAgeHours: 12,
    fallbackMaxAgeHours: 24,
    timeZone: "America/Sao_Paulo",
  },
  priceDropsToday: {
    minDiscountPercent: 1,
    maxDiscountExclusivePercent: 20,
    limit: 16,
    timeZone: "America/Sao_Paulo",
  },
  redirect: {
    allowSourceFallbackForActiveEvenWithoutMlItem: true,
    allowStandbyRedirectWhileValidation: false,
    requireAllowedMarketplaceDomain: true,
  },
  pricingCards: {
    showOriginalPriceWhenHigherThanCurrent: true,
    showDiscountBadgeWhenDiscountPercentGte: 1,
    showDropBadgeWhenDropDetectedWithinHours: 24,
    requirePriceIntegrityValidation: true,
  },
};
