import { fetchMlJson, normalizeMlItemId } from "../_affiliate_catalog_common.js";

export const DISCOVERY_TERMS = [
  "whey protein",
  "creatina",
  "pre treino",
  "academia",
  "musculacao",
  "equipamentos fitness",
  "suplementos",
];

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const pctDiscount = (currentPrice, originalPrice) => {
  const current = toNum(currentPrice, 0);
  const original = toNum(originalPrice, 0);
  if (!(original > 0 && current > 0 && original > current)) return 0;
  return Number((((original - current) / original) * 100).toFixed(2));
};

const normalizeResult = (row, term) => {
  const externalId = normalizeMlItemId(row?.id || row?.item_id || row?.permalink);
  if (!externalId) return null;

  const currentPrice = toNum(row?.price, 0);
  const originalPrice = toNum(row?.original_price, 0) || currentPrice;
  const reviewsCount = toNum(row?.reviews?.total || row?.seller?.transactions?.completed, 0);
  const rating = toNum(row?.reviews?.rating_average || row?.seller?.seller_reputation?.level_id?.replace("_", "."), 0);

  return {
    marketplace: "mercadolivre",
    external_product_id: externalId,
    title: String(row?.title || externalId),
    category: row?.category_id || null,
    seller: String(row?.seller?.nickname || row?.seller?.id || ""),
    seller_reputation: String(row?.seller?.seller_reputation?.level_id || ""),
    affiliate_link: String(row?.permalink || ""),
    product_url: String(row?.permalink || ""),
    current_price: Number(currentPrice.toFixed(2)),
    original_price: Number(originalPrice.toFixed(2)),
    discount_percent: pctDiscount(currentPrice, originalPrice),
    sold_quantity: toNum(row?.sold_quantity, 0),
    reviews_count: reviewsCount,
    rating: Number((rating || 0).toFixed(2)),
    stock: toNum(row?.available_quantity, 0),
    favorites_count: toNum(row?.accepts_mercadopago ? 1 : 0, 0),
    source_terms: [term],
    matched_terms_count: 1,
    last_collected_at: new Date().toISOString(),
    raw_payload: row || {},
  };
};

export async function mlCollectorService({ terms = DISCOVERY_TERMS, token = null, perTermLimit = 25 }) {
  const byExternalId = new Map();
  const errors = [];

  for (const term of terms) {
    try {
      const searchPath = `/sites/MLB/search?q=${encodeURIComponent(term)}&limit=${Math.max(5, Math.min(perTermLimit, 50))}`;
      let payload = null;

      try {
        payload = await fetchMlJson(searchPath, token, 12000);
      } catch (error) {
        const message = String(error?.message || error || "");
        const unauthorized = message.includes("ml_api_401") || message.toLowerCase().includes("unauthorized");
        if (!(unauthorized && token)) throw error;
        // Fallback for stale/invalid token: public search endpoints can still respond without auth.
        payload = await fetchMlJson(searchPath, null, 12000);
      }

      const rows = Array.isArray(payload?.results) ? payload.results : [];
      for (const row of rows) {
        const normalized = normalizeResult(row, term);
        if (!normalized) continue;
        const existing = byExternalId.get(normalized.external_product_id);
        if (!existing) {
          byExternalId.set(normalized.external_product_id, normalized);
          continue;
        }
        const mergedTerms = [...new Set([...(existing.source_terms || []), term])];
        byExternalId.set(normalized.external_product_id, {
          ...existing,
          ...normalized,
          source_terms: mergedTerms,
          matched_terms_count: mergedTerms.length,
        });
      }
    } catch (error) {
      errors.push({ term, error: String(error?.message || error) });
    }
  }

  return {
    collected_at: new Date().toISOString(),
    products: Array.from(byExternalId.values()),
    errors,
  };
}
