import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Flame,
  TrendingDown,
  Sparkles,
  Trophy,
  ShieldCheck,
  RefreshCw,
  Link2,
  Dumbbell,
  FlaskConical,
  Pill,
  Watch,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import SEOHead from "@/Components/SEOHead";
import { ProductCard } from "@/Components/ProductCard";
import { Button } from "@/Components/ui/button";
import SearchBarSticky from "@/Components/SearchBarSticky";
import { openMonitorInfoDialog } from "@/Components/monitoring/MonitorInfoDialog";
import {
  dedupeCatalogProducts,
} from "@/lib/catalog";
import { resolvePricePresentation, resolvePromotionMetrics } from "@/lib/pricing.js";
import { useAuth } from "@/hooks/useAuth";

const BEST_DEAL_MIN_DISCOUNT = 20;
const BEST_DEAL_POOL_LIMIT = 600;
const BEST_DEAL_MAX_VERIFY_AGE_HOURS = 12;
const BEST_DEAL_MAX_VERIFY_AGE_MS = BEST_DEAL_MAX_VERIFY_AGE_HOURS * 60 * 60 * 1000;
const BEST_DEAL_FALLBACK_MAX_AGE_HOURS = 24;
const BEST_DEAL_FALLBACK_MAX_AGE_MS = BEST_DEAL_FALLBACK_MAX_AGE_HOURS * 60 * 60 * 1000;
const RELIABLE_PRICE_SOURCES = new Set([
  "auth",
  "public",
  "manual",
  "api",
  "api_base",
  "api_pix",
  "catalog",
  "catalog_ingest",
  "scraper",
]);
const CAROUSEL_ITEM_CLASS =
  "shrink-0 basis-[calc((100%_-_16px)/2)] md:basis-[calc((100%_-_32px)/3)] lg:basis-[calc((100%_-_48px)/4)]";
const CAROUSEL_SKELETON_HEIGHT = "h-56";
const CAROUSEL_BUTTON_CLASS =
  "h-11 w-11 sm:h-14 sm:w-14 rounded-full border-2 border-zinc-300 bg-white text-zinc-700 shadow-[0_18px_36px_rgba(15,23,42,0.22)] backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:scale-[1.05] hover:bg-zinc-100 hover:text-zinc-900 hover:shadow-[0_22px_40px_rgba(15,23,42,0.26)]";
const VISIBLE_PRODUCTS_FILTER =
  "and(is_active.eq.true,status.eq.active,data_health_status.eq.HEALTHY,auto_disabled_reason.is.null),and(is_active.eq.true,status.eq.active,data_health_status.eq.HEALTHY,auto_disabled_reason.neq.blocked)";
const CAROUSEL_LIMIT = 16;
const CATEGORY_PRIORITY = ["suplement", "equip", "acessor", "roupa"];

const PRODUCT_SELECT_BASE =
  "id, name, slug, price, pix_price, original_price, previous_price, previous_price_source, previous_price_expires_at, detected_at, last_sync, updated_at, image_url, images, affiliate_link, source_url, canonical_offer_url, ml_item_id, is_active, status, auto_disabled_reason, affiliate_verified, is_featured, is_on_sale, discount_percentage, free_shipping, marketplace, category_id, clicks_count, curation_badges";
const PRODUCT_SELECT_WITH_SOURCE =
  "id, name, slug, price, pix_price, original_price, previous_price, previous_price_source, previous_price_expires_at, detected_at, last_sync, last_price_source, last_price_verified_at, updated_at, image_url, images, affiliate_link, source_url, canonical_offer_url, ml_item_id, is_active, status, auto_disabled_reason, affiliate_verified, is_featured, is_on_sale, discount_percentage, free_shipping, marketplace, category_id, clicks_count, curation_badges";

const HERO_SLIDES = [
  {
    id: "monitor",
    eyebrow: "Monitoramento inteligente",
    title: "Ative o alerta e seja avisado quando o preço baixar",
    description:
      "Acompanhe seus produtos sem esforço e receba e-mail somente quando houver queda real.",
    primaryCta: "Monitorar preço",
    secondary: "Sem spam: alerta apenas com queda confirmada",
    imageSrc: "/hero/hero-2.jpg",
    imageClass: "object-[50%_24%] md:object-[50%_30%]",
  },
  {
    id: "ofertas",
    eyebrow: "Curadoria ArsenalFit",
    title: "As melhores ofertas reais do dia, direto das lojas oficiais",
    description:
      "Preços monitorados e links oficiais pra comprar com confiança.",
    primaryCta: "Ver as melhores ofertas",
    secondary: "Atualizações frequentes ao longo do dia",
    imageSrc: "/hero/hero-4.jpg",
    imageClass: "object-[52%_32%] md:object-[50%_38%]",
  },
  {
    id: "fidelidade",
    eyebrow: "Perfil e fidelidade ArsenalFit",
    title: "Seu painel de atleta para evoluir com o time de elite",
    description:
      "Tenha histórico, preferências e monitoramentos salvos para comprar melhor todos os dias.",
    primaryCta: "Criar conta agora",
    secondary: "Acesso rápido ao seu painel de atleta",
    imageSrc: "/hero/hero-5.jpg",
    imageClass: "object-[54%_30%] md:object-[52%_34%]",
  },
] as const;

type CategoryRow = {
  id: string;
  name: string;
  slug: string | null;
  image_url?: string | null;
  products?: { count: number }[];
};

const normalizeLabel = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const mergeUnique = <T extends { id: string }>(...lists: (T[] | undefined)[]) => {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const list of lists) {
    if (!list) continue;
    for (const item of list) {
      if (!item || !item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
};

const dedupeByCatalog = <T extends { id: string }>(items: T[]) =>
  dedupeCatalogProducts(items as any[]) as T[];

const ShakerIcon = ({ size = 18, className = "" }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M8.5 3a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.6H8.5V3Z" />
    <path d="M6.2 5.3h11.6a2.2 2.2 0 0 1 2.2 2.2v1.4a2.2 2.2 0 0 1-2.2 2.2H6.2A2.2 2.2 0 0 1 4 8.9V7.5a2.2 2.2 0 0 1 2.2-2.2Z" />
    <path d="M7.8 11.1h8.4l-1 8.4a2.2 2.2 0 0 1-2.2 1.9h-2a2.2 2.2 0 0 1-2.2-1.9l-1-8.4Z" />
    <path d="M8.8 14.6c1.1-.7 2.4-.8 3.6-.4.9.3 1.8.3 2.6-.1l-.45 3.4c-.1.9-.6 1.4-1.6 1.4h-1.8c-.9 0-1.4-.5-1.6-1.4l-.3-2.9Z" fill="#FFFFFF" fillOpacity="0.35" />
    <path d="M9 5.3h3.7c1 0 1.8.4 2.3 1.1l.7 1.2H9V5.3Z" fill="#FFFFFF" fillOpacity="0.18" />
  </svg>
);

const buildCategoryPattern = (rgb: string) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'><g fill='rgba(${rgb},0.18)'><circle cx='12' cy='12' r='2'/><circle cx='70' cy='28' r='2'/><circle cx='118' cy='18' r='2'/><circle cx='28' cy='70' r='2'/><circle cx='92' cy='76' r='2'/><circle cx='16' cy='118' r='2'/><circle cx='78' cy='122' r='2'/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

const isVitaminCategory = (name: string, slug?: string | null) => {
  const normalized = normalizeLabel(name);
  const normalizedSlug = normalizeLabel(slug ?? "");
  return normalized.includes("vitamin") || normalizedSlug.includes("vitamin");
};

const isClothingCategory = (name: string, slug?: string | null) => {
  const normalized = normalizeLabel(name);
  const normalizedSlug = normalizeLabel(slug ?? "");
  return (
    normalized.includes("roupa") ||
    normalized.includes("vestu") ||
    normalizedSlug.includes("roupa") ||
    normalizedSlug.includes("vestu")
  );
};

const getCategoryPriority = (category: { name: string; slug?: string | null }) => {
  const normalized = normalizeLabel(`${category.name ?? ""} ${category.slug ?? ""}`);
  const index = CATEGORY_PRIORITY.findIndex((key) => normalized.includes(key));
  return index === -1 ? CATEGORY_PRIORITY.length : index;
};

const CATEGORY_VISUALS = [
  {
    key: "suplement",
    icon: ShakerIcon,
    accentRgb: "132,204,22",
    iconClass: "bg-lime-100 text-lime-700",
  },
  {
    key: "equip",
    icon: Dumbbell,
    accentRgb: "56,189,248",
    iconClass: "bg-sky-100 text-sky-700",
  },
  {
    key: "acessor",
    icon: Watch,
    accentRgb: "249,115,22",
    iconClass: "bg-orange-100 text-orange-700",
  },
  {
    key: "vitamin",
    icon: Pill,
    accentRgb: "16,185,129",
    iconClass: "bg-emerald-100 text-emerald-700",
  },
  {
    key: "roupa",
    icon: Watch,
    accentRgb: "168,85,247",
    iconClass: "bg-purple-100 text-purple-700",
  },
];

const CATEGORY_IMAGE_FALLBACK = [
  {
    key: "suplement",
    image: "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=1200",
  },
  {
    key: "equip",
    image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200",
  },
  {
    key: "acessor",
    image: "https://images.unsplash.com/photo-1576243345690-4e4b79b63288?w=1200",
  },
  {
    key: "vitamin",
    image: "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=1200",
  },
  {
    key: "roupa",
    image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200",
  },
];

const getCategoryVisual = (name: string) => {
  const normalized = normalizeLabel(name);
  const found = CATEGORY_VISUALS.find((item) => normalized.includes(item.key));
  return (
    found ?? {
      key: "default",
      icon: FlaskConical,
      accentRgb: "148,163,184",
      iconClass: "bg-zinc-100 text-zinc-600",
    }
  );
};

const getCategoryImage = (name: string, slug?: string | null) => {
  const normalized = normalizeLabel(name);
  const normalizedSlug = normalizeLabel(slug ?? "");
  const found = CATEGORY_IMAGE_FALLBACK.find((item) => {
    return normalized.includes(item.key) || normalizedSlug.includes(item.key);
  });
  return found?.image ?? null;
};

const useSectionInView = ({
  rootMargin = "0px",
  threshold = 0.1,
  once = true,
}: {
  rootMargin?: string;
  threshold?: number;
  once?: boolean;
} = {}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin, threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, threshold, once]);

  return { ref, inView };
};

const useCarouselState = (
  ref: React.RefObject<HTMLDivElement | null>,
  itemCount: number,
) => {
  const [state, setState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
    pageIndex: 0,
    pageCount: 1,
  });

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    let paddingLeft = 0;
    let paddingRight = 0;

    const readPadding = () => {
      if (typeof window === "undefined") return;
      const style = window.getComputedStyle(container);
      paddingLeft = Number.parseFloat(style.paddingLeft || "0") || 0;
      paddingRight = Number.parseFloat(style.paddingRight || "0") || 0;
    };

    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      if (!clientWidth) {
        setState((prev) => {
          const next = {
            canScrollLeft: false,
            canScrollRight: false,
            pageIndex: 0,
            pageCount: 1,
          };
          if (
            prev.canScrollLeft === next.canScrollLeft &&
            prev.canScrollRight === next.canScrollRight &&
            prev.pageIndex === next.pageIndex &&
            prev.pageCount === next.pageCount
          ) {
            return prev;
          }
          return next;
        });
        return;
      }

      const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
      const pageCount = Math.max(1, Math.round(scrollWidth / clientWidth));
      const progress = maxScrollLeft > 0 ? scrollLeft / maxScrollLeft : 0;
      const pageIndex = Math.min(
        pageCount - 1,
        Math.round(progress * (pageCount - 1)),
      );

      const edgeEpsilon = 4;
      const canScrollLeft = scrollLeft > paddingLeft + edgeEpsilon;
      const canScrollRight = scrollLeft < maxScrollLeft - paddingRight - edgeEpsilon;

      setState((prev) => {
        const next = { canScrollLeft, canScrollRight, pageIndex, pageCount };
        if (
          prev.canScrollLeft === next.canScrollLeft &&
          prev.canScrollRight === next.canScrollRight &&
          prev.pageIndex === next.pageIndex &&
          prev.pageCount === next.pageCount
        ) {
          return prev;
        }
        return next;
      });
    };

    const handleResize = () => {
      readPadding();
      update();
    };

    const raf = requestAnimationFrame(handleResize);
    container.addEventListener("scroll", update, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
    } else {
      window.addEventListener("resize", handleResize);
    }

    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener("scroll", update);
      if (resizeObserver) resizeObserver.disconnect();
      else window.removeEventListener("resize", handleResize);
    };
  }, [ref, itemCount]);

  return state;
};

export default function HomeV2() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isLoggedIn = Boolean(user?.id);

  const bestDealsCarouselRef = useRef<HTMLDivElement | null>(null);
  const priceDropsCarouselRef = useRef<HTMLDivElement | null>(null);
  const eliteCarouselRef = useRef<HTMLDivElement | null>(null);
  const previewCarouselRef = useRef<HTMLDivElement | null>(null);
  const { ref: bestDealsRef } = useSectionInView({
    rootMargin: "320px",
    threshold: 0.1,
  });
  const { ref: dropsRef } = useSectionInView({
    rootMargin: "320px",
    threshold: 0.1,
  });
  const { ref: eliteRef } = useSectionInView({
    rootMargin: "320px",
    threshold: 0.1,
  });
  const productsRef = useRef<HTMLDivElement | null>(null);

  const showHighlights = true;
  const prefersReducedMotion = useReducedMotion();
  const [heroSlideIndex, setHeroSlideIndex] = useState(0);
  const [heroTouchStartX, setHeroTouchStartX] = useState<number | null>(null);
  const [isHeroHovered, setIsHeroHovered] = useState(false);
  const [isHeroFocused, setIsHeroFocused] = useState(false);
  const [isHeroInteracted, setIsHeroInteracted] = useState(false);
  const heroInteractionTimeoutRef = useRef<number | null>(null);
  const [priceSourceSupported, setPriceSourceSupported] = useState<boolean | null>(null);
  const heroSlide = HERO_SLIDES[heroSlideIndex % HERO_SLIDES.length];
  const isOffersSlide = heroSlide.id === "ofertas";

  const registerHeroInteraction = () => {
    setIsHeroInteracted(true);
    if (heroInteractionTimeoutRef.current) {
      window.clearTimeout(heroInteractionTimeoutRef.current);
    }
    heroInteractionTimeoutRef.current = window.setTimeout(() => {
      setIsHeroInteracted(false);
      heroInteractionTimeoutRef.current = null;
    }, 12000);
  };

  const goToHeroSlide = (targetIndex: number, fromInteraction = false) => {
    const count = HERO_SLIDES.length;
    const normalized = ((targetIndex % count) + count) % count;
    if (fromInteraction) registerHeroInteraction();
    setHeroSlideIndex(normalized);
  };

  const goToNextHeroSlide = (fromInteraction = false) => {
    goToHeroSlide(heroSlideIndex + 1, fromInteraction);
  };

  const goToPrevHeroSlide = (fromInteraction = false) => {
    goToHeroSlide(heroSlideIndex - 1, fromInteraction);
  };

  useEffect(() => {
    if (HERO_SLIDES.length <= 1) return;
    if (prefersReducedMotion) return;
    if (isHeroHovered || isHeroFocused || isHeroInteracted) return;

    const id = window.setInterval(() => {
      setHeroSlideIndex((current) => (current + 1) % HERO_SLIDES.length);
    }, 8000);

    return () => window.clearInterval(id);
  }, [prefersReducedMotion, isHeroHovered, isHeroFocused, isHeroInteracted]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (HERO_SLIDES.length <= 1) return;

    const next = HERO_SLIDES[(heroSlideIndex + 1) % HERO_SLIDES.length];
    const prev = HERO_SLIDES[(heroSlideIndex - 1 + HERO_SLIDES.length) % HERO_SLIDES.length];
    const nextImg = new Image();
    const prevImg = new Image();
    nextImg.src = next.imageSrc;
    prevImg.src = prev.imageSrc;
  }, [heroSlideIndex]);

  useEffect(() => {
    return () => {
      if (heroInteractionTimeoutRef.current) {
        window.clearTimeout(heroInteractionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const origin = window.location.origin;
    const schema = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "ArsenalFit",
      url: origin,
      potentialAction: {
        "@type": "SearchAction",
        target: `${origin}/produtos?search={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    };

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-schema", "website");
    script.text = JSON.stringify(schema);
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  const isMissingPriceSourceColumn = (error: any) => {
    const message = String(error?.message || "").toLowerCase();
    return (
      message.includes("last_price_source") ||
      message.includes("last_price_verified_at")
    );
  };

  const fetchProductsSafe = async (buildQuery: (select: string) => any) => {
    if (priceSourceSupported === false) {
      const fallback = (await buildQuery(PRODUCT_SELECT_BASE)) as {
        data: any[] | null;
        error: any;
      };
      if (fallback.error) throw fallback.error;
      return fallback.data ?? [];
    }

    const primary = (await buildQuery(PRODUCT_SELECT_WITH_SOURCE)) as {
      data: any[] | null;
      error: any;
    };
    if (!primary.error) {
      if (priceSourceSupported !== true) setPriceSourceSupported(true);
      return primary.data ?? [];
    }

    if (isMissingPriceSourceColumn(primary.error)) {
      if (priceSourceSupported !== false) setPriceSourceSupported(false);
      const fallback = (await buildQuery(PRODUCT_SELECT_BASE)) as {
        data: any[] | null;
        error: any;
      };
      if (fallback.error) throw fallback.error;
      return fallback.data ?? [];
    }

    throw primary.error;
  };

  const {
    data: activeOffersCount = 0,
    isLoading: activeOffersLoading,
  } = useQuery({
    queryKey: ["home-v2", "active-offers-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("is_blocked", false)
        .or(VISIBLE_PRODUCTS_FILTER);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 20 * 1000,
    refetchInterval: 30 * 1000,
  });

  const formattedActiveOffers = useMemo(
    () => new Intl.NumberFormat("pt-BR").format(activeOffersCount),
    [activeOffersCount],
  );

  useEffect(() => {
    const channel = supabase
      .channel("home-v2-active-offers-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["home-v2", "active-offers-count"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: categories = [] } = useQuery({
    queryKey: ["home-v2", "categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, image_url, products(count)")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
  });

  const categoriesWithCount = useMemo(() => {
    return categories.map((cat) => {
      const count = Array.isArray(cat.products)
        ? cat.products[0]?.count ?? 0
        : 0;
      return {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        image_url: cat.image_url ?? null,
        count,
      };
    });
  }, [categories]);

  const filteredCategories = useMemo(() => {
    const base = categoriesWithCount.filter(
      (cat) => !isVitaminCategory(cat.name, cat.slug),
    );

    const hasRoupas = base.some((cat) => isClothingCategory(cat.name, cat.slug));

    if (!hasRoupas) {
      base.push({
        id: "virtual-roupas",
        name: "Roupas",
        slug: "roupas",
        image_url: null,
        count: 0,
      });
    }

    return base;
  }, [categoriesWithCount]);

  const { data: categoryClickData = [] } = useQuery({
    queryKey: ["home-v2", "category-clicks"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("products")
        .select("id, category_id, clicks_count, updated_at")
        .or(VISIBLE_PRODUCTS_FILTER)
        .gte("updated_at", since)
        .order("clicks_count", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const categoryClicksMeta = useMemo(() => {
    const clickMap = new Map<string, number>();
    const allowedIds = new Set(filteredCategories.map((cat) => cat.id));

    for (const item of categoryClickData as any[]) {
      if (!item?.category_id) continue;
      if (!allowedIds.has(item.category_id)) continue;
      const clicks = typeof item.clicks_count === "number" ? item.clicks_count : 0;
      clickMap.set(item.category_id, (clickMap.get(item.category_id) || 0) + clicks);
    }

    let topCategoryId: string | null = null;
    let topClicks = 0;
    for (const [categoryId, clicks] of clickMap.entries()) {
      if (clicks > topClicks) {
        topClicks = clicks;
        topCategoryId = categoryId;
      }
    }

    const totalClicks = Array.from(clickMap.values()).reduce(
      (sum, value) => sum + value,
      0,
    );

    return { clickMap, totalClicks, topCategoryId };
  }, [categoryClickData, filteredCategories]);

  const highlightCategoryId = useMemo(() => {
    if (filteredCategories.length === 0) return null;

    if (categoryClicksMeta.totalClicks > 0 && categoryClicksMeta.topCategoryId) {
      return categoryClicksMeta.topCategoryId;
    }

    const prioritized = [...filteredCategories].sort(
      (a, b) => getCategoryPriority(a) - getCategoryPriority(b)
    );
    if (prioritized.length && getCategoryPriority(prioritized[0]) < CATEGORY_PRIORITY.length) {
      return prioritized[0].id;
    }

    const mostProducts = [...filteredCategories].sort((a, b) => b.count - a.count)[0];
    if (mostProducts) return mostProducts.id;

    const suplementos = filteredCategories.find((cat) =>
      normalizeLabel(cat.name).includes("suplement"),
    );
    return suplementos?.id ?? filteredCategories[0]?.id ?? null;
  }, [filteredCategories, categoryClicksMeta]);

  const quickCategories = useMemo(() => {
    if (filteredCategories.length === 0) return [];

    const { clickMap, totalClicks } = categoryClicksMeta;

    const sorted = [...filteredCategories].sort((a, b) => {
      if (totalClicks > 0) {
        const clicksA = clickMap.get(a.id) || 0;
        const clicksB = clickMap.get(b.id) || 0;
        if (clicksA !== clicksB) return clicksB - clicksA;
      } else {
        const priorityA = getCategoryPriority(a);
        const priorityB = getCategoryPriority(b);
        if (priorityA !== priorityB) return priorityA - priorityB;
      }
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });

    let selection = sorted.slice(0, 4);

    const roupasCategory = filteredCategories.find((cat) =>
      isClothingCategory(cat.name, cat.slug),
    );

    if (roupasCategory && !selection.find((cat) => cat.id === roupasCategory.id)) {
      if (selection.length < 4) {
        selection = [...selection, roupasCategory];
      } else {
        selection = [...selection.slice(0, 3), roupasCategory];
      }
    }

    if (highlightCategoryId) {
      const highlight = filteredCategories.find((cat) => cat.id === highlightCategoryId);
      if (highlight) {
        selection = [highlight, ...selection.filter((cat) => cat.id !== highlight.id)];
      }
    }

    return selection.slice(0, 4);
  }, [filteredCategories, categoryClicksMeta, highlightCategoryId]);

  const popularCategories = useMemo(() => {
    return [...categoriesWithCount]
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [categoriesWithCount]);

  const { data: previewData = [], isLoading: previewLoading } = useQuery({
    queryKey: ["home-v2", "preview-products"],
    queryFn: async () => {
      return fetchProductsSafe((select) =>
        supabase
          .from("products")
          .select(select)
          .eq("is_blocked", false)
          .or(VISIBLE_PRODUCTS_FILTER)
          .order("updated_at", { ascending: false })
          .limit(CAROUSEL_LIMIT),
      );
    },
  });

  const { data: bestDealsData = [], isLoading: bestDealsLoading } = useQuery({
    queryKey: ["home-v2", "best-deals"],
    queryFn: async () => {
      return fetchProductsSafe((select) =>
        supabase
          .from("products")
          .select(select)
          .eq("is_blocked", false)
          .or(VISIBLE_PRODUCTS_FILTER)
          .order("updated_at", { ascending: false })
          .limit(BEST_DEAL_POOL_LIMIT),
      );
    },
  });

  const bestDealsMeta = useMemo(() => {
    const nowMs = Date.now();
    const basePool = dedupeByCatalog(
      (bestDealsData || []).filter((product: any) => product.is_active !== false),
    );
    if (basePool.length === 0) return { items: [], primaryCount: 0, fallbackUsed: false };

    const isMercadoLivre = (product: any) =>
      String(product.marketplace || "").toLowerCase().includes("mercado");

    const hasSourceField = basePool.some((product: any) =>
      Object.prototype.hasOwnProperty.call(product, "last_price_source"),
    );
    const supportsPriceSource =
      priceSourceSupported === false ? false : hasSourceField;

    const isReliableForBestDeals = (product: any) => {
      if (!supportsPriceSource) return true;
      if (!isMercadoLivre(product)) return true;
      const source = String(product.last_price_source || "").toLowerCase();
      if (!RELIABLE_PRICE_SOURCES.has(source)) return false;
      const verifiedAt = product.last_price_verified_at;
      if (!verifiedAt) return false;
      const verifiedMs = new Date(verifiedAt).getTime();
      if (!Number.isFinite(verifiedMs)) return false;
      return nowMs - verifiedMs <= BEST_DEAL_MAX_VERIFY_AGE_MS;
    };

    const reliablePool = basePool.filter(isReliableForBestDeals);

    const getLastUpdatedMs = (product: any) => {
      const lastUpdated =
        product.detected_at || product.last_sync || product.updated_at || null;
      const lastUpdatedMs = lastUpdated ? new Date(lastUpdated).getTime() : 0;
      return Number.isFinite(lastUpdatedMs) ? lastUpdatedMs : 0;
    };

    const fallbackPool = basePool.filter((product: any) => {
      if (isMercadoLivre(product) && !product.last_sync) return false;
      const lastUpdatedMs = getLastUpdatedMs(product);
      if (!lastUpdatedMs) return false;
      return nowMs - lastUpdatedMs <= BEST_DEAL_FALLBACK_MAX_AGE_MS;
    });

    const fallbackUsed = !supportsPriceSource || reliablePool.length === 0;
    const pool = fallbackUsed
      ? fallbackPool.length
        ? fallbackPool
        : basePool
      : reliablePool;
    if (pool.length === 0) return { items: [], primaryCount: 0, fallbackUsed };

    const candidates = pool
      .map((product: any) => {
        const promo = resolvePromotionMetrics(product);
        const pricing = resolvePricePresentation(product);
        const usesPix = Boolean(pricing.pixPrice);
        const lastUpdated =
          product.detected_at || product.last_sync || product.updated_at || null;
        const lastUpdatedMs = lastUpdated ? new Date(lastUpdated).getTime() : 0;
        return {
          product,
          prev: promo.anchor,
          usesPix,
          discountValue: promo.discountValue,
          discountPercent: promo.discountPercent,
          lastUpdatedMs,
        };
      })
      .filter((item) => item.discountPercent > 0);

    const rankingSource = candidates.filter(
      (item) => item.discountPercent >= BEST_DEAL_MIN_DISCOUNT,
    );

    if (rankingSource.length === 0) {
      const fallbackProducts = [...pool]
        .map((product: any) => {
          const pricing = resolvePricePresentation(product);
          const primaryPrice = toNumber(pricing.displayPricePrimary ?? pricing.finalPrice) ?? 0;
          return {
            product,
            primaryPrice,
            featured: product?.is_featured === true ? 1 : 0,
            clicks: Number(product?.clicks_count ?? 0) || 0,
            lastUpdatedMs: getLastUpdatedMs(product),
          };
        })
        .filter((item) => item.primaryPrice > 0)
        .sort((a, b) => {
          if (b.featured !== a.featured) return b.featured - a.featured;
          if (b.clicks !== a.clicks) return b.clicks - a.clicks;
          return (b.lastUpdatedMs ?? 0) - (a.lastUpdatedMs ?? 0);
        })
        .map((item) => item.product);

      return {
        items: fallbackProducts,
        primaryCount: fallbackProducts.length,
        fallbackUsed: true,
      };
    }

    rankingSource.sort((a, b) => {
      const pixA = a.usesPix ? 1 : 0;
      const pixB = b.usesPix ? 1 : 0;
      if (pixA !== pixB) return pixB - pixA;
      if (b.discountPercent !== a.discountPercent)
        return b.discountPercent - a.discountPercent;
      return (b.lastUpdatedMs ?? 0) - (a.lastUpdatedMs ?? 0);
    });

    const usedCategories = new Set<string>();
    const diversified: typeof rankingSource = [];
    const fallback: typeof rankingSource = [];

    for (const item of rankingSource) {
      const categoryId = item.product.category_id || "sem-categoria";
      if (!usedCategories.has(categoryId)) {
        usedCategories.add(categoryId);
        diversified.push(item);
      } else {
        fallback.push(item);
      }
    }

    const primaryProducts = [...diversified, ...fallback].map(
      (item) => item.product,
    );

    return {
      items: primaryProducts,
      primaryCount: primaryProducts.length,
      fallbackUsed,
    };
  }, [bestDealsData, priceSourceSupported]);

  const bestDeals = bestDealsMeta.items;
  const bestDealsFallbackUsed = Boolean(bestDealsMeta.fallbackUsed);

  const { data: dropsData = [], isLoading: dropsLoading } = useQuery({
    queryKey: ["home-v2", "price-drops"],
    queryFn: async () => {
      return fetchProductsSafe((select) =>
        supabase
          .from("products")
          .select(select)
          .eq("is_blocked", false)
          .or(VISIBLE_PRODUCTS_FILTER)
          .order("updated_at", { ascending: false })
          .limit(BEST_DEAL_POOL_LIMIT),
      );
    },
  });

  const { data: lowPriceData = [] } = useQuery({
    queryKey: ["home-v2", "low-price"],
    queryFn: async () => {
      return fetchProductsSafe((select) =>
        supabase
          .from("products")
          .select(select)
          .eq("is_blocked", false)
          .or(VISIBLE_PRODUCTS_FILTER)
          .order("price", { ascending: true })
          .limit(16),
      );
    },
  });

  const priceDropsToday = useMemo(() => {
    const allDropsCandidates = dedupeByCatalog(dropsData || []);
    const bestDealIds = new Set((bestDeals || []).map((product: any) => product.id));

    const primary = allDropsCandidates
      .filter((product: any) => {
        if (bestDealIds.has(product.id)) return false;
        const promo = resolvePromotionMetrics(product);
        const hasDrop = promo.anchor !== null && promo.anchor > promo.price;
        const discountPercent = promo.discountPercent;
        return hasDrop && discountPercent > 0 && discountPercent < BEST_DEAL_MIN_DISCOUNT;
      })
      .map((product: any) => {
        const promo = resolvePromotionMetrics(product);
        const discountPercent = promo.discountPercent;
        const dropValue = promo.discountValue;
        const lastUpdated =
          product.detected_at || product.last_sync || product.updated_at || null;
        const lastUpdatedMs = lastUpdated ? new Date(lastUpdated).getTime() : 0;
        return { product, discountPercent, dropValue, lastUpdatedMs };
      })
      .sort((a, b) => {
        if (b.discountPercent !== a.discountPercent)
          return b.discountPercent - a.discountPercent;
        if (b.lastUpdatedMs !== a.lastUpdatedMs)
          return b.lastUpdatedMs - a.lastUpdatedMs;
        return b.dropValue - a.dropValue;
      })
      .map((item) => item.product);

    if (primary.length > 0) return primary;

    const fallbackPromos = allDropsCandidates
      .map((product: any) => {
        if (bestDealIds.has(product.id)) {
          return { product: null, discountPercent: 0, lastUpdatedMs: 0 };
        }
        const promo = resolvePromotionMetrics(product);
        const discountPercent = promo.discountPercent;
        const lastUpdated =
          product.detected_at || product.last_sync || product.updated_at || null;
        const lastUpdatedMs = lastUpdated ? new Date(lastUpdated).getTime() : 0;
        return { product, discountPercent, lastUpdatedMs };
      })
      .filter((item) => item.product && item.discountPercent > 0 && item.discountPercent < BEST_DEAL_MIN_DISCOUNT)
      .sort((a, b) => {
        if (b.discountPercent !== a.discountPercent)
          return b.discountPercent - a.discountPercent;
        return (b.lastUpdatedMs ?? 0) - (a.lastUpdatedMs ?? 0);
      })
      .map((item) => item.product);

    if (fallbackPromos.length > 0) return fallbackPromos;

    const fallbackRecent = allDropsCandidates
      .map((product: any) => {
        if (bestDealIds.has(product.id)) {
          return {
            product: null,
            primaryPrice: 0,
            featured: 0,
            clicks: 0,
            lastUpdatedMs: 0,
          };
        }
        const pricing = resolvePricePresentation(product);
        const primaryPrice = Number(pricing.displayPricePrimary || pricing.finalPrice || 0);
        const promo = resolvePromotionMetrics(product);
        const discountPercent = promo.discountPercent;
        const lastUpdated =
          product.detected_at || product.last_sync || product.updated_at || null;
        const lastUpdatedMs = lastUpdated ? new Date(lastUpdated).getTime() : 0;
        return {
          product,
          primaryPrice,
          discountPercent,
          featured: product?.is_featured === true ? 1 : 0,
          clicks: Number(product?.clicks_count ?? 0) || 0,
          lastUpdatedMs,
        };
      })
      .filter((item) => item.product && item.primaryPrice > 0 && item.discountPercent < BEST_DEAL_MIN_DISCOUNT)
      .sort((a, b) => {
        if (b.featured !== a.featured) return b.featured - a.featured;
        if (b.clicks !== a.clicks) return b.clicks - a.clicks;
        return (b.lastUpdatedMs ?? 0) - (a.lastUpdatedMs ?? 0);
      })
      .map((item) => item.product);

    return fallbackRecent;
  }, [dropsData, bestDeals]);

  const { data: eliteData = [], isLoading: eliteLoading } = useQuery({
    queryKey: ["home-v2", "elite"],
    queryFn: async () => {
      return fetchProductsSafe((select) =>
        supabase
          .from("products")
          .select(select)
          .eq("is_blocked", false)
          .or(VISIBLE_PRODUCTS_FILTER)
          .order("price", { ascending: false })
          .limit(120),
      );
    },
  });

  const { data: eliteFallbackData = [] } = useQuery({
      queryKey: ["home-v2", "elite-fallback"],
      queryFn: async () => {
        return fetchProductsSafe((select) =>
          supabase
            .from("products")
            .select(select)
            .eq("is_blocked", false)
            .or(VISIBLE_PRODUCTS_FILTER)
            .order("is_featured", { ascending: false })
            .order("clicks_count", { ascending: false })
            .order("updated_at", { ascending: false })
            .limit(30),
        );
      },
    });

  const eliteProducts = useMemo(() => {
    const pool = dedupeByCatalog(
      mergeUnique(eliteData, eliteFallbackData, bestDealsData, previewData).filter(
        (product: any) => product?.is_active !== false,
      ),
    );

    const getUpdatedMs = (product: any) => {
      const ref = product?.detected_at || product?.last_sync || product?.updated_at || null;
      const ms = ref ? new Date(ref).getTime() : 0;
      return Number.isFinite(ms) ? ms : 0;
    };

    const sorted = [...pool].sort((a: any, b: any) => {
      const aPricing = resolvePricePresentation(a);
      const bPricing = resolvePricePresentation(b);

      const aPrice = Number(aPricing.displayPricePrimary || a.price || 0);
      const bPrice = Number(bPricing.displayPricePrimary || b.price || 0);
      if (bPrice !== aPrice) return bPrice - aPrice;

      const aList =
        typeof aPricing.displayStrikethrough === "number" ? aPricing.displayStrikethrough : null;
      const bList =
        typeof bPricing.displayStrikethrough === "number" ? bPricing.displayStrikethrough : null;
      const aDiscount = aList && aList > 0 ? ((aList - aPrice) / aList) * 100 : 0;
      const bDiscount = bList && bList > 0 ? ((bList - bPrice) / bList) * 100 : 0;
      if (bDiscount !== aDiscount) return bDiscount - aDiscount;

      return getUpdatedMs(b) - getUpdatedMs(a);
    });

    const usedCategories = new Set<string>();
    const diversified: any[] = [];
    const overflow: any[] = [];

    for (const product of sorted) {
      const categoryId = product?.category_id || "sem-categoria";
      if (!usedCategories.has(categoryId)) {
        usedCategories.add(categoryId);
        diversified.push(product);
      } else {
        overflow.push(product);
      }
    }

    return [...diversified, ...overflow].slice(0, CAROUSEL_LIMIT);
  }, [eliteData, eliteFallbackData, bestDealsData, previewData]);

  const previewProducts = useMemo(() => {
    const merged = dedupeByCatalog(
      mergeUnique(previewData, bestDealsData, eliteData, lowPriceData).filter(
        (product: any) => product?.is_active !== false,
      ),
    );
    const sorted = [...merged].sort((a: any, b: any) => {
      const aMs = new Date(a?.updated_at || a?.last_sync || a?.detected_at || 0).getTime();
      const bMs = new Date(b?.updated_at || b?.last_sync || b?.detected_at || 0).getTime();
      return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
    });
    return sorted.slice(0, CAROUSEL_LIMIT);
  }, [previewData, bestDealsData, eliteData, lowPriceData]);

  const previewProductsLimited = useMemo(
    () => previewProducts.slice(0, CAROUSEL_LIMIT),
    [previewProducts],
  );

  const previewSlots = useMemo(
    () => Math.max(0, CAROUSEL_LIMIT - previewProductsLimited.length),
    [previewProductsLimited],
  );

  const bestDealsShow = useMemo(() => bestDeals, [bestDeals]);

  const bestDealsShowLimited = useMemo(
    () => bestDealsShow,
    [bestDealsShow],
  );

  const bestDealsSlots = useMemo(
    () => Math.max(0, CAROUSEL_LIMIT - bestDealsShowLimited.length),
    [bestDealsShowLimited],
  );

  const hotCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    const bestDealIds = new Set(bestDealsShow.map((item: any) => item.id));
    const pool = dedupeByCatalog(mergeUnique(bestDealsData, dropsData, previewData, eliteData));

    for (const product of pool as any[]) {
      const categoryId = product?.category_id;
      if (!categoryId) continue;
      const pricing = resolvePricePresentation(product);
      const price = Number(pricing.displayPricePrimary || 0);
      const prevRaw =
        typeof pricing.displayStrikethrough === "number"
          ? pricing.displayStrikethrough
          : null;
      const prev = typeof prevRaw === "number" ? prevRaw : null;
      const hasDrop = prev !== null && prev > price;
      const isPromo = prev !== null && prev > price;
      const isFeatured = product.is_featured === true;
      const isCuratedPriority = Number(pricing.displayPricePrimary || product.price || 0) > 0;
      const isBestDeal = bestDealIds.has(product.id);

      if (isBestDeal || isPromo || hasDrop || isFeatured || isCuratedPriority) {
        ids.add(categoryId);
      }
    }

    return ids;
  }, [bestDealsShow, bestDealsData, dropsData, previewData, eliteData]);

  const priceDropsShow = useMemo(() => priceDropsToday, [priceDropsToday]);

  const priceDropsShowLimited = useMemo(
    () => priceDropsShow,
    [priceDropsShow],
  );

  const priceDropsFallbackUsed = false;

  const eliteShow = useMemo(() => {
    if (eliteProducts.length > 0) return eliteProducts;
    if (previewProducts.length > 0) return previewProducts.slice(0, CAROUSEL_LIMIT);
    return [];
  }, [eliteProducts, previewProducts]);

  const eliteShowLimited = useMemo(
    () => eliteShow.slice(0, CAROUSEL_LIMIT),
    [eliteShow],
  );

  const eliteSlots = useMemo(
    () => Math.max(0, CAROUSEL_LIMIT - eliteShowLimited.length),
    [eliteShowLimited],
  );

  const handleScrollToBestDeals = () => {
    document.getElementById("best-deals")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleHeroPrimaryAction = () => {
    if (heroSlide.id === "ofertas") {
      handleScrollToBestDeals();
      return;
    }

    if (heroSlide.id === "monitor") {
      openMonitorInfoDialog();
      return;
    }

    if (isLoggedIn) {
      navigate("/perfil");
      return;
    }

    navigate("/auth?mode=signup");
  };

  const handleHeroTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    setHeroTouchStartX(event.touches[0]?.clientX ?? null);
  };

  const handleHeroTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    if (heroTouchStartX === null) return;
    const touchEndX = event.changedTouches[0]?.clientX ?? heroTouchStartX;
    const delta = touchEndX - heroTouchStartX;
    setHeroTouchStartX(null);

    if (Math.abs(delta) < 30) return;
    if (delta < 0) {
      goToNextHeroSlide(true);
      return;
    }
    goToPrevHeroSlide(true);
  };

  const handleHeroKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToPrevHeroSlide(true);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goToNextHeroSlide(true);
    }
  };

  const scrollCarousel = (
    ref: React.RefObject<HTMLDivElement | null>,
    direction: "left" | "right",
  ) => {
    const container = ref.current;
    if (!container) return;
    const amount = container.clientWidth;
    container.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  const bestDealsCarouselState = useCarouselState(
    bestDealsCarouselRef,
    bestDealsShowLimited.length,
  );
  const priceDropsCarouselState = useCarouselState(
    priceDropsCarouselRef,
    priceDropsShowLimited.length,
  );
  const eliteCarouselState = useCarouselState(
    eliteCarouselRef,
    eliteShowLimited.length,
  );
  const previewCarouselState = useCarouselState(
    previewCarouselRef,
    previewProductsLimited.length,
  );

  return (
    <div className="min-h-screen bg-[#FBFBFB]">
      <SEOHead
        title="ArsenalFit | Curadoria Fitness com Preços Monitorados"
        description="Curadoria fitness com preços monitorados automaticamente. Ofertas reais com links oficiais."
        ogType="website"
      />

      <SearchBarSticky />
      <section
        className="relative min-h-[560px] sm:h-[480px] md:h-[600px] overflow-hidden text-white"
        onMouseEnter={() => setIsHeroHovered(true)}
        onMouseLeave={() => setIsHeroHovered(false)}
        onFocusCapture={() => setIsHeroFocused(true)}
        onBlurCapture={() => setIsHeroFocused(false)}
        onTouchStart={handleHeroTouchStart}
        onTouchEnd={handleHeroTouchEnd}
        onKeyDown={handleHeroKeyDown}
        tabIndex={0}
        style={{ touchAction: "pan-y" }}
        aria-label="Banners principais ArsenalFit"
        aria-roledescription="carousel"
      >
        <div className="absolute inset-0 z-0 bg-zinc-950" />
        <AnimatePresence mode="wait" initial={false}>
          <motion.img
            key={`${heroSlide.id}-bg`}
            src={heroSlide.imageSrc}
            alt=""
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 z-[1] h-full w-full object-cover ${heroSlide.imageClass}`}
            style={{ filter: "blur(3px) saturate(1.08)" }}
            initial={{ opacity: 0.12, scale: 1.04 }}
            animate={{ opacity: 0.5, scale: 1 }}
            exit={{ opacity: 0.12, scale: 1.02 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: "easeInOut" }}
          />
        </AnimatePresence>
        <div
          className={`absolute inset-0 z-[2] ${
            isOffersSlide
              ? "bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0.06)_0%,rgba(0,0,0,0.42)_68%,rgba(0,0,0,0.74)_100%)]"
              : "bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0.10)_0%,rgba(0,0,0,0.55)_68%,rgba(0,0,0,0.78)_100%)]"
          }`}
        />
        <div
          className={`absolute inset-0 z-[2] ${
            isOffersSlide
              ? "bg-gradient-to-r from-black/68 via-black/24 to-black/68"
              : "bg-gradient-to-r from-black/70 via-black/35 to-black/70"
          }`}
        />
        <div
          className={`absolute inset-0 z-[2] ${
            isOffersSlide
              ? "bg-gradient-to-b from-black/30 via-black/14 to-black/70"
              : "bg-gradient-to-b from-black/35 via-black/20 to-black/72"
          }`}
        />

        <div className="relative z-[3] mx-auto flex h-full w-full max-w-[1040px] items-start justify-center px-4 pt-14 pb-28 sm:px-6 sm:pt-16 sm:pb-24 md:items-center md:px-6 md:pt-0 md:pb-0 lg:px-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={heroSlide.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: "easeInOut" }}
              className="mx-auto w-full text-center"
              role="group"
              aria-label={`Slide ${heroSlideIndex + 1} de ${HERO_SLIDES.length}`}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-4 py-2 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-100">
                {heroSlide.eyebrow}
              </div>

              <h1 className="mx-auto mt-5 max-w-[860px] text-[28px] sm:text-[34px] md:text-[52px] font-black tracking-tight leading-[1.08]">
                {heroSlide.id === "fidelidade" && isLoggedIn
                  ? "Você já faz parte do time de elite"
                  : heroSlide.title}
              </h1>

              <p className="mx-auto mt-4 max-w-[820px] text-[18px] sm:text-base md:text-[18px] text-zinc-100/90 leading-relaxed">
                {heroSlide.id === "fidelidade" && isLoggedIn
                  ? "Seu perfil já está ativo. Continue evoluindo com monitoramentos e ofertas personalizadas."
                  : heroSlide.description}
              </p>

              <div className="mt-7 flex flex-col items-center gap-3">
                <Button
                  onClick={handleHeroPrimaryAction}
                  className="h-14 sm:h-16 px-8 sm:px-11 rounded-full bg-[#FF6A00] text-white hover:bg-[#e85f00] text-base sm:text-lg font-black shadow-[0_16px_40px_rgba(255,106,0,0.34)] hover:shadow-[0_22px_46px_rgba(255,106,0,0.40)] focus-visible:ring-4 focus-visible:ring-[#ff6a00]/40"
                >
                  {heroSlide.id === "fidelidade" && isLoggedIn ? "Ir para meu perfil" : heroSlide.primaryCta}
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>

                {heroSlide.id === "monitor" && (
                  <button
                    type="button"
                    onClick={openMonitorInfoDialog}
                    className="text-[11px] font-bold text-zinc-100/90 hover:text-white underline underline-offset-4"
                  >
                    Como funciona?
                  </button>
                )}

                <div className="inline-flex items-center justify-center rounded-full border border-white/20 bg-black/25 px-4 py-2 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-100/90">
                  {heroSlide.id === "ofertas" ? (
                    <>
                      <span className="inline-flex h-2 w-2 rounded-full bg-[#FF6A00] animate-pulse mr-2" />
                      {activeOffersLoading ? "85 ofertas ativas" : `${formattedActiveOffers} ofertas ativas`}
                    </>
                  ) : (
                    heroSlide.secondary
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="absolute bottom-6 left-1/2 z-[4] -translate-x-1/2 flex items-center gap-2" role="tablist" aria-label="Paginação dos banners">
            {HERO_SLIDES.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => goToHeroSlide(index, true)}
                aria-label={`Ir para banner ${index + 1}`}
                aria-selected={index === heroSlideIndex}
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  index === heroSlideIndex
                    ? "w-8 bg-[#FF6A00]"
                    : "w-2.5 bg-white/50 hover:bg-white/80"
                } focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff6a00]/45`}
              />
            ))}
          </div>

          <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-[4] hidden md:flex items-center justify-between px-2 lg:px-0">
            <button
              type="button"
              onClick={() => goToPrevHeroSlide(true)}
              className="pointer-events-auto inline-flex h-14 w-14 lg:h-16 lg:w-16 items-center justify-center rounded-full border border-white/30 bg-black/42 text-white hover:bg-black/60 hover:scale-[1.03] shadow-[0_14px_34px_rgba(0,0,0,0.35)] transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff6a00]/50"
              aria-label="Slide anterior"
            >
              <ChevronLeft size={24} />
            </button>

            <button
              type="button"
              onClick={() => goToNextHeroSlide(true)}
              className="pointer-events-auto inline-flex h-14 w-14 lg:h-16 lg:w-16 items-center justify-center rounded-full border border-white/30 bg-black/42 text-white hover:bg-black/60 hover:scale-[1.03] shadow-[0_14px_34px_rgba(0,0,0,0.35)] transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff6a00]/50"
              aria-label="Próximo slide"
            >
              <ChevronRight size={24} />
            </button>
          </div>

          <div className="pointer-events-none absolute bottom-32 left-0 right-0 z-[4] flex items-center justify-between px-3 md:hidden">
            <button
              type="button"
              onClick={() => goToPrevHeroSlide(true)}
              className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/25 text-[#FF8A00] backdrop-blur-sm shadow-[0_8px_22px_rgba(255,106,0,0.22)] hover:bg-black/40 hover:text-[#FFA24D] transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff6a00]/45"
              aria-label="Banner anterior"
            >
              <ChevronLeft size={18} />
            </button>

            <button
              type="button"
              onClick={() => goToNextHeroSlide(true)}
              className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/25 text-[#FF8A00] backdrop-blur-sm shadow-[0_8px_22px_rgba(255,106,0,0.22)] hover:bg-black/40 hover:text-[#FFA24D] transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff6a00]/45"
              aria-label="Próximo banner"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>

      <main className="py-8 md:py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {showHighlights && (
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <div className="relative group">
                <span className="absolute -inset-1 rounded-2xl bg-[#FF6A00]/25 blur-md animate-[pulse_2.6s_ease-in-out_infinite]" />
                <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FF6A00] text-black shadow-sm transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-[1.02]">
                  <Trophy size={20} />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-black text-zinc-900 uppercase italic tracking-tighter">
                  Categorias mais procuradas
                </h2>
                <p className="text-[13px] text-zinc-500">
                  Impulsione seus treinos!
                </p>
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-3 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible">
              {quickCategories.length > 0
                ? quickCategories.map((category) => {
                    const isMostClicked =
                      categoryClicksMeta.totalClicks > 0 &&
                      highlightCategoryId === category.id;
                    const isHighlighted = isMostClicked;
                    const label = isMostClicked ? "MAIS BUSCADA" : "EM ALTA";
                    const visual = getCategoryVisual(category.name);
                    const badgeClass = isHighlighted
                      ? "border-lime-200 bg-lime-100 text-lime-700"
                      : "border-orange-200 bg-orange-100 text-orange-700";
                    const isHot = hotCategoryIds.has(category.id);
                    const backgroundStyle = {
                      backgroundImage: `radial-gradient(120px 80px at 85% 10%, rgba(${visual.accentRgb}, 0.22), transparent 60%), ${buildCategoryPattern(
                        visual.accentRgb,
                      )}`,
                      backgroundSize: "cover, 140px 140px",
                      backgroundPosition: "center, 0 0",
                    } as React.CSSProperties;
                    const categoryImage =
                      category.image_url ?? getCategoryImage(category.name, category.slug);
                    return (
                    <Link
                      key={category.id}
                      to={category.slug ? `/categoria/${category.slug}` : "/produtos"}
                      className={`group relative min-w-[240px] md:min-w-0 h-[148px] rounded-2xl border bg-white px-5 py-4 text-left shadow-sm transition-all duration-200 ease-out active:translate-y-0.5 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_18px_38px_rgba(15,23,42,0.14)] ${
                        isHighlighted
                          ? "border-lime-300 shadow-[0_16px_36px_rgba(16,185,129,0.2)]"
                          : "border-zinc-200/80"
                      }`}
                    >
                      <div
                        className="pointer-events-none absolute inset-0 rounded-2xl opacity-70"
                        style={backgroundStyle}
                      />
                      {isHot ? (
                        <div className="pointer-events-none absolute right-4 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-red-600">
                          <Flame size={12} className="text-red-500" />
                          Hot
                        </div>
                      ) : null}
                      {categoryImage ? (
                        <div
                          className="pointer-events-none absolute inset-y-0 right-0 w-[60%] opacity-35"
                          style={{
                            backgroundImage: `url(${categoryImage})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            WebkitMaskImage:
                              "linear-gradient(270deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 58%, rgba(0,0,0,0) 92%)",
                            maskImage:
                              "linear-gradient(270deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 58%, rgba(0,0,0,0) 92%)",
                          }}
                        />
                      ) : null}
                      <div className="relative z-10 flex items-center justify-between">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${badgeClass}`}
                        >
                          {label}
                        </span>
                      </div>
                      <p
                        className={`relative z-10 mt-3 text-base font-bold ${
                          isHighlighted ? "text-lime-700" : "text-zinc-900"
                        }`}
                      >
                        {category.name}
                      </p>
                      <p className="relative z-10 mt-2 text-[12px] font-semibold text-zinc-700 group-hover:text-zinc-900 group-hover:underline">
                        Ver ofertas →
                      </p>
                    </Link>
                    );
                  })
                : Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={`quick-slot-${index}`}
                      className="min-w-[240px] md:min-w-0 h-[132px] rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 shadow-sm"
                    />
                  ))}
            </div>
          </section>
        )}

        {showHighlights && (
          <section id="best-deals" ref={bestDealsRef} className="mb-14 scroll-mt-24">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#FF6A00] rounded-xl text-black shadow-sm">
                      <Flame size={22} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-zinc-900 uppercase italic tracking-tighter">
                        Melhores do Dia
                      </h3>
                      <p className="text-sm text-zinc-500">
                        {bestDealsFallbackUsed
                          ? "Destaques do dia"
                          : "Descontos reais e quedas mais fortes do dia."}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 sm:ml-auto">
                    {Array.from({
                      length: bestDealsCarouselState.pageCount,
                    }).map((_, index) => (
                      <span
                        key={`best-deals-dot-${index}`}
                        className={`h-2 w-2 rounded-full transition-colors ${
                          index === bestDealsCarouselState.pageIndex
                            ? "bg-zinc-900"
                            : "bg-zinc-300"
                        }`}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                </div>

            {bestDealsLoading && bestDealsShowLimited.length === 0 ? (
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#FBFBFB] to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#FBFBFB] to-transparent" />
                <div className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className={`${CAROUSEL_ITEM_CLASS} snap-start ${CAROUSEL_SKELETON_HEIGHT} rounded-[24px] bg-white border border-zinc-100`}
                  />
                ))}
                </div>
              </div>
            ) : bestDealsShowLimited.length === 0 ? (
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#FBFBFB] to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#FBFBFB] to-transparent" />
                <div className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className={`${CAROUSEL_ITEM_CLASS} snap-start ${CAROUSEL_SKELETON_HEIGHT} rounded-[24px] bg-white border border-zinc-100`}
                  />
                ))}
                </div>
              </div>
            ) : (
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#FBFBFB] to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#FBFBFB] to-transparent" />
                {bestDealsCarouselState.canScrollLeft && (
                  <div className="absolute inset-y-0 left-2 flex items-center z-10">
                    <button
                      type="button"
                      onClick={() => scrollCarousel(bestDealsCarouselRef, "left")}
                      className={CAROUSEL_BUTTON_CLASS}
                      aria-label="Ver ofertas anteriores"
                    >
                      <ChevronLeft size={18} className="mx-auto" />
                    </button>
                  </div>
                )}
                {bestDealsCarouselState.canScrollRight && (
                  <div className="absolute inset-y-0 right-2 flex items-center z-10">
                    <button
                      type="button"
                      onClick={() => scrollCarousel(bestDealsCarouselRef, "right")}
                      className={CAROUSEL_BUTTON_CLASS}
                      aria-label="Ver mais ofertas"
                    >
                      <ChevronRight size={18} className="mx-auto" />
                    </button>
                  </div>
                )}
                <div
                  ref={bestDealsCarouselRef}
                  className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory"
                >
                  {bestDealsShowLimited.map((product: any) => (
                    <div
                      key={product.id}
                      className={`${CAROUSEL_ITEM_CLASS} snap-start`}
                    >
                      <ProductCard product={product} variant="highlight" />
                    </div>
                  ))}
                  {Array.from({ length: bestDealsSlots }).map((_, index) => (
                    <div
                      key={`bestdeal-slot-${index}`}
                      className={`${CAROUSEL_ITEM_CLASS} snap-start ${CAROUSEL_SKELETON_HEIGHT} rounded-[24px] bg-white border border-zinc-100`}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {showHighlights && (
          <section ref={dropsRef} className="mb-14">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#FF6A00] rounded-xl text-black shadow-sm">
                        <TrendingDown size={22} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black text-zinc-900 uppercase italic tracking-tighter">
                          Preços que caíram hoje
                        </h3>
                        <p className="text-sm text-zinc-500">
                          {priceDropsFallbackUsed
                            ? "Menores preços do momento."
                            : "Quedas detectadas pelo monitoramento."}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 sm:ml-auto">
                      {Array.from({
                        length: priceDropsCarouselState.pageCount,
                      }).map((_, index) => (
                        <span
                          key={`price-drops-dot-${index}`}
                          className={`h-2 w-2 rounded-full transition-colors ${
                            index === priceDropsCarouselState.pageIndex
                              ? "bg-zinc-900"
                              : "bg-zinc-300"
                          }`}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                  </div>

	            {dropsLoading && priceDropsShowLimited.length === 0 ? (
	              <div className="relative">
	                <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#FBFBFB] to-transparent" />
	                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#FBFBFB] to-transparent" />
	                {priceDropsCarouselState.canScrollLeft && (
	                  <div className="absolute inset-y-0 left-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(priceDropsCarouselRef, "left")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver ofertas anteriores"
	                    >
	                      <ChevronLeft size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                {priceDropsCarouselState.canScrollRight && (
	                  <div className="absolute inset-y-0 right-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(priceDropsCarouselRef, "right")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver mais ofertas"
	                    >
	                      <ChevronRight size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                <div className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory">
	                  {[1, 2, 3, 4, 5, 6].map((i) => (
	                    <div
	                      key={i}
                      className={`${CAROUSEL_ITEM_CLASS} snap-start ${CAROUSEL_SKELETON_HEIGHT} rounded-[24px] bg-white border border-zinc-100`}
                    />
                  ))}
                </div>
              </div>
	            ) : priceDropsShowLimited.length === 0 ? (
	              <div className="relative">
	                <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#FBFBFB] to-transparent" />
	                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#FBFBFB] to-transparent" />
	                {priceDropsCarouselState.canScrollLeft && (
	                  <div className="absolute inset-y-0 left-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(priceDropsCarouselRef, "left")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver ofertas anteriores"
	                    >
	                      <ChevronLeft size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                {priceDropsCarouselState.canScrollRight && (
	                  <div className="absolute inset-y-0 right-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(priceDropsCarouselRef, "right")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver mais ofertas"
	                    >
	                      <ChevronRight size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                <div className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory">
	                  {[1, 2, 3, 4, 5, 6].map((i) => (
	                    <div
	                      key={i}
                      className={`${CAROUSEL_ITEM_CLASS} snap-start ${CAROUSEL_SKELETON_HEIGHT} rounded-[24px] bg-white border border-zinc-100`}
                    />
                  ))}
                </div>
              </div>
	            ) : (
	              <div className="relative">
	                <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#FBFBFB] to-transparent" />
	                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#FBFBFB] to-transparent" />
	                {priceDropsCarouselState.canScrollLeft && (
	                  <div className="absolute inset-y-0 left-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(priceDropsCarouselRef, "left")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver ofertas anteriores"
	                    >
	                      <ChevronLeft size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                {priceDropsCarouselState.canScrollRight && (
	                  <div className="absolute inset-y-0 right-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(priceDropsCarouselRef, "right")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver mais ofertas"
	                    >
	                      <ChevronRight size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                <div
	                  ref={priceDropsCarouselRef}
	                  className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory"
	                >
                  {priceDropsShowLimited.map((product: any) => (
                    <div
                      key={product.id}
                      className={`${CAROUSEL_ITEM_CLASS} snap-start`}
                    >
                      <ProductCard product={product} variant="technical" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {showHighlights && (
          <section ref={eliteRef} className="mb-14">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#FF6A00] rounded-xl text-black shadow-sm">
                  <Sparkles size={22} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-zinc-900 uppercase italic tracking-tighter">
                    Curadoria Elite
                  </h3>
                  <p className="text-sm text-zinc-500">
                    Selecionados por desempenho, qualidade e custo-benefício.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:ml-auto">
                {Array.from({ length: eliteCarouselState.pageCount }).map((_, index) => (
                  <span
                    key={`elite-dot-${index}`}
                    className={`h-2 w-2 rounded-full transition-colors ${
                      index === eliteCarouselState.pageIndex
                        ? "bg-zinc-900"
                        : "bg-zinc-300"
                    }`}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>

	            {eliteLoading && eliteShowLimited.length === 0 ? (
	              <div className="relative">
	                <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#FBFBFB] to-transparent" />
	                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#FBFBFB] to-transparent" />
	                {eliteCarouselState.canScrollLeft && (
	                  <div className="absolute inset-y-0 left-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(eliteCarouselRef, "left")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver ofertas anteriores"
	                    >
	                      <ChevronLeft size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                {eliteCarouselState.canScrollRight && (
	                  <div className="absolute inset-y-0 right-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(eliteCarouselRef, "right")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver mais ofertas"
	                    >
	                      <ChevronRight size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                <div className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory">
	                  {[1, 2, 3, 4, 5, 6].map((i) => (
	                    <div
	                      key={i}
                      className={`${CAROUSEL_ITEM_CLASS} snap-start ${CAROUSEL_SKELETON_HEIGHT} rounded-[24px] bg-white border border-zinc-100`}
                    />
                  ))}
                </div>
              </div>
	            ) : eliteShowLimited.length === 0 ? (
	              <div className="relative">
	                <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#FBFBFB] to-transparent" />
	                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#FBFBFB] to-transparent" />
	                {eliteCarouselState.canScrollLeft && (
	                  <div className="absolute inset-y-0 left-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(eliteCarouselRef, "left")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver ofertas anteriores"
	                    >
	                      <ChevronLeft size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                {eliteCarouselState.canScrollRight && (
	                  <div className="absolute inset-y-0 right-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(eliteCarouselRef, "right")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver mais ofertas"
	                    >
	                      <ChevronRight size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                <div className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory">
	                  {[1, 2, 3, 4, 5, 6].map((i) => (
	                    <div
	                      key={i}
                      className={`${CAROUSEL_ITEM_CLASS} snap-start ${CAROUSEL_SKELETON_HEIGHT} rounded-[24px] bg-white border border-zinc-100`}
                    />
                  ))}
                </div>
              </div>
	            ) : (
	              <div className="relative">
	                <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#FBFBFB] to-transparent" />
	                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#FBFBFB] to-transparent" />
	                {eliteCarouselState.canScrollLeft && (
	                  <div className="absolute inset-y-0 left-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(eliteCarouselRef, "left")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver ofertas anteriores"
	                    >
	                      <ChevronLeft size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                {eliteCarouselState.canScrollRight && (
	                  <div className="absolute inset-y-0 right-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(eliteCarouselRef, "right")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver mais ofertas"
	                    >
	                      <ChevronRight size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                <div
	                  ref={eliteCarouselRef}
	                  className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory"
	                >
                  {eliteShowLimited.map((product: any) => (
                    <div key={product.id} className={`${CAROUSEL_ITEM_CLASS} snap-start`}>
                      <ProductCard product={product} variant="curation" />
                    </div>
                  ))}
                  {Array.from({ length: eliteSlots }).map((_, index) => (
                    <div
                      key={`elite-slot-${index}`}
                      className={`${CAROUSEL_ITEM_CLASS} snap-start ${CAROUSEL_SKELETON_HEIGHT} rounded-[24px] bg-white border border-zinc-100`}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section
          id="products"
          ref={productsRef}
          className="scroll-mt-24"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#FF6A00] rounded-xl text-black shadow-sm">
                <LayoutGrid size={22} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-zinc-900 uppercase italic tracking-tighter">
                  Todos os produtos
                </h3>
                <p className="text-sm text-zinc-500">
                  Preview com as ofertas mais recentes.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:ml-auto">
              {Array.from({ length: previewCarouselState.pageCount }).map((_, index) => (
                <span
                  key={`preview-dot-${index}`}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    index === previewCarouselState.pageIndex
                      ? "bg-zinc-900"
                      : "bg-zinc-300"
                  }`}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>

          <div className="mb-10">
	            {previewLoading && previewProductsLimited.length === 0 ? (
	              <div className="relative">
	                <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#FBFBFB] to-transparent" />
	                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#FBFBFB] to-transparent" />
	                {previewCarouselState.canScrollLeft && (
	                  <div className="absolute inset-y-0 left-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(previewCarouselRef, "left")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver produtos anteriores"
	                    >
	                      <ChevronLeft size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                {previewCarouselState.canScrollRight && (
	                  <div className="absolute inset-y-0 right-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(previewCarouselRef, "right")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver mais produtos"
	                    >
	                      <ChevronRight size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                <div className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory">
	                  {Array.from({ length: 8 }).map((_, index) => (
	                    <div
	                      key={`preview-skeleton-${index}`}
                      className={`${CAROUSEL_ITEM_CLASS} snap-start ${CAROUSEL_SKELETON_HEIGHT} rounded-[24px] bg-white border border-zinc-100`}
                    />
                  ))}
                </div>
              </div>
	            ) : previewProductsLimited.length > 0 ? (
	              <div className="relative">
	                <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#FBFBFB] to-transparent" />
	                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#FBFBFB] to-transparent" />
	                {previewCarouselState.canScrollLeft && (
	                  <div className="absolute inset-y-0 left-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(previewCarouselRef, "left")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver produtos anteriores"
	                    >
	                      <ChevronLeft size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                {previewCarouselState.canScrollRight && (
	                  <div className="absolute inset-y-0 right-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(previewCarouselRef, "right")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver mais produtos"
	                    >
	                      <ChevronRight size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                <div
	                  ref={previewCarouselRef}
	                  className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory"
	                >
                  {previewProductsLimited.map((product: any) => (
                    <div key={product.id} className={`${CAROUSEL_ITEM_CLASS} snap-start`}>
                      <ProductCard product={product} variant="compact" />
                    </div>
                  ))}
                  {Array.from({ length: previewSlots }).map((_, index) => (
                    <div
                      key={`preview-slot-${index}`}
                      className={`${CAROUSEL_ITEM_CLASS} snap-start ${CAROUSEL_SKELETON_HEIGHT} rounded-[24px] bg-white border border-zinc-100`}
                    />
                  ))}
                </div>
              </div>
	            ) : (
	              <div className="relative">
	                <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#FBFBFB] to-transparent" />
	                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#FBFBFB] to-transparent" />
	                {previewCarouselState.canScrollLeft && (
	                  <div className="absolute inset-y-0 left-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(previewCarouselRef, "left")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver produtos anteriores"
	                    >
	                      <ChevronLeft size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                {previewCarouselState.canScrollRight && (
	                  <div className="absolute inset-y-0 right-2 flex items-center z-10">
	                    <button
	                      type="button"
	                      onClick={() => scrollCarousel(previewCarouselRef, "right")}
	                      className={CAROUSEL_BUTTON_CLASS}
	                      aria-label="Ver mais produtos"
	                    >
	                      <ChevronRight size={18} className="mx-auto" />
	                    </button>
	                  </div>
	                )}
	                <div className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory">
	                  {Array.from({ length: 8 }).map((_, index) => (
	                    <div
	                      key={`preview-empty-${index}`}
                      className={`${CAROUSEL_ITEM_CLASS} snap-start ${CAROUSEL_SKELETON_HEIGHT} rounded-[24px] bg-white border border-zinc-100`}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Button
                asChild
                className="bg-zinc-900 text-white hover:bg-zinc-800 font-bold h-12 px-8 text-base"
              >
                <Link to="/produtos">Ver todos os produtos</Link>
              </Button>
            </div>
          </div>

        </section>
      </main>

	    </div>
	  );
	}



