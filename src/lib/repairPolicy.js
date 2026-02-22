import { resolveOfferUrl } from "./offer.js";
import { extractMlItemIdFromUrl, resolveCanonicalMlItemId } from "./offerAudit.js";

export const evaluateActiveOfferIntegrity = (
  product,
  { allowRedirectWhileStandby = false } = {},
) => {
  const resolution = resolveOfferUrl(product, { allowRedirectWhileStandby });
  const canonicalMlItemId = resolveCanonicalMlItemId(product);
  const destinationUrl = resolution?.url ?? null;
  const destinationMlItemId = extractMlItemIdFromUrl(destinationUrl);
  const canRedirect = Boolean(resolution?.canRedirect && destinationUrl);

  if (!canRedirect) {
    return {
      ok: false,
      action: "MOVE_TO_STANDBY",
      reason: "BROKEN_OFFER_URL",
      detail: resolution?.reason ?? "missing_offer_url",
      canonicalMlItemId,
      destinationMlItemId,
      destinationUrl,
    };
  }

  if (!canonicalMlItemId) {
    return {
      ok: false,
      action: "MOVE_TO_STANDBY",
      reason: "BROKEN_OFFER_URL",
      detail: "missing_canonical_ml_item",
      canonicalMlItemId,
      destinationMlItemId,
      destinationUrl,
    };
  }

  if (destinationMlItemId && destinationMlItemId !== canonicalMlItemId) {
    return {
      ok: false,
      action: "MOVE_TO_STANDBY",
      reason: "BROKEN_OFFER_URL",
      detail: "destination_ml_mismatch",
      canonicalMlItemId,
      destinationMlItemId,
      destinationUrl,
    };
  }

  return {
    ok: true,
    action: "KEEP_ACTIVE",
    reason: "HEALTHY",
    detail: resolution?.reason ?? "ok",
    canonicalMlItemId,
    destinationMlItemId: destinationMlItemId ?? canonicalMlItemId,
    destinationUrl,
  };
};
