import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Package } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import SEOHead from "@/Components/SEOHead";
import { ProductCard } from "@/Components/ProductCard";
import { CatalogSearchBar } from "@/Components/catalog/CatalogSearchBar";
import { CategoryTabs } from "@/Components/catalog/CategoryTabs";
import { SubFiltersDropdown } from "@/Components/catalog/SubFiltersDropdown";
import { Pagination } from "@/Components/catalog/Pagination";

import { useProducts } from "@/hooks/useProducts";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  CATEGORY_TABS,
  SUB_FILTER_OPTIONS,
  CatalogProduct,
  applySubFilter,
  compareBySubFilter,
  createCatalogIndex,
  getCatalogCategory,
  getProductCategory,
  paginateItems,
  parseSubFilter,
  scoreCatalogMatch,
  sortEntries,
  updateSearchParams,
} from "@/lib/catalog";

export default function Products() {
  const { products, loading } = useProducts();
  const [searchParams, setSearchParams] = useSearchParams();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [isCompactGrid, setIsCompactGrid] = useState(false);

  const queryParam = searchParams.get("q") || searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(queryParam);
  const debouncedQuery = useDebouncedValue(searchInput, 320);

  const activeCategory = getCatalogCategory(searchParams.get("cat"));
  const subFilter = parseSubFilter(searchParams.get("sub"));
  const pageParam = Number(searchParams.get("page") || 1);
  const limitParam = Number(searchParams.get("limit") || 24);
  const pageSize = [12, 24, 36].includes(limitParam) ? limitParam : 24;

  useEffect(() => {
    setSearchInput(queryParam);
  }, [queryParam]);

  useEffect(() => {
    const updateViewport = () => {
      setIsCompactGrid(window.innerWidth < 768);
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (debouncedQuery === queryParam) return;
    const next = updateSearchParams(searchParams, {
      q: debouncedQuery || null,
      search: null,
      page: 1,
    });
    setSearchParams(next, { replace: true, preventScrollReset: true });
  }, [debouncedQuery, queryParam, searchParams, setSearchParams]);

  const applyParams = (updates: Record<string, string | number | null | undefined>) => {
    setSearchParams(updateSearchParams(searchParams, updates), {
      replace: true,
      preventScrollReset: true,
    });
  };

  const catalogProducts = useMemo(
    () => (products || []) as CatalogProduct[],
    [products]
  );

  const indexedProducts = useMemo(
    () => createCatalogIndex(catalogProducts),
    [catalogProducts]
  );
  const sortMode = subFilter === "promocoes" || subFilter === "pix" ? "melhores" : subFilter;

  const filteredEntries = useMemo(() => {
    let entries = indexedProducts;

    if (activeCategory) {
      entries = entries.filter(
        (entry) => getProductCategory(entry.item) === activeCategory
      );
    }

    entries = applySubFilter(entries, subFilter);

    if (debouncedQuery) {
      const ranked = entries
        .map((entry) => ({
          entry,
          score: scoreCatalogMatch(debouncedQuery, entry),
        }))
        .filter((item) => item.score > 0);

      ranked.sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (scoreDiff !== 0) return scoreDiff;
        return compareBySubFilter(a.entry.item, b.entry.item, sortMode);
      });

      return ranked.map((item) => item.entry);
    }

    return sortEntries(entries, sortMode);
  }, [indexedProducts, activeCategory, subFilter, debouncedQuery, sortMode]);

  const { items: paginatedEntries, totalPages, page } = paginateItems(
    filteredEntries,
    pageParam,
    pageSize
  );

  const rawSearchLabel = debouncedQuery.trim();
  const activeCategoryLabel = activeCategory
    ? CATEGORY_TABS.find((tab) => tab.value === activeCategory)?.label
    : null;
  const activeFilters = [
    activeCategoryLabel ? `Categoria: ${activeCategoryLabel}` : null,
    subFilter && subFilter !== "melhores"
      ? SUB_FILTER_OPTIONS.find((option) => option.value === subFilter)?.label
      : null,
    rawSearchLabel ? `Busca: "${rawSearchLabel}"` : null,
  ].filter(Boolean) as string[];
  const hasActiveFilter = Boolean(activeCategory || (subFilter && subFilter !== "melhores"));

  const handlePageChange = (nextPage: number) => {
    applyParams({ page: nextPage });
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleResetFilters = () => {
    setSearchInput("");
    applyParams({ cat: null, sub: null, q: null, page: 1 });
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      <SEOHead
        title="Estoque Completo"
        description="Explore todo o arsenal de suplementos e equipamentos da ArsenalFit."
      />

      <main id="main-content" className="container mx-auto py-20 px-4">
        <div className="mb-12">
          <Link
            to="/"
            className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[10px] font-black uppercase tracking-[0.35em] text-zinc-300 hover:text-white hover:border-white/30 transition-all mb-8"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white group-hover:bg-primary group-hover:text-black transition-colors">
              <ArrowLeft size={14} />
            </span>
            Voltar para o Arsenal
          </Link>

          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-black italic text-white mb-4 tracking-tighter uppercase leading-none">
              ESTOQUE{" "}
              <span className="text-[hsl(var(--accent-orange))]">COMPLETO</span>
              {rawSearchLabel ? (
                <span className="text-[hsl(var(--accent-green))]">
                  {" "}
                  PARA {rawSearchLabel.toUpperCase()}
                </span>
              ) : null}
            </h1>
            <p className="text-zinc-500 max-w-md mx-auto font-medium">
              {rawSearchLabel
                ? `Filtramos os melhores resultados para ${rawSearchLabel}.`
                : "Equipe sua rotina com os suplementos de maior pureza e equipamentos de elite do mercado."}
            </p>
          </div>
        </div>

        <div className="space-y-6 mb-12">
          <CategoryTabs
            value={activeCategory}
            tabs={CATEGORY_TABS.map((tab) => ({
              value: tab.value,
              label: tab.label,
            }))}
            onChange={(value) => {
              const tab = CATEGORY_TABS.find((item) => item.value === value);
              applyParams({ cat: tab?.slug ?? value, page: 1 });
            }}
          />

          <div className="rounded-full border border-[#ff7a00]/25 bg-white/10 px-4 py-3 shadow-[0_16px_32px_rgba(0,0,0,0.35)] backdrop-blur-[14px] ring-1 ring-white/5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <CatalogSearchBar
                value={searchInput}
                onChange={setSearchInput}
                placeholder="Buscar no estoque completo..."
                className="lg:max-w-xl"
                inputClassName="h-[54px] bg-white/[0.12] border-[#ff7a00]/30 text-white/[0.92] caret-[#ff7a00] placeholder:text-white/[0.55] hover:bg-white/[0.16] hover:border-[#ff7a00]/45 focus:border-[#ff7a00]/70 focus:ring-[#ff7a00]/20 disabled:opacity-60 disabled:cursor-not-allowed [&:-webkit-autofill]:[-webkit-text-fill-color:rgba(255,255,255,0.92)] [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_rgba(18,18,18,0.35)] [&:-webkit-autofill]:caret-[#ff7a00]"
                iconClassName="text-[#ff7a00]/80"
              />

              <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                <SubFiltersDropdown
                  value={subFilter}
                  onChange={(value) => applyParams({ sub: value, page: 1 })}
                  options={SUB_FILTER_OPTIONS}
                  className="sm:w-64"
                  triggerClassName="h-[54px] bg-white/[0.12] border-[#ff7a00]/30 text-white/[0.92] hover:bg-white/[0.16] hover:border-[#ff7a00]/45 focus-visible:ring-2 focus-visible:ring-[#ff7a00]/20"
                  contentClassName="bg-[#151515] border-white/10"
                  active={subFilter !== "melhores"}
                />
              </div>
            </div>
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              {activeFilters.map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-[#ff7a00]/25 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-white/80"
                >
                  {label}
                </span>
              ))}
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="rounded-full border border-[#ff7a00]/60 bg-[#ff7a00]/90 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-black hover:bg-[#e85f00] transition-all shadow-[0_8px_20px_rgba(255,122,0,0.25)]"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div
            className="flex flex-col items-center justify-center py-20 gap-4"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-12 w-12 animate-spin text-[#a3e635]" />
            <p className="text-zinc-500 font-black tracking-widest uppercase animate-pulse">
              Sincronizando Arsenal...
            </p>
          </div>
        ) : paginatedEntries.length > 0 ? (
          <>
            <div
              ref={gridRef}
              className="grid max-[349px]:grid-cols-1 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 min-[480px]:gap-5 lg:gap-8"
            >
              {paginatedEntries.map((entry) => (
                <ProductCard
                  key={entry.item.id}
                  product={entry.item as any}
                  variant={isCompactGrid ? "compact" : "default"}
                />
              ))}
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              pageSize={pageSize}
              onPageSizeChange={(value) => applyParams({ limit: value, page: 1 })}
              className="mt-10"
            />
          </>
        ) : (
          <div
            className="text-center py-32 border-2 border-dashed border-zinc-900 rounded-[50px] bg-zinc-900/20"
            role="status"
            aria-live="polite"
          >
            <Package className="h-16 w-16 text-zinc-800 mx-auto mb-4" />
            <h3 className="text-2xl font-black italic text-zinc-600 mb-2 uppercase">
              Arsenal Esgotado
            </h3>
            <p className="text-zinc-500 font-bold max-w-xs mx-auto">
              Nossa equipe está reabastecendo o estoque com novas unidades de elite.
              Volte em breve!
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
