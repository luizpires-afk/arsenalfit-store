export const AFFILIATE_PENDING_STATUSES = new Set([
  "standby",
  "inactive",
  "pending",
  "pending_validacao",
  "pending_validation",
]);

export const AFFILIATE_ERROR_STATUSES = new Set([
  "INVALID_LINK",
  "INVALID_DUPLICATE",
  "INVALID_NOT_PERMITTED",
]);

export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalize = (value) => String(value ?? "").trim();

export const normalizeStatus = (value) => normalize(value).toLowerCase();

export const parseAffiliateLinksInput = (value) =>
  String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

export const isUuid = (value) => UUID_V4_REGEX.test(normalize(value));

export const isMercadoLivreMarketplace = (marketplace) =>
  normalize(marketplace).toLowerCase().startsWith("mercado");

export const isMercadoLivreSecLink = (value) => {
  const link = normalize(value);
  if (!link) return false;
  try {
    const url = new URL(link);
    const host = normalize(url.host).toLowerCase();
    const pathname = normalize(url.pathname).toLowerCase();
    if (host === "meli.la" || host === "www.meli.la") {
      return pathname.length > 1;
    }
    const isMercadoHost =
      host === "mercadolivre.com" ||
      host === "www.mercadolivre.com" ||
      host === "mercadolivre.com.br" ||
      host === "www.mercadolivre.com.br";
    if (!isMercadoHost) return false;
    if (pathname.startsWith("/sec/")) return true;
    if (/^\/social\/pb[a-z0-9]+(?:\/|$)/i.test(pathname)) return true;
    return false;
  } catch {
    return false;
  }
};

export const getUnvalidatedReasonCode = (product) => {
  if (!product || !isMercadoLivreMarketplace(product.marketplace)) return null;
  if (product.removed_at) return null;
  if (normalize(product.auto_disabled_reason).toLowerCase() === "blocked") return "blocked";

  const status = normalizeStatus(product.status);
  const active = Boolean(product.is_active);
  const verified = Boolean(product.affiliate_verified);
  const affiliate = normalize(product.affiliate_link);
  const affiliateValidationStatus = normalize(product.affiliate_validation_status).toUpperCase();
  const affiliateValidationError = normalize(product.affiliate_validation_error);
  const sourceUrl = normalize(product.source_url);
  const mlItemId = normalize(product.ml_item_id);

  if (!sourceUrl && !affiliate) return "missing_source_or_affiliate_url";
  if (!mlItemId) return "missing_ml_item_id";
  if (!affiliate) return "missing_affiliate_link";
  if (!isMercadoLivreSecLink(affiliate)) return "affiliate_not_sec";
  if (!verified) return "affiliate_not_verified";
  if (!active || status !== "active" || AFFILIATE_PENDING_STATUSES.has(status)) return "inactive_or_pending";
  if (AFFILIATE_ERROR_STATUSES.has(affiliateValidationStatus)) {
    return `affiliate_validation_status_${affiliateValidationStatus.toLowerCase()}`;
  }
  if (affiliateValidationError) return "affiliate_validation_error_present";
  return null;
};

export const isUnvalidatedAffiliateProduct = (product) => Boolean(getUnvalidatedReasonCode(product));

export const validateAffiliateLinksForBatch = ({
  links,
  expectedCount,
  strictCount = true,
  allowPartial = false,
  allowExtra = false,
}) => {
  const normalizedLinks = (Array.isArray(links) ? links : []).map((item) => normalize(item)).filter(Boolean);
  const errors = [];
  const warnings = [];

  if (!normalizedLinks.length) {
    errors.push("Nenhum link informado. Forneça links /sec/ (1 por linha).");
  }

  const duplicated = new Map();
  normalizedLinks.forEach((link, index) => {
    if (!isMercadoLivreSecLink(link)) {
      errors.push(`Linha ${index + 1}: link inválido ou fora do padrão Mercado Livre /sec/.`);
    }
    const key = link.toLowerCase();
    if (!duplicated.has(key)) duplicated.set(key, []);
    duplicated.get(key).push(index + 1);
  });

  for (const [linkKey, positions] of duplicated.entries()) {
    if (positions.length > 1) {
      errors.push(`Link duplicado (${linkKey}) nas linhas ${positions.join(", ")}.`);
    }
  }

  if (Number.isFinite(expectedCount) && expectedCount >= 0) {
    if (strictCount && normalizedLinks.length !== expectedCount) {
      errors.push(
        `Quantidade de links (${normalizedLinks.length}) diferente do total do lote (${expectedCount}). Use --allow-partial ou --allow-extra se necessário.`,
      );
    }
    if (!allowPartial && normalizedLinks.length < expectedCount) {
      errors.push(
        `Faltam links para completar o lote: recebidos ${normalizedLinks.length}, esperados ${expectedCount}.`,
      );
    }
    if (!allowExtra && normalizedLinks.length > expectedCount) {
      errors.push(
        `Links excedentes detectados: recebidos ${normalizedLinks.length}, esperados ${expectedCount}.`,
      );
    }
    if (allowPartial && normalizedLinks.length < expectedCount) {
      warnings.push(`Modo parcial ativo: ${expectedCount - normalizedLinks.length} posição(ões) permanecerão pendentes.`);
    }
    if (allowExtra && normalizedLinks.length > expectedCount) {
      warnings.push(`Modo extra ativo: ${normalizedLinks.length - expectedCount} link(s) excedente(s) serão ignorados.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalizedLinks,
  };
};
