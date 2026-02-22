import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Dumbbell,
  Pill,
  Shirt,
  LayoutGrid,
  ArrowLeft,
  Watch,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Button } from "@/Components/ui/button";
import { ProductCard } from "@/Components/ProductCard";
import { CatalogSearchBar } from "@/Components/catalog/CatalogSearchBar";
import { SubFiltersDropdown } from "@/Components/catalog/SubFiltersDropdown";
import { Pagination } from "@/Components/catalog/Pagination";

import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  SUB_FILTER_OPTIONS,
  applySubFilter,
  compareBySubFilter,
  createCatalogIndex,
  dedupeCatalogProducts,
  paginateItems,
  parseSubFilter,
  scoreCatalogMatch,
  sortEntries,
  updateSearchParams,
} from "@/lib/catalog";

import type { Product } from "@/types/database";

type CategoryKey = "suplementos" | "equipamentos" | "roupas" | "acessorios";
type GenderKey = "masculino" | "feminino";

const categoryInfo: Record<
  CategoryKey,
  {
    label: string;
    description: string;
    icon: any;
    image: string;
    color: string;
  }
> = {
  suplementos: {
    label: "Suplementos",
    description: "Combustível de alta performance para seus músculos.",
    icon: Pill,
    image: "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=1200",
    color: "text-lime-300",
  },
  equipamentos: {
    label: "Equipamentos",
    description: "Forja o teu corpo com ferramentas de aço.",
    icon: Dumbbell,
    image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200",
    color: "text-sky-300",
  },
  roupas: {
    label: "Roupas",
    description: "Armadura técnica para o campo de batalha.",
    icon: Shirt,
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=1200",
    color: "text-rose-300",
  },
  acessorios: {
    label: "Acessórios",
    description: "Tecnologia e precisão para cada repetição.",
    icon: Watch,
    image: "https://images.unsplash.com/photo-1576243345690-4e4b79b63288?w=1200",
    color: "text-amber-300",
  },
};

const CLOTHING_IMAGES: Record<GenderKey, string> = {
  masculino: "/images/roupas-masculinas.jpg",
  feminino: "/images/roupas-femininas.jpg",
};

const CLOTHING_GENDER_INFO: Record<
  GenderKey,
  {
    label: string;
    description: string;
    image: string;
    color: string;
  }
> = {
  masculino: {
    label: "Roupas Masculinas",
    description: "Peças técnicas com design atlético para o seu ritmo.",
    image: CLOTHING_IMAGES.masculino,
    color: "text-emerald-400",
  },
  feminino: {
    label: "Roupas Femininas",
    description: "Modelagens que acompanham cada movimento com leveza.",
    image: CLOTHING_IMAGES.feminino,
    color: "text-rose-400",
  },
};

const CLOTHING_LANDING_CARDS: Array<{
  gender: GenderKey;
  title: string;
  description: string;
  image: string;
  cta: string;
}> = [
  {
    gender: "masculino",
    title: "Roupas Masculinas",
    description: "Linha de treino, casual e performance pronta para o seu ritmo.",
    image: CLOTHING_IMAGES.masculino,
    cta: "Explorar Masculino",
  },
  {
    gender: "feminino",
    title: "Roupas Femininas",
    description: "Modelos que acompanham seu movimento com estilo e leveza.",
    image: CLOTHING_IMAGES.feminino,
    cta: "Explorar Feminino",
  },
];

const normalize = (value = "") =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const parseGenderParam = (value?: string | null): GenderKey | null => {
  if (!value) return null;
  const normalized = normalize(value);
  if (!normalized) return null;

  if (
    normalized.startsWith("masc") ||
    normalized === "m" ||
    normalized.includes("homem") ||
    normalized.includes("male")
  ) {
    return "masculino";
  }

  if (
    normalized.startsWith("fem") ||
    normalized === "f" ||
    normalized.includes("mulher") ||
    normalized.includes("female")
  ) {
    return "feminino";
  }

  return null;
};

const preloadImages = (hrefs: string[]) => {
  if (typeof document === "undefined") return;
  hrefs.forEach((href) => {
    if (!href) return;
    const existing = document.querySelector(
      `link[rel="preload"][as="image"][href="${href}"]`
    );
    if (existing) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = href;
    link.setAttribute("data-preload", "roupas");
    document.head.appendChild(link);
    const img = new Image();
    img.src = href;
  });
};

const isMissingGenderColumn = (error: any) => {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("gender");
};

/**
 * Ajusta o Product (Supabase) para o formato exato que o ProductCard espera.
 * Regra importante:
 * - campos opcionais do card: use undefined
 * - campos que o card tipa como `string | null` (ex.: affiliate_link, image_url): mantenha null (nunca undefined)
 */
function toCardProduct(p: Product) {
  return {
    id: p.id,

    title: (p as any).title ?? undefined,
    name: p.name ?? undefined,

    description: p.description ?? undefined,

    price: p.price,

    // Card espera number | undefined
    original_price: p.original_price ?? undefined,

    // se seu card tipa isso como number | undefined, manter assim
    discount_percentage: p.discount_percentage ?? undefined,

    // Card espera string | null
    image_url: p.image_url ?? null,

    // Card espera string[] | undefined
    images: p.images ?? undefined,

    // OK. Card espera string | null (NUNCA undefined)
    affiliate_link: p.affiliate_link ?? null,
    source_url: p.source_url ?? undefined,

    // se o card usa slug como string | undefined
    slug: p.slug ?? undefined,

    marketplace: (p as any).marketplace ?? undefined,
    pix_price: p.pix_price ?? undefined,
    pix_price_source: (p as any).pix_price_source ?? undefined,
    previous_price: p.previous_price ?? undefined,
    is_on_sale: p.is_on_sale ?? undefined,
    is_featured: p.is_featured ?? undefined,
    free_shipping: p.free_shipping ?? undefined,
    brand: p.brand ?? undefined,
    subcategory: p.subcategory ?? undefined,
    rating: (p as any).rating ?? undefined,
    reviews_count: (p as any).reviews_count ?? undefined,
    curation_badges: p.curation_badges ?? undefined,
    detected_at: p.detected_at ?? undefined,
    updated_at: p.updated_at ?? undefined,
    last_sync: p.last_sync ?? undefined,
  };
}

export default function Category() {
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [isCompactGrid, setIsCompactGrid] = useState(false);

  const rawCat = (slug || searchParams.get("cat") || "suplementos") as CategoryKey;
  const categoryId: CategoryKey = categoryInfo[rawCat] ? rawCat : "suplementos";
  const rawGenderParam =
    searchParams.get("gender") ||
    searchParams.get("genero") ||
    searchParams.get("sexo");
  const gender = useMemo(() => parseGenderParam(rawGenderParam), [rawGenderParam]);
  const isRoupas = categoryId === "roupas";
  const showGenderLanding = isRoupas && !gender;
  const isGenderPage = isRoupas && !!gender;

  const baseCategory = categoryInfo[categoryId];
  const genderConfig = gender ? CLOTHING_GENDER_INFO[gender] : null;
  const category = genderConfig
    ? {
        ...baseCategory,
        ...genderConfig,
        icon: baseCategory.icon,
      }
    : baseCategory;
  const Icon = category.icon;
  const heroTitle =
    showGenderLanding && isRoupas ? "Escolha seu estilo de roupa" : category.label;
  const heroDescription =
    showGenderLanding && isRoupas
      ? "Selecione o gênero para ver o estoque completo e ofertas dedicadas."
      : category.description;
  const heroChipLabel = category.label;
  const genderBadgeClass =
    gender === "masculino"
      ? "border-sky-400/40 bg-sky-500/15 text-sky-300"
      : "border-pink-400/40 bg-pink-500/15 text-pink-300";
  const genderLabel = gender === "masculino" ? "Masculinas" : "Femininas";

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [genderFilterSupported, setGenderFilterSupported] = useState(true);

  const queryParam = searchParams.get("q") || searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(queryParam);
  const debouncedQuery = useDebouncedValue(searchInput, 320);
  const subFilter = parseSubFilter(searchParams.get("sub"));
  const pageParam = Number(searchParams.get("page") || 1);
  const limitParam = Number(searchParams.get("limit") || 24);
  const pageSize = [12, 24, 36].includes(limitParam) ? limitParam : 24;

  useEffect(() => {
    const updateViewport = () => {
      setIsCompactGrid(window.innerWidth < 768);
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    setSearchInput(queryParam);
  }, [queryParam]);

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

  useEffect(() => {
    let alive = true;

    if (showGenderLanding) {
      setProducts([]);
      setLoading(false);
      setGenderFilterSupported(true);
      return () => {
        alive = false;
      };
    }

    async function fetchProducts() {
      setLoading(true);
      try {
        const buildQuery = (withGender: boolean) => {
          let query = supabase
            .from("products")
            .select(
              `
            *,
            categories!inner(slug)
          `
            )
            .eq("categories.slug", categoryId)
            .eq("is_active", true)
            .eq("status", "active")
            .eq("data_health_status", "HEALTHY")
            .eq("is_blocked", false)
            .or("auto_disabled_reason.is.null,auto_disabled_reason.neq.blocked");

          if (withGender && gender) {
            query = query.eq("gender", gender);
          }

          return query;
        };

        if (gender) {
          const { data, error } = await buildQuery(true);

          if (error) {
            if (isMissingGenderColumn(error)) {
              const fallback = await buildQuery(false);
              if (fallback.error) throw fallback.error;
              if (!alive) return;
              setGenderFilterSupported(false);
              setProducts(dedupeCatalogProducts(((fallback.data as Product[]) || []) as any) as Product[]);
              return;
            }
            throw error;
          }

          if (!alive) return;
          setGenderFilterSupported(true);
          setProducts(dedupeCatalogProducts(((data as Product[]) || []) as any) as Product[]);
          return;
        }

        const { data, error } = await buildQuery(false);
        if (error) throw error;
        if (!alive) return;
        setGenderFilterSupported(true);
        setProducts(dedupeCatalogProducts(((data as Product[]) || []) as any) as Product[]);
      } catch (err) {
        console.error("Erro ao buscar produtos:", err);
        if (!alive) return;
        setProducts([]);
      } finally {
        if (alive) setLoading(false);
      }
    }

    fetchProducts();
    return () => {
      alive = false;
    };
  }, [categoryId, gender, showGenderLanding]);

  useEffect(() => {
    if (!isRoupas) return;
    preloadImages([CLOTHING_IMAGES.masculino, CLOTHING_IMAGES.feminino]);
  }, [isRoupas]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("arsenalfit_interest");
      const data = raw ? JSON.parse(raw) : {};
      data[categoryId] = (data[categoryId] || 0) + 1;
      localStorage.setItem("arsenalfit_interest", JSON.stringify(data));
    } catch {
      // ignore storage errors
    }
  }, [categoryId]);

  const indexedProducts = useMemo(() => createCatalogIndex(products), [products]);
  const sortMode = subFilter === "promocoes" || subFilter === "pix" ? "melhores" : subFilter;

  const filteredEntries = useMemo(() => {
    let entries = indexedProducts;
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
  }, [indexedProducts, subFilter, debouncedQuery, sortMode]);

  const { items: paginatedEntries, totalPages, page } = paginateItems(
    filteredEntries,
    pageParam,
    pageSize
  );

  const rawSearchLabel = debouncedQuery.trim();
  const hasActiveFilter = Boolean(subFilter && subFilter !== "melhores");

  const activeFilters = [
    subFilter && subFilter !== "melhores"
      ? SUB_FILTER_OPTIONS.find((option) => option.value === subFilter)?.label
      : null,
    rawSearchLabel ? `Busca: "${rawSearchLabel}"` : null,
  ].filter(Boolean) as string[];

  const handlePageChange = (nextPage: number) => {
    applyParams({ page: nextPage });
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleResetFilters = () => {
    setSearchInput("");
    applyParams({ sub: null, q: null, page: 1 });
  };

  return (
    <div className="min-h-screen bg-background text-white selection:bg-primary selection:text-black">
      {/* HERO SECTION */}
      <div className="relative min-h-[320px] overflow-hidden">
         <motion.div
           initial={{ scale: 1.08 }}
           animate={{ scale: 1 }}
           transition={{ duration: 1.5 }}
           className="absolute inset-0 bg-zinc-900 bg-cover bg-center bg-no-repeat"
           style={{ backgroundImage: `url(${category.image})` }}
         />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent" />

        <div className="relative container h-full flex flex-col gap-6 pt-5 pb-7 px-4">
          <Link
            to={isGenderPage ? "/categoria/roupas" : "/categorias"}
            className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[10px] font-black uppercase tracking-[0.35em] text-zinc-300 hover:text-white hover:border-white/30 transition-all"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white group-hover:bg-primary group-hover:text-black transition-colors">
              <ArrowLeft size={14} />
            </span>
            {isGenderPage ? "Voltar para estilo de roupa" : "VER CATEGORIAS"}
          </Link>

          <div className="relative max-w-4xl w-full mx-auto">
            <div
              className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-black/55 via-black/30 to-black/20 p-6 sm:p-7 shadow-[0_20px_56px_rgba(0,0,0,0.32)] backdrop-blur-sm"
              style={{
                WebkitMaskImage:
                  "radial-gradient(140% 120% at 50% 0%, #000 70%, transparent 100%)",
                maskImage:
                  "radial-gradient(140% 120% at 50% 0%, #000 70%, transparent 100%)",
              }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_60%)]" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/25 via-transparent to-black/18" />
              <div className="absolute inset-0 rounded-[30px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)]" />
              <div className="relative z-10">
                <div className="flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-[0.35em] text-zinc-500">
                  <span className="rounded-full border border-white/10 bg-black/40 px-3 py-1">
                    Linha ArsenalFit
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1">
                    Categoria
                  </span>
                  <span className="rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-primary">
                    {heroChipLabel}
                  </span>
                </div>
                <h2 className="mt-4 text-3xl sm:text-4xl md:text-5xl font-black uppercase italic tracking-tight">
                  {heroTitle}
                </h2>
                <p className="mt-3 text-sm text-zinc-300 max-w-2xl">
                  {heroDescription}
                </p>
                {showGenderLanding && (
                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {CLOTHING_LANDING_CARDS.map((card) => (
                      <Link
                        key={card.gender}
                        to={`/categoria/roupas?gender=${card.gender}`}
                        className="group relative overflow-hidden rounded-[24px] border border-white/10 bg-black/40 shadow-[0_18px_36px_rgba(0,0,0,0.35)] transition-transform duration-300 hover:-translate-y-1"
                        aria-label={card.title}
                      >
                         <div
                           className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-500 group-hover:scale-105"
                           style={{ backgroundImage: `url(${card.image})` }}
                          />
                        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/60 to-black/45" />
                        <div className="absolute right-4 top-4 z-10 h-11 w-11 rounded-full border border-white/10 bg-black/35 backdrop-blur-sm flex items-center justify-center shadow-lg">
                          <Shirt
                            size={18}
                            className={card.gender === "feminino" ? "text-rose-300" : "text-emerald-300"}
                            aria-hidden="true"
                          />
                        </div>
                        <div className="relative flex h-full min-h-[170px] flex-col justify-between p-5 sm:p-6">
                          <div className="space-y-2">
                            <span className="text-[9px] font-black uppercase tracking-[0.35em] text-white/70">
                              Categoria
                            </span>
                            <h3 className="text-xl sm:text-2xl font-black uppercase italic tracking-tight text-white">
                              {card.title}
                            </h3>
                            <p className="text-xs sm:text-sm text-zinc-200 max-w-sm">
                              {card.description}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            className="mt-4 w-fit rounded-full border-white/60 bg-white/95 text-zinc-900 hover:bg-white hover:text-black text-[10px] font-semibold uppercase tracking-widest shadow-sm"
                          >
                            {card.cta}
                          </Button>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
                {!showGenderLanding && (
                  <div className="mt-6 flex justify-center">
                    <div className="h-12 w-12 rounded-full border border-white/10 bg-black/40 flex items-center justify-center shadow-lg">
                      <Icon size={22} strokeWidth={2.2} className={category.color} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <main
        id="main-content"
        className={`container px-4 ${showGenderLanding ? "pt-0 pb-8" : "py-10"}`}
      >
        {!showGenderLanding && (
          <>
            {isRoupas && gender && (
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">
                    Roupas
                  </span>
                  <span
                    className={`text-[11px] font-black uppercase tracking-widest border rounded-full px-3 py-1 ${genderBadgeClass}`}
                  >
                    {genderLabel}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-zinc-500">
                    {loading
                      ? "Carregando..."
                      : `${filteredEntries.length} itens`}
                  </span>
                  <Link
                    to="/categoria/roupas"
                    className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-[10px] sm:text-xs font-black uppercase tracking-[0.3em] text-primary hover:bg-primary hover:text-black transition-colors shadow-sm"
                  >
                    Trocar gênero
                  </Link>
                </div>
              </div>
            )}

            {isRoupas && gender && !genderFilterSupported && (
              <div className="mb-8 rounded-[28px] border border-amber-400/30 bg-amber-400/10 px-6 py-4 text-xs text-amber-200">
                O filtro por gênero ainda não está configurado no estoque.
                Exibindo todas as roupas disponíveis.
              </div>
            )}

            <div className="mb-10 space-y-6">
              <div className="rounded-full border border-[#ff7a00]/35 bg-white/80 px-4 py-3 shadow-[0_18px_36px_rgba(0,0,0,0.25)] backdrop-blur-[10px] ring-1 ring-[#ff7a00]/15">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <CatalogSearchBar
                    value={searchInput}
                    onChange={setSearchInput}
                    placeholder={`Buscar em ${category.label.toLowerCase()}...`}
                    className="lg:max-w-xl"
                    inputClassName="h-[54px] bg-white border-[#ff7a00]/55 text-[#111] caret-[#111] placeholder:text-zinc-500 hover:bg-white hover:border-[#ff7a00]/70 focus:border-[#ff7a00] focus:ring-[#ff7a00]/20 disabled:opacity-60 disabled:cursor-not-allowed [&:-webkit-autofill]:[-webkit-text-fill-color:#111] [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_white] [&:-webkit-autofill]:caret-[#111]"
                    iconClassName="text-[#ff7a00]"
                  />

                  <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                    <SubFiltersDropdown
                      value={subFilter}
                      onChange={(value) => applyParams({ sub: value, page: 1 })}
                      options={SUB_FILTER_OPTIONS}
                      className="sm:w-64"
                      triggerClassName="h-[54px] bg-white border-[#ff7a00]/55 text-[#111] hover:bg-white hover:border-[#ff7a00]/70 focus-visible:ring-2 focus-visible:ring-[#ff7a00]/20"
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
                      className="rounded-full border border-[#ff7a00]/25 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-[#111] shadow-sm"
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
              <div className="grid max-[349px]:grid-cols-1 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 min-[480px]:gap-5 lg:gap-10">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div
                    key={i}
                    className="h-[450px] bg-zinc-900/40 rounded-[45px] animate-pulse border border-white/5"
                  />
                ))}
              </div>
            ) : (
              <>
                <motion.div
                  ref={gridRef}
                  layout
                  className="grid max-[349px]:grid-cols-1 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 min-[480px]:gap-5 lg:gap-10"
                >
                  <AnimatePresence mode="popLayout">
                    {paginatedEntries.map((entry) => (
                      <motion.div
                        key={entry.item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.3 }}
                      >
                        <ProductCard
                          product={toCardProduct(entry.item)}
                          variant={isCompactGrid ? "compact" : "default"}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>

                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                  pageSize={pageSize}
                  onPageSizeChange={(value) => applyParams({ limit: value, page: 1 })}
                  className="mt-10"
                />
              </>
            )}

            {!loading && filteredEntries.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-32 bg-zinc-900/20 rounded-[50px] border-2 border-dashed border-zinc-800"
                role="status"
                aria-live="polite"
              >
                <LayoutGrid size={48} className="mx-auto text-zinc-800 mb-6" />
                <h3 className="text-3xl font-black uppercase italic text-zinc-600 tracking-tighter">
                  Estoque Esgotado
                </h3>
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mt-2">
                  Tente ajustar seus filtros de busca
                </p>
                <Button
                  variant="outline"
                  onClick={handleResetFilters}
                  className="mt-8 border-primary text-primary hover:bg-primary hover:text-black font-black uppercase italic rounded-xl transition-all"
                >
                  Resetar Arsenal
                </Button>
              </motion.div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
