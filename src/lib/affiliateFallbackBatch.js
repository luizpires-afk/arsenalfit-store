const normalize = (value) => String(value ?? "").trim();

export const normalizeMlItemId = (value) => {
  const match = normalize(value).toUpperCase().match(/MLB\d{6,14}/i);
  return match ? match[0].toUpperCase() : "";
};

export const isMercadoCatalogProductUrl = (value) => {
  const link = normalize(value);
  if (!link) return false;
  try {
    const parsed = new URL(link);
    const host = normalize(parsed.host).toLowerCase();
    if (!host.includes("mercadolivre")) return false;
    return /^\/p\/MLB\d{6,14}/i.test(parsed.pathname || "");
  } catch {
    return false;
  }
};

export const buildMercadoItemUrl = (mlItemId) => {
  const normalized = normalizeMlItemId(mlItemId);
  if (!normalized) return "";
  const numeric = normalized.replace(/^MLB/i, "");
  return `https://produto.mercadolivre.com.br/MLB-${numeric}-_JM`;
};

export const resolveAffiliateBatchSourceUrl = (row) => {
  const sourceUrl = normalize(row?.source_url);
  const canonicalOfferUrl = normalize(row?.canonical_offer_url);
  const mlItemId = normalizeMlItemId(row?.ml_item_id || row?.external_id || sourceUrl || canonicalOfferUrl);

  if (mlItemId) {
    return buildMercadoItemUrl(mlItemId);
  }

  if (canonicalOfferUrl && /^https?:\/\//i.test(canonicalOfferUrl) && !isMercadoCatalogProductUrl(canonicalOfferUrl)) {
    return canonicalOfferUrl;
  }

  if (sourceUrl && /^https?:\/\//i.test(sourceUrl) && !isMercadoCatalogProductUrl(sourceUrl)) {
    return sourceUrl;
  }

  return sourceUrl || canonicalOfferUrl || "";
};

export const normalizeCategoryFilter = (value) => normalize(value).toLowerCase();

export const classifyCategoryBlock = (categoryName) => {
  const text = normalize(categoryName).toLowerCase();
  if (text.includes("suplement")) return "suplementos";
  if (text.includes("acessor") || text.includes("equip") || text.includes("fitness")) return "acessorios";
  return "demais";
};

export const shouldUseFallbackFromPending = ({
  exportRows,
  pendingRows,
  fallbackEnabled,
}) => Boolean(fallbackEnabled) && (!Array.isArray(exportRows) || exportRows.length === 0) && Array.isArray(pendingRows) && pendingRows.length > 0;

export const pickFallbackRows = ({
  pendingRows,
  category,
  maxItems = 30,
}) => {
  const normalizedCategory = normalizeCategoryFilter(category);
  const filtered = (Array.isArray(pendingRows) ? pendingRows : [])
    .filter((row) => {
      if (!normalizedCategory || normalizedCategory === "all") return true;
      const block = classifyCategoryBlock(row?.categoria || row?.category || row?.category_name || "");
      return block === normalizedCategory;
    })
    .slice()
    .sort((left, right) => {
      const l = String(left?.updated_at || "");
      const r = String(right?.updated_at || "");
      if (l !== r) return l.localeCompare(r);
      return String(left?.product_id || left?.id || "").localeCompare(String(right?.product_id || right?.id || ""));
    });

  const seenKeys = new Set();
  const deduped = [];
  for (const row of filtered) {
    const sourceUrl = resolveAffiliateBatchSourceUrl(row);
    const productKey = normalize(row?.product_id || row?.id);
    const mlItemKey = normalizeMlItemId(row?.ml_item_id || row?.external_id || sourceUrl);
    const dedupeKey = mlItemKey || sourceUrl || productKey;
    if (!dedupeKey) continue;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    deduped.push(row);
  }

  return deduped.slice(0, Math.max(1, Math.min(30, Number(maxItems) || 30)));
};

export const buildFallbackBatchSource = ({ baseSource, category }) => {
  const src = normalize(baseSource) || "cli_export_standby_batch";
  const cat = normalizeCategoryFilter(category) || "all";
  return `${src}__fallback_pending__${cat}`;
};

export const buildFallbackSummary = ({ selectedRows, category, maxItems }) => ({
  selected: Array.isArray(selectedRows) ? selectedRows.length : 0,
  category: normalizeCategoryFilter(category) || "all",
  max_items: Math.max(1, Math.min(30, Number(maxItems) || 30)),
});
