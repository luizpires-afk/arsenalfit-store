import { resolveOfferUrl } from "./offer.js";
import { extractMlItemIdFromUrl, resolveCanonicalMlItemId } from "./offerAudit.js";

const isMercadoLivre = (marketplace) =>
  String(marketplace ?? "").toLowerCase().includes("mercado");

const hasValidatedMercadoAffiliate = (urlValue) => {
  const value = String(urlValue ?? "").trim().toLowerCase();
  if (!value) return false;
  return (
    value.startsWith("https://mercadolivre.com/sec/") ||
    value.startsWith("https://www.mercadolivre.com/sec/") ||
    value.startsWith("https://meli.la/") ||
    value.startsWith("https://www.meli.la/")
  );
};

export const evaluateActiveOfferIntegrity = (
  product,
  { allowRedirectWhileStandby = false } = {},
) => {
  const resolution = resolveOfferUrl(product, { allowRedirectWhileStandby });
  const canonicalMlItemId = resolveCanonicalMlItemId(product);
  const destinationUrl = resolution?.url ?? null;
  const destinationMlItemId = extractMlItemIdFromUrl(destinationUrl);
  const canRedirect = Boolean(resolution?.canRedirect && destinationUrl);
  const active = product?.is_active === true || String(product?.status ?? "").toLowerCase() === "active";
  const requiresValidatedAffiliate = isMercadoLivre(product?.marketplace) && active;

  if (requiresValidatedAffiliate && !hasValidatedMercadoAffiliate(product?.affiliate_link)) {
    return {
      ok: false,
      action: "MOVE_TO_STANDBY",
      reason: "BROKEN_OFFER_URL",
      detail: "missing_validated_affiliate_link",
      canonicalMlItemId,
      destinationMlItemId,
      destinationUrl,
    };
  }

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
