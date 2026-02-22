const NOT_PERMITTED_PATTERNS = [
  "nao permitido",
  "nao e permitido",
  "not permitted",
  "url nao permitido",
];

const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export const detectAffiliateNotPermittedSignal = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return NOT_PERMITTED_PATTERNS.some((pattern) => normalized.includes(pattern));
};

export const isStandbyLikeState = ({ status, isActive }) => {
  const normalizedStatus = String(status ?? "").toLowerCase();
  if (["standby", "pending", "pending_validacao", "pending_validation"].includes(normalizedStatus)) {
    return true;
  }
  return !Boolean(isActive);
};

export const isMercadoLivreSecLink = (value) => {
  if (!value) return false;
  try {
    const parsed = new URL(String(value));
    const host = parsed.host.toLowerCase();
    return (host === "mercadolivre.com" || host === "www.mercadolivre.com") && parsed.pathname.startsWith("/sec/");
  } catch {
    return false;
  }
};

export const canSoftRemoveStandbyProduct = ({ status, isActive, affiliateLink }) => {
  const hasValidatedAffiliate = Boolean(isActive) && String(status ?? "").toLowerCase() === "active" && isMercadoLivreSecLink(affiliateLink);
  if (hasValidatedAffiliate) return false;
  return isStandbyLikeState({ status, isActive });
};

export const evaluatePriceMismatch = ({
  sitePrice,
  mlPrice,
  warnPct = 25,
  warnAbs = 20,
  criticalPct = 50,
  criticalAbs = 30,
}) => {
  const site = Number(sitePrice);
  const ml = Number(mlPrice);
  if (!Number.isFinite(site) || !Number.isFinite(ml) || site <= 0 || ml <= 0) {
    return {
      hasMismatch: false,
      isCritical: false,
      deltaAbs: 0,
      deltaPct: 0,
    };
  }

  const deltaAbs = Math.abs(site - ml);
  const deltaPct = (deltaAbs / Math.max(site, ml)) * 100;
  const hasMismatch = deltaPct >= warnPct || deltaAbs >= warnAbs;
  const isCritical = deltaPct >= criticalPct || deltaAbs >= criticalAbs;

  return {
    hasMismatch,
    isCritical,
    deltaAbs,
    deltaPct,
  };
};

