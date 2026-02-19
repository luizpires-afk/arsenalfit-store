const MIN_PIX_DIFF_ABS = 0.5;
const MIN_PIX_DIFF_RATIO = 0.005;
const MAX_LIST_PRICE_RATIO = 4.0;

const toFiniteNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeWithSingleSeparator = (input, separator) => {
  const parts = input.split(separator);
  if (parts.length <= 1) return input;
  const decimal = parts[parts.length - 1] ?? "";
  const integer = parts.slice(0, -1).join("");
  if (decimal.length > 0 && decimal.length <= 2) {
    return `${integer}.${decimal}`;
  }
  return parts.join("");
};

export const parseBRLCurrency = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  let raw = value.replace(/[^0-9,\.\s]/g, "").trim();
  if (!raw) return null;

  if (!/[,.]/.test(raw) && /^\d+(?:\s\d{3})*\s\d{2}$/.test(raw)) {
    raw = raw.replace(/\s(\d{2})$/, ",$1");
  }

  let cleaned = raw.replace(/\s+/g, "");
  if (!cleaned) return null;

  const commaCount = (cleaned.match(/,/g) ?? []).length;
  const dotCount = (cleaned.match(/\./g) ?? []).length;

  if (commaCount > 0 && dotCount > 0) {
    const decimalSeparator = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".") ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    cleaned = cleaned.replace(new RegExp(`\\${thousandsSeparator}`, "g"), "");
    if (decimalSeparator === ",") {
      cleaned = cleaned.replace(",", ".");
    }
  } else if (commaCount > 0) {
    cleaned = normalizeWithSingleSeparator(cleaned, ",");
  } else if (dotCount > 0) {
    cleaned = normalizeWithSingleSeparator(cleaned, ".");
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

export const hasMeaningfulPixDiscount = (price, pix) => {
  if (!(Number.isFinite(price) && Number.isFinite(pix))) return false;
  if (!(price > 0 && pix > 0 && pix < price)) return false;
  const diff = price - pix;
  const ratio = diff / price;
  return diff >= MIN_PIX_DIFF_ABS || ratio >= MIN_PIX_DIFF_RATIO;
};

const isTrustedPixSource = (source) => {
  if (!source) return true;
  const normalized = String(source).trim().toLowerCase();
  return normalized === "api" || normalized === "manual";
};

export const resolveFinalPriceInfo = (product) => {
  const basePrice = toFiniteNumber(product?.price);
  const originalPrice = toFiniteNumber(product?.original_price);
  const pixRaw = toFiniteNumber(product?.pix_price);
  const pixSource = product?.pix_price_source ?? null;

  const pixPrice =
    basePrice !== null &&
    pixRaw !== null &&
    isTrustedPixSource(pixSource) &&
    hasMeaningfulPixDiscount(basePrice, pixRaw)
      ? pixRaw
      : null;

  const finalPrice = pixPrice ?? basePrice ?? 0;
  const listPrice =
    originalPrice !== null &&
    originalPrice > finalPrice &&
    originalPrice <= finalPrice * MAX_LIST_PRICE_RATIO
      ? originalPrice
      : null;

  const savings = listPrice !== null && listPrice > finalPrice ? listPrice - finalPrice : null;
  const discountPercent =
    savings !== null && listPrice !== null && listPrice > 0
      ? Math.round((savings / listPrice) * 100)
      : null;

  return {
    basePrice,
    originalPrice,
    pixPrice,
    finalPrice,
    listPrice,
    savings,
    discountPercent,
    usedPix: pixPrice !== null,
    finalPriceSource: pixPrice !== null ? "pix" : "standard",
  };
};
