const STANDBY_STATUSES = new Set([
  "standby",
  "pending",
  "pending_validacao",
  "pending_validacao_afiliado",
  "pending_validation",
  "pendente_validacao",
]);

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
  const isActive = product?.is_active === true || status === "active";
  const isStandby = STANDBY_STATUSES.has(status) || !isActive;

  const affiliateUrl = normalizeHttpUrl(product?.affiliate_link ?? null);
  const sourceUrl = normalizeHttpUrl(product?.source_url ?? null);

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
    const hasSecAffiliate = isMercadoLivreSecLink(affiliateUrl);
    if (isActive && hasSecAffiliate && isAllowedOfferDomain(affiliateUrl, marketplace)) {
      return {
        canRedirect: true,
        url: affiliateUrl,
        resolvedSource: "affiliate",
        reason: "affiliate_validated",
        allowStandbyRedirect,
      };
    }
    if (isStandby && allowStandbyRedirect && sourceUrl && isAllowedOfferDomain(sourceUrl, marketplace)) {
      return {
        canRedirect: true,
        url: sourceUrl,
        resolvedSource: "source",
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
      resolvedSource: "source",
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
  return isMercadoLivre
    ? "Link de afiliado indisponivel para este produto."
    : "Link de compra indisponivel no momento.";
};

export const buildOutProductPath = (productId, source = "offer_click") => {
  const safeId = encodeURIComponent(String(productId ?? "").trim());
  const safeSource = encodeURIComponent(String(source ?? "offer_click").trim() || "offer_click");
  return `/out/product/${safeId}?src=${safeSource}`;
};
