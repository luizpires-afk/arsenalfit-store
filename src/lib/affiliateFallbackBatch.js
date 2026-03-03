const normalize = (value) => String(value ?? "").trim();

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
      if (!normalizedCategory) return true;
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

  return filtered.slice(0, Math.max(1, Math.min(30, Number(maxItems) || 30)));
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
