export type CatalogCategory =
  | "SUPLEMENTOS"
  | "EQUIPAMENTOS"
  | "ACESSORIOS"
  | "ROUPAS";

const MIN_PIX_DIFF_ABS = 0.5;
const MIN_PIX_DIFF_RATIO = 0.005;

export type SubFilterValue =
  | "melhores"
  | "novas"
  | "promocoes"
  | "pix"
  | "menor"
  | "elite";

export const CATEGORY_TABS: Array<{ value: CatalogCategory; label: string; slug: string }> = [
  { value: "SUPLEMENTOS", label: "Suplementos", slug: "suplementos" },
  { value: "EQUIPAMENTOS", label: "Equipamentos", slug: "equipamentos" },
  { value: "ACESSORIOS", label: "Acessórios", slug: "acessorios" },
  { value: "ROUPAS", label: "Roupas", slug: "roupas" },
];

export const SUB_FILTER_OPTIONS: Array<{ value: SubFilterValue; label: string }> = [
  { value: "melhores", label: "Melhores da categoria" },
  { value: "novas", label: "Novas entradas" },
  { value: "promocoes", label: "Promoções" },
  { value: "pix", label: "Pix" },
  { value: "menor", label: "Menor investimento" },
  { value: "elite", label: "Elite (maior preço)" },
];

export type CatalogProduct = {
  id: string;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  price: number;
  pix_price?: number | null;
  original_price?: number | null;
  previous_price?: number | null;
  discount_percentage?: number | null;
  is_on_sale?: boolean;
  is_featured?: boolean;
  curation_badges?: string[] | null;
  free_shipping?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  detected_at?: string | null;
  marketplace?: string | null;
  external_id?: string | null;
  source_url?: string | null;
  affiliate_link?: string | null;
  brand?: string | null;
  subcategory?: string | null;
  specifications?: Record<string, unknown> | null;
  category?: { name?: string | null; slug?: string | null } | null;
  popularityScore?: number | null;
  clicks_count?: number | null;
  rating?: number | null;
  reviews_count?: number | null;
};

const CURATION_BADGE_ELITE = "ELITE";
const CURATION_BADGE_BEST_VALUE = "MELHOR_CUSTO_BENEFICIO";
const CURATION_BADGE_BEST_SELLER = "MAIS_VENDIDO";

export type CatalogIndexItem<T extends CatalogProduct> = {
  item: T;
  title: string;
  text: string;
  tokens: string[];
};

export const normalizeText = (value = "") =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const tokenize = (value = "") =>
  normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);

export const getCatalogCategory = (value?: string | null): CatalogCategory | null => {
  const normalized = normalizeText(value || "");
  if (!normalized) return null;
  if (normalized.includes("suplement")) return "SUPLEMENTOS";
  if (normalized.includes("equip")) return "EQUIPAMENTOS";
  if (normalized.includes("roup")) return "ROUPAS";
  if (normalized.includes("acessor")) return "ACESSORIOS";
  return null;
};

export const getProductCategory = (product: CatalogProduct): CatalogCategory | null => {
  const bySlug = getCatalogCategory(product.category?.slug);
  if (bySlug) return bySlug;
  const byName = getCatalogCategory(product.category?.name);
  if (byName) return byName;
  return null;
};

export const getDiscountPercent = (product: CatalogProduct) => {
  if (typeof product.discount_percentage === "number" && product.discount_percentage > 0) {
    return Math.round(product.discount_percentage);
  }
  const original =
    typeof product.original_price === "number" ? product.original_price : null;
  const price = typeof product.price === "number" ? product.price : null;
  if (original && price && original > price) {
    return Math.round(((original - price) / original) * 100);
  }
  return 0;
};

export const getPixPrice = (product: CatalogProduct) => {
  const pix =
    typeof product.pix_price === "number" && Number.isFinite(product.pix_price)
      ? product.pix_price
      : null;
  const price =
    typeof product.price === "number" && Number.isFinite(product.price)
      ? product.price
      : null;
  if (!pix || pix <= 0) return null;
  if (price && pix >= price) return null;
  if (price && !hasMeaningfulPixDiscount(price, pix)) return null;
  return pix;
};

export const hasMeaningfulPixDiscount = (price: number, pix: number) => {
  if (!(Number.isFinite(price) && Number.isFinite(pix))) return false;
  if (!(price > 0 && pix > 0 && pix < price)) return false;
  const diff = price - pix;
  const ratio = diff / price;
  return diff >= MIN_PIX_DIFF_ABS || ratio >= MIN_PIX_DIFF_RATIO;
};

export const getEffectivePrice = (product: CatalogProduct) => {
  const pix = getPixPrice(product);
  return pix ?? product.price ?? 0;
};

export const isPromoProduct = (product: CatalogProduct) => {
  const discount = getDiscountPercent(product);
  if (discount >= 1) return true;
  const original =
    typeof product.original_price === "number" ? product.original_price : null;
  return Boolean(product.is_on_sale || (original && original > product.price));
};

export const hasPixPrice = (product: CatalogProduct) => getPixPrice(product) !== null;

export const getPriorityScore = (product: CatalogProduct) => {
  const price = Number(product.price || 0);
  const prevRaw =
    typeof product.previous_price === "number"
      ? product.previous_price
      : typeof product.original_price === "number"
        ? product.original_price
        : null;
  const prev = typeof prevRaw === "number" ? prevRaw : null;
  const hasDrop = prev !== null && prev > price;
  const discountPercent =
    typeof product.discount_percentage === "number"
      ? product.discount_percentage
      : hasDrop && prev
        ? Math.round(((prev - price) / prev) * 100)
        : 0;
  const isBestDeal = discountPercent >= 15;
  const isPromo = product.is_on_sale === true || discountPercent > 0;
  const isFeatured = product.is_featured === true;

  if (isBestDeal) return 4;
  if (isPromo) return 3;
  if (hasDrop) return 2;
  if (isFeatured) return 1;
  return 0;
};

const toFiniteNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const getCatalogCuration = (product: CatalogProduct) => {
  const specs =
    product.specifications && typeof product.specifications === "object"
      ? (product.specifications as Record<string, unknown>)
      : null;
  const catalogCuration =
    specs?.catalog_curation && typeof specs.catalog_curation === "object"
      ? (specs.catalog_curation as Record<string, unknown>)
      : null;
  return catalogCuration;
};

const getCatalogCurationScore = (
  product: CatalogProduct,
  field: "score_custo_beneficio" | "score_popularidade",
) => {
  const catalogCuration = getCatalogCuration(product);
  if (!catalogCuration) return null;
  const raw = toFiniteNumber(catalogCuration[field]);
  return raw;
};

export const getCurationBadges = (product: CatalogProduct) => {
  const badges = new Set<string>();

  if (Array.isArray(product.curation_badges)) {
    for (const badge of product.curation_badges) {
      const normalized = String(badge ?? "").trim().toUpperCase();
      if (normalized) badges.add(normalized);
    }
  }

  const catalogCuration = getCatalogCuration(product);
  if (Array.isArray(catalogCuration?.badges)) {
    for (const badge of catalogCuration.badges) {
      const normalized = String(badge ?? "").trim().toUpperCase();
      if (normalized) badges.add(normalized);
    }
  }

  return Array.from(badges);
};

export const hasCurationBadge = (product: CatalogProduct, badge: string) => {
  const normalized = String(badge ?? "").trim().toUpperCase();
  if (!normalized) return false;
  return getCurationBadges(product).includes(normalized);
};

export const isEliteCurationProduct = (product: CatalogProduct) =>
  hasCurationBadge(product, CURATION_BADGE_ELITE) || product.is_featured === true;

export const isBestValueCurationProduct = (product: CatalogProduct) =>
  hasCurationBadge(product, CURATION_BADGE_BEST_VALUE);

export const isPopularCurationProduct = (product: CatalogProduct) =>
  hasCurationBadge(product, CURATION_BADGE_BEST_SELLER);

export const getPopularityScore = (product: CatalogProduct) => {
  if (typeof product.popularityScore === "number") return product.popularityScore;
  if (typeof product.clicks_count === "number") return product.clicks_count;
  if (typeof product.rating === "number" && typeof product.reviews_count === "number") {
    return product.rating * product.reviews_count;
  }
  return 0;
};

export const getCurationPopularityScore = (product: CatalogProduct) => {
  const score = getCatalogCurationScore(product, "score_popularidade");
  if (score !== null) return score;
  return getPopularityScore(product);
};

export const getCurationCostBenefitScore = (product: CatalogProduct) => {
  const score = getCatalogCurationScore(product, "score_custo_beneficio");
  if (score !== null) return score;
  return 0;
};

export const getRecencyScore = (product: CatalogProduct) => {
  const dateValue = product.updated_at || product.created_at || product.detected_at;
  if (!dateValue) return 0;
  const time = new Date(dateValue).getTime();
  return Number.isFinite(time) ? time : 0;
};

export const compareByCurationPriority = (
  a: CatalogProduct,
  b: CatalogProduct,
) => {
  const eliteDiff = Number(isEliteCurationProduct(b)) - Number(isEliteCurationProduct(a));
  if (eliteDiff !== 0) return eliteDiff;

  const bestValueDiff =
    Number(isBestValueCurationProduct(b)) - Number(isBestValueCurationProduct(a));
  if (bestValueDiff !== 0) return bestValueDiff;

  const popularBadgeDiff =
    Number(isPopularCurationProduct(b)) - Number(isPopularCurationProduct(a));
  if (popularBadgeDiff !== 0) return popularBadgeDiff;

  const popularityDiff = getCurationPopularityScore(b) - getCurationPopularityScore(a);
  if (Math.abs(popularityDiff) > 0.0001) return popularityDiff;

  const cxbDiff = getCurationCostBenefitScore(b) - getCurationCostBenefitScore(a);
  if (Math.abs(cxbDiff) > 0.0001) return cxbDiff;

  const priorityDiff = getPriorityScore(b) - getPriorityScore(a);
  if (priorityDiff !== 0) return priorityDiff;

  const recencyDiff = getRecencyScore(b) - getRecencyScore(a);
  if (recencyDiff !== 0) return recencyDiff;

  return getEffectivePrice(a) - getEffectivePrice(b);
};

const buildSearchText = (product: CatalogProduct) =>
  [
    product.title,
    product.name,
    product.description,
    product.brand,
    product.subcategory,
    product.marketplace,
    product.category?.name,
    product.category?.slug,
  ]
    .filter(Boolean)
    .join(" ");

export const createCatalogIndex = <T extends CatalogProduct>(
  items: T[],
): CatalogIndexItem<T>[] =>
  items.map((item) => {
    const title = normalizeText(item.name || item.title || "");
    const text = normalizeText(buildSearchText(item));
    const tokens = tokenize(text);
    return { item, title, text, tokens };
  });

const grams = (value: string, size = 2) => {
  const normalized = ` ${value} `;
  const results: string[] = [];
  for (let i = 0; i <= normalized.length - size; i += 1) {
    results.push(normalized.slice(i, i + size));
  }
  return results;
};

const jaccard = (a: string[], b: string[]) => {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  setA.forEach((value) => {
    if (setB.has(value)) intersection += 1;
  });
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const fuzzyTokenScore = (queryTokens: string[], targetTokens: string[]) => {
  if (!queryTokens.length) return 0;
  let total = 0;
  queryTokens.forEach((token) => {
    if (targetTokens.includes(token)) {
      total += 1;
      return;
    }
    const best = targetTokens.reduce((acc, current) => {
      const score = jaccard(grams(token), grams(current));
      return Math.max(acc, score);
    }, 0);
    total += best * 0.85;
  });
  return total / queryTokens.length;
};

export const scoreCatalogMatch = (
  query: string,
  entry: CatalogIndexItem<CatalogProduct>,
) => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;

  if (entry.title && entry.title.includes(normalizedQuery)) {
    return 110 + normalizedQuery.length;
  }

  if (entry.text.includes(normalizedQuery)) {
    return 90 + normalizedQuery.length;
  }

  const queryTokens = tokenize(normalizedQuery);
  if (!queryTokens.length) return 0;

  const allTokens = queryTokens.every((token) => entry.text.includes(token));
  if (allTokens) {
    return 70 + queryTokens.length * 4;
  }

  const fuzzyScore = fuzzyTokenScore(queryTokens, entry.tokens);
  if (fuzzyScore >= 0.38) {
    return 40 + Math.round(fuzzyScore * 40);
  }

  return 0;
};

export const applySubFilter = <T extends CatalogProduct>(
  entries: CatalogIndexItem<T>[],
  subFilter: SubFilterValue,
) => {
  if (subFilter === "promocoes") {
    return entries.filter((entry) => isPromoProduct(entry.item));
  }
  if (subFilter === "pix") {
    return entries.filter((entry) => hasPixPrice(entry.item));
  }
  return entries;
};

export const sortEntries = <T extends CatalogProduct>(
  entries: CatalogIndexItem<T>[],
  subFilter: SubFilterValue,
) => {
  const sorted = [...entries];
  if (subFilter === "menor") {
    sorted.sort((a, b) => getEffectivePrice(a.item) - getEffectivePrice(b.item));
    return sorted;
  }
  if (subFilter === "elite") {
    sorted.sort((a, b) => (b.item.price || 0) - (a.item.price || 0));
    return sorted;
  }
  if (subFilter === "novas") {
    sorted.sort((a, b) => getRecencyScore(b.item) - getRecencyScore(a.item));
    return sorted;
  }
  if (subFilter === "melhores") {
    sorted.sort((a, b) => compareByCurationPriority(a.item, b.item));
    return sorted;
  }
  return sorted;
};

export const compareBySubFilter = (
  a: CatalogProduct,
  b: CatalogProduct,
  subFilter: SubFilterValue,
) => {
  if (subFilter === "menor") {
    return getEffectivePrice(a) - getEffectivePrice(b);
  }
  if (subFilter === "elite") {
    return (b.price || 0) - (a.price || 0);
  }
  if (subFilter === "novas") {
    return getRecencyScore(b) - getRecencyScore(a);
  }
  if (subFilter === "melhores") {
    return compareByCurationPriority(a, b);
  }
  return 0;
};

const extractCanonicalCatalogIdFromUrl = (value?: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    const path = url.pathname;
    const catalogMatch = path.match(/\/p\/(MLB\d{6,12})/i);
    if (catalogMatch?.[1]) return catalogMatch[1].toUpperCase();

    for (const key of ["item_id", "wid", "id"]) {
      const raw = url.searchParams.get(key);
      const match = raw?.match(/MLB(\d{6,12})/i);
      if (match?.[1]) return `MLB${match[1]}`;
    }
    const encodedItemId = value.match(/item_id%3AMLB(\d{6,12})/i);
    if (encodedItemId?.[1]) return `MLB${encodedItemId[1]}`;
    return null;
  } catch {
    const encodedItemId = value.match(/item_id%3AMLB(\d{6,12})/i);
    if (encodedItemId?.[1]) return `MLB${encodedItemId[1]}`;
    return null;
  }
};

const extractPathKeyFromUrl = (value?: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();
    if (!path || path === "/") return null;
    return `path:${path}`;
  } catch {
    return null;
  }
};

const buildProductFingerprintKey = (product: CatalogProduct) => {
  const normalizedTitle = normalizeText(product.name || product.title || "");
  if (!normalizedTitle || normalizedTitle.length < 10) return null;
  const compactTitle = normalizedTitle
    .replace(/\b(kit|com|para|de|do|da|e|em|no|na|o|a)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!compactTitle) return null;
  const normalizedBrand = normalizeText(product.brand || "");
  const normalizedCategory = normalizeText(
    product.category?.slug || product.category?.name || product.subcategory || "",
  );
  return `fingerprint:${normalizedCategory}:${normalizedBrand}:${compactTitle.slice(0, 140)}`;
};

const getCanonicalCatalogKey = (product: CatalogProduct) => {
  const fromSourceCatalogId = extractCanonicalCatalogIdFromUrl(product.source_url);
  if (fromSourceCatalogId) return `catalog:${fromSourceCatalogId}`;
  const fromAffiliateCatalogId = extractCanonicalCatalogIdFromUrl(product.affiliate_link);
  if (fromAffiliateCatalogId) return `catalog:${fromAffiliateCatalogId}`;

  const fingerprint = buildProductFingerprintKey(product);
  if (fingerprint) return fingerprint;

  const fromSourcePath = extractPathKeyFromUrl(product.source_url);
  if (fromSourcePath) return fromSourcePath;
  const fromAffiliatePath = extractPathKeyFromUrl(product.affiliate_link);
  if (fromAffiliatePath) return fromAffiliatePath;

  const external = String(product.external_id ?? "").toUpperCase().trim();
  if (external) return `external:${external}`;
  const title = normalizeText(product.name || product.title || "");
  if (title) return `title:${title.slice(0, 120)}`;
  return `id:${product.id}`;
};

const pickBestCatalogProduct = <T extends CatalogProduct>(a: T, b: T) => {
  const byPriority = compareByCurationPriority(a, b);
  if (byPriority < 0) return a;
  if (byPriority > 0) return b;
  const effectiveA = getEffectivePrice(a);
  const effectiveB = getEffectivePrice(b);
  if (effectiveA !== effectiveB) return effectiveA < effectiveB ? a : b;
  const recencyDiff = getRecencyScore(a) - getRecencyScore(b);
  if (recencyDiff !== 0) return recencyDiff > 0 ? a : b;
  return a.id.localeCompare(b.id) <= 0 ? a : b;
};

const ACCESSORY_BLOCKLIST_TERMS = [
  "cafe",
  "cafeteira",
  "chimarrao",
  "erva mate",
  "cuia",
  "bule",
  "coador",
  "garrafa termica",
  "copo termico",
  "termica",
  "thermal",
  "stanley",
  "quick flip",
  "termolar",
  "magic pump",
];

const shouldHideAccessoryOutOfScopeProduct = (product: CatalogProduct) => {
  if (getProductCategory(product) !== "ACESSORIOS") return false;
  const haystack = normalizeText(
    [
      product.name,
      product.title,
      product.description,
      product.brand,
      product.subcategory,
    ]
      .filter(Boolean)
      .join(" "),
  );
  if (!haystack) return false;
  return ACCESSORY_BLOCKLIST_TERMS.some((term) => haystack.includes(term));
};

export const dedupeCatalogProducts = <T extends CatalogProduct>(items: T[]) => {
  const byCanonical = new Map<string, T>();
  for (const item of items || []) {
    if (shouldHideAccessoryOutOfScopeProduct(item)) continue;
    const key = getCanonicalCatalogKey(item);
    const current = byCanonical.get(key);
    if (!current) {
      byCanonical.set(key, item);
      continue;
    }
    byCanonical.set(key, pickBestCatalogProduct(current, item));
  }
  return Array.from(byCanonical.values());
};

export const getPaginationRange = (
  current: number,
  total: number,
  siblingCount = 1,
): Array<number | "ellipsis"> => {
  if (total <= 1) return [1];
  const totalNumbers = siblingCount * 2 + 3;
  const totalBlocks = totalNumbers + 2;

  if (total <= totalBlocks) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const startPage = Math.max(2, current - siblingCount);
  const endPage = Math.min(total - 1, current + siblingCount);
  const hasLeftEllipsis = startPage > 2;
  const hasRightEllipsis = endPage < total - 1;
  const range: Array<number | "ellipsis"> = [1];

  if (hasLeftEllipsis) {
    range.push("ellipsis");
  }

  for (let page = startPage; page <= endPage; page += 1) {
    range.push(page);
  }

  if (hasRightEllipsis) {
    range.push("ellipsis");
  }

  range.push(total);
  return range;
};

export const paginateItems = <T,>(
  items: T[],
  page: number,
  limit: number,
) => {
  const safeLimit = limit > 0 ? limit : 12;
  const totalPages = Math.max(1, Math.ceil(items.length / safeLimit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safeLimit;
  return {
    totalPages,
    page: safePage,
    items: items.slice(start, start + safeLimit),
  };
};

export const updateSearchParams = (
  searchParams: URLSearchParams,
  updates: Record<string, string | number | null | undefined>,
) => {
  const next = new URLSearchParams(searchParams);
  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      next.delete(key);
      return;
    }
    next.set(key, String(value));
  });
  return next;
};

export const parseSubFilter = (value?: string | null): SubFilterValue => {
  const normalized = normalizeText(value || "");
  const match = SUB_FILTER_OPTIONS.find((option) => option.value === normalized);
  return match?.value ?? "melhores";
};
