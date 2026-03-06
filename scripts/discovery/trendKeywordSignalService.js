const normalizeKeyword = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const uniq = (rows) => Array.from(new Set((rows || []).map((row) => normalizeKeyword(row)).filter(Boolean)));

const toN = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const buildTrendKeywordSignals = ({ product, roundId, nowIso = new Date().toISOString() }) => {
  const sourceTerms = Array.isArray(product?.source_terms) ? product.source_terms : [];
  const normalized = uniq(sourceTerms);
  const marketplace = String(product?.marketplace || "mercadolivre").toLowerCase();

  return normalized.map((keyword, idx) => {
    const intensity = Math.min(100, Math.max(0, toN(product?.matched_terms_count, 0) * 9 + (idx === 0 ? 14 : 8)));
    const growth1d = Math.min(500, Math.max(-100, intensity * 0.7));
    const growth3d = Math.min(500, Math.max(-100, intensity * 0.5));
    const growth7d = Math.min(500, Math.max(-100, intensity * 0.35));
    const growth30d = Math.min(500, Math.max(-100, intensity * 0.2));

    return {
      keyword,
      normalized_keyword: keyword,
      source: "internal",
      marketplace,
      category: product?.category || null,
      trend_score: Number(intensity.toFixed(3)),
      growth_1d: Number(growth1d.toFixed(3)),
      growth_3d: Number(growth3d.toFixed(3)),
      growth_7d: Number(growth7d.toFixed(3)),
      growth_30d: Number(growth30d.toFixed(3)),
      serp_signal_score: Number(Math.min(100, intensity * 0.45).toFixed(3)),
      emerging: growth1d >= 35,
      observed_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
      _round_id: roundId,
      _external_product_id: String(product?.external_product_id || ""),
    };
  });
};
