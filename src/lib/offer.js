const STANDBY_STATUSES = new Set([
  "standby",
  "pending",
  "pending_validacao",
  "pending_validacao_afiliado",
  "pending_validation",
  "pendente_validacao",
]);

const MLB_REGEX = /MLB\d{6,14}/i;

const toBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
};

export const getAllowRedirectWhileStandby = (fallback = false) =>
  toBoolean(import.meta?.env?.VITE_ALLOW_REDIRECT_WHILE_STANDBY, fallback);

const normalizeHttpUrl = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const extractHost = (value) => {
  try {
    return new URL(String(value)).host.toLowerCase();
  } catch {
    return "";
  }
};

const isLikelyBrokenMlCanonicalUrl = (value) => {
  const link = normalizeHttpUrl(value);
  if (!link) return false;
  try {
    const parsed = new URL(link);
    const host = parsed.host.toLowerCase();
    if (host !== "produto.mercadolivre.com.br" && host !== "www.produto.mercadolivre.com.br") {
      return false;
    }
    const pathname = (parsed.pathname || "").replace(/\/+$/, "");
    return /^\/mlb\d{6,14}$/i.test(pathname);
  } catch {
    return false;
  }
};

const normalizeMlItemId = (value) => {
  if (!value) return null;
  const match = String(value).toUpperCase().match(MLB_REGEX);
  return match?.[0] ?? null;
};

const extractMlItemIdFromUrl = (urlValue) => {
  if (!urlValue || typeof urlValue !== "string") return null;
  const raw = urlValue.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return (
      normalizeMlItemId(parsed.searchParams.get("item_id")) ||
      normalizeMlItemId(parsed.searchParams.get("wid")) ||
      normalizeMlItemId(parsed.pathname) ||
      normalizeMlItemId(raw)
    );
  } catch {
    return normalizeMlItemId(raw);
  }
};

const bindSecAffiliateToMlItem = (affiliateUrl, mlItemId) => {
  if (!affiliateUrl || !mlItemId || !isMercadoLivreSecLink(affiliateUrl)) return affiliateUrl;
  try {
    const parsed = new URL(affiliateUrl);
    parsed.searchParams.set("item_id", mlItemId);
    return parsed.toString();
  } catch {
    return affiliateUrl;
  }
};

export const isMercadoLivreSecLink = (value) => {
  const link = normalizeHttpUrl(value);
  if (!link) return false;
  const host = extractHost(link);
  if (!(host === "mercadolivre.com" || host === "www.mercadolivre.com")) return false;
  try {
    const pathname = new URL(link).pathname || "";
    return /^\/sec\/[a-z0-9]+/i.test(pathname);
  } catch {
    return false;
  }
};

export const isAllowedOfferDomain = (url, marketplace) => {
  const normalized = normalizeHttpUrl(url);
  if (!normalized) return false;
  const host = extractHost(normalized);
  if (!host) return false;

  const market = String(marketplace ?? "").toLowerCase();
  if (market.includes("mercado")) {
    return host.includes("mercadolivre") || host.includes("mercadolibre");
  }
  if (market.includes("amazon")) {
    return host === "amzn.to" || host.includes("amazon.");
  }
  return true;
};

export const resolveOfferUrl = (product, options = {}) => {
  const allowStandbyRedirect = options.allowRedirectWhileStandby ??
    getAllowRedirectWhileStandby(false);
  const marketplace = String(product?.marketplace ?? "").toLowerCase();
  const isMercadoLivre = marketplace.includes("mercado");
  const status = String(product?.status ?? "").trim().toLowerCase();
  const isBlocked = String(product?.auto_disabled_reason ?? "").trim().toLowerCase() === "blocked";
  const hasExplicitStatus =
    typeof product?.is_active === "boolean" || status.length > 0;

  const affiliateUrl = normalizeHttpUrl(product?.affiliate_link ?? null);
  const canonicalSourceUrlRaw = normalizeHttpUrl(product?.canonical_offer_url ?? null);
  const sourceUrlRaw = normalizeHttpUrl(product?.source_url ?? null);
  const canonicalSourceUrl =
    canonicalSourceUrlRaw && !isLikelyBrokenMlCanonicalUrl(canonicalSourceUrlRaw)
      ? canonicalSourceUrlRaw
      : null;
  const sourceUrl = canonicalSourceUrl ?? sourceUrlRaw;
  const sourceKind = canonicalSourceUrl ? "canonical_source" : "source";
  const hasSecAffiliate = isMercadoLivreSecLink(affiliateUrl);
  const canonicalMlItemId =
    normalizeMlItemId(product?.ml_item_id) ||
    extractMlItemIdFromUrl(canonicalSourceUrl) ||
    extractMlItemIdFromUrl(sourceUrlRaw);
  const affiliateBoundUrl = bindSecAffiliateToMlItem(affiliateUrl, canonicalMlItemId);

  // Defensive fallback for payloads that omit status/is_active:
  // a valid ML /sec/ link implies a curated, validated offer.
  const inferredActiveFromAffiliate =
    isMercadoLivre && !hasExplicitStatus && hasSecAffiliate;

  const isActive =
    product?.is_active === true || status === "active" || inferredActiveFromAffiliate;
  const isStandby = STANDBY_STATUSES.has(status) || !isActive;

  if (isBlocked) {
    return {
      canRedirect: false,
      url: null,
      resolvedSource: null,
      reason: "blocked_by_policy",
      allowStandbyRedirect,
    };
  }

  if (isMercadoLivre) {
    if (isActive && hasSecAffiliate && isAllowedOfferDomain(affiliateBoundUrl, marketplace)) {
      return {
        canRedirect: true,
        url: affiliateBoundUrl,
        resolvedSource: "affiliate",
        reason: canonicalMlItemId ? "affiliate_bound_to_canonical_item" : "affiliate_validated",
        allowStandbyRedirect,
      };
    }
    if (isStandby && allowStandbyRedirect && sourceUrl && isAllowedOfferDomain(sourceUrl, marketplace)) {
      return {
        canRedirect: true,
        url: sourceUrl,
        resolvedSource: sourceKind,
        reason: "standby_source_allowed",
        allowStandbyRedirect,
      };
    }
    return {
      canRedirect: false,
      url: null,
      resolvedSource: null,
      reason: "awaiting_affiliate_validation",
      allowStandbyRedirect,
    };
  }

  if (affiliateUrl && isAllowedOfferDomain(affiliateUrl, marketplace)) {
    return {
      canRedirect: true,
      url: affiliateUrl,
      resolvedSource: "affiliate",
      reason: isActive ? "affiliate_active" : "affiliate_fallback",
      allowStandbyRedirect,
    };
  }

  if ((isActive || allowStandbyRedirect) && sourceUrl && isAllowedOfferDomain(sourceUrl, marketplace)) {
    return {
      canRedirect: true,
      url: sourceUrl,
      resolvedSource: sourceKind,
      reason: isActive ? "source_active" : "source_standby",
      allowStandbyRedirect,
    };
  }

  return {
    canRedirect: false,
    url: null,
    resolvedSource: null,
    reason: "missing_offer_url",
    allowStandbyRedirect,
  };
};

export const getOfferUnavailableMessage = (resolution, marketplace = "") => {
  const reason = String(resolution?.reason ?? "").toLowerCase();
  const isMercadoLivre = String(marketplace).toLowerCase().includes("mercado");
  if (reason === "blocked_by_policy") {
    return "Oferta indisponivel no momento por bloqueio da API.";
  }
  if (reason === "awaiting_affiliate_validation" && isMercadoLivre) {
    return "Aguardando validacao do link de afiliado.";
  }
  if (reason === "invalid_target_domain") {
    return "URL de destino invalida.";
  }
  if (reason === "missing_ml_item_id") {
    return "Produto aguardando identificacao canonica do anuncio.";
  }
  return isMercadoLivre
    ? "Link de afiliado indisponivel para este produto."
    : "Link de compra indisponivel no momento.";
};

export const buildOutProductPath = (productId, source = "offer_click") => {
  const safeId = encodeURIComponent(String(productId ?? "").trim());
  const safeSource = encodeURIComponent(String(source ?? "offer_click").trim() || "offer_click");
  return `/out/product/${safeId}?src=${safeSource}`;
};
