export const MAX_AFFILIATE_BATCH_SIZE = 30;

export const parseAffiliateLinksInput = (value) =>
  String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

export const buildOrderedBatchAssignments = ({
  orderedProductIds,
  affiliateLinks,
}) => {
  const productIds = Array.isArray(orderedProductIds) ? orderedProductIds : [];
  const links = Array.isArray(affiliateLinks) ? affiliateLinks : [];
  const assignments = [];
  const pendingProductIds = [];

  for (let index = 0; index < productIds.length; index += 1) {
    const productId = productIds[index];
    const link = links[index];
    if (typeof link === "string" && link.trim().length > 0) {
      assignments.push({
        index,
        productId,
        affiliateLink: link.trim(),
      });
    } else {
      pendingProductIds.push(productId);
    }
  }

  const ignoredExtraLinks = links.slice(productIds.length).filter((item) => String(item ?? "").trim().length > 0);

  return {
    assignments,
    pendingProductIds,
    ignoredExtraLinks,
  };
};
