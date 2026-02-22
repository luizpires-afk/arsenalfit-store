import { hasMeaningfulPixDiscount } from "./pricing.js";

const MLB_REGEX = /MLB\d{6,14}/i;

const toFiniteNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

export const normalizeMlItemId = (value) => {
  if (!value) return null;
  const match = String(value).toUpperCase().match(MLB_REGEX);
  return match?.[0] ?? null;
};

export const extractMlItemIdFromUrl = (urlValue) => {
  if (!urlValue || typeof urlValue !== "string") return null;
  const raw = urlValue.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const wid = normalizeMlItemId(url.searchParams.get("wid"));
    if (wid) return wid;

    const itemId = normalizeMlItemId(url.searchParams.get("item_id"));
    if (itemId) return itemId;

    const pdpFilters = url.searchParams.get("pdp_filters");
    if (pdpFilters) {
      const decoded = decodeURIComponent(String(pdpFilters));
      const pdpItemId = decoded.match(/(?:^|[,;])\s*item_id[:=]\s*(MLB\d{6,14})/i)?.[1] ?? null;
      const normalizedPdpItem = normalizeMlItemId(pdpItemId);
      if (normalizedPdpItem) return normalizedPdpItem;
    }

    const fromPath = normalizeMlItemId(url.pathname);
    if (fromPath) return fromPath;

    for (const key of ["item_id", "item", "wid", "id"]) {
      const param = url.searchParams.get(key);
      const fromParam = normalizeMlItemId(param);
      if (fromParam) return fromParam;
    }
  } catch {
    const wid = raw.match(/[?&#]wid=(MLB\d{6,14})/i)?.[1] ?? null;
    const normalizedWid = normalizeMlItemId(wid);
    if (normalizedWid) return normalizedWid;

    const itemId = raw.match(/[?&#]item_id=(MLB\d{6,14})/i)?.[1] ?? null;
    const normalizedItemId = normalizeMlItemId(itemId);
    if (normalizedItemId) return normalizedItemId;

    const pdpRaw = raw.match(/pdp_filters=([^&#]+)/i)?.[1] ?? null;
    if (pdpRaw) {
      const decoded = decodeURIComponent(String(pdpRaw));
      const pdpItemId = decoded.match(/(?:^|[,;])\s*item_id[:=]\s*(MLB\d{6,14})/i)?.[1] ?? null;
      const normalizedPdpItem = normalizeMlItemId(pdpItemId);
      if (normalizedPdpItem) return normalizedPdpItem;
    }
    return normalizeMlItemId(raw);
  }

  return normalizeMlItemId(raw);
};

export const resolveCanonicalMlItemId = (product) => {
  if (!product || typeof product !== "object") return null;
  return (
    normalizeMlItemId(product.ml_item_id) ||
    extractMlItemIdFromUrl(product.canonical_offer_url) ||
    extractMlItemIdFromUrl(product.source_url) ||
    extractMlItemIdFromUrl(product.affiliate_link) ||
    normalizeMlItemId(product.external_id)
  );
};

export const resolveSiteFinalPrice = (product) => {
  const price = toFiniteNumber(product?.price);
  const pix = toFiniteNumber(product?.pix_price);
  if (price !== null && pix !== null && hasMeaningfulPixDiscount(price, pix)) {
    return pix;
  }
  return price;
};

export const computePriceDelta = (sitePrice, mlPrice) => {
  const site = toFiniteNumber(sitePrice);
  const ml = toFiniteNumber(mlPrice);
  if (!(site !== null && ml !== null && site > 0 && ml > 0)) {
    return {
      valid: false,
      deltaAbs: null,
      deltaPct: null,
    };
  }

  const deltaAbs = Math.abs(site - ml);
  const deltaPct = (deltaAbs / Math.max(site, ml)) * 100;
  return {
    valid: true,
    deltaAbs,
    deltaPct,
  };
};

export const classifyPriceDelta = (
  delta,
  {
    warnPct = 25,
    warnAbs = 20,
    criticalPct = 50,
    criticalAbs = 30,
  } = {},
) => {
  if (!delta?.valid) {
    return {
      mismatch: false,
      critical: false,
    };
  }

  const mismatch =
    (delta.deltaPct ?? 0) >= warnPct || (delta.deltaAbs ?? 0) >= warnAbs;
  const critical =
    (delta.deltaPct ?? 0) >= criticalPct ||
    (delta.deltaAbs ?? 0) >= criticalAbs;

  return { mismatch, critical };
};

