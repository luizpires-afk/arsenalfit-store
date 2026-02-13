import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
  ArrowDown,
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

const BEST_DEAL_MIN_DISCOUNT = 20;
const BEST_DEAL_MAX_VERIFY_AGE_HOURS = 12;
const BEST_DEAL_MAX_VERIFY_AGE_MS = BEST_DEAL_MAX_VERIFY_AGE_HOURS * 60 * 60 * 1000;
const BEST_DEAL_FALLBACK_MAX_AGE_HOURS = 24;
const BEST_DEAL_FALLBACK_MAX_AGE_MS = BEST_DEAL_FALLBACK_MAX_AGE_HOURS * 60 * 60 * 1000;
const RELIABLE_PRICE_SOURCES = new Set(["auth", "public"]);
const CAROUSEL_ITEM_CLASS =
  "shrink-0 basis-[calc((100%_-_16px)/2)] md:basis-[calc((100%_-_32px)/3)] lg:basis-[calc((100%_-_48px)/4)]";
const CAROUSEL_SKELETON_HEIGHT = "h-56";
const CAROUSEL_BUTTON_CLASS =
  "h-11 w-11 sm:h-14 sm:w-14 rounded-full border-2 border-zinc-300 bg-white text-zinc-700 shadow-[0_18px_36px_rgba(15,23,42,0.22)] backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:scale-[1.05] hover:bg-zinc-100 hover:text-zinc-900 hover:shadow-[0_22px_40px_rgba(15,23,42,0.26)]";
const ACTIVE_FILTER = "is_active.is.null,is_active.eq.true";
const NON_BLOCKED_FILTER = "auto_disabled_reason.is.null,auto_disabled_reason.neq.blocked";
const CAROUSEL_LIMIT = 16;
const CATEGORY_PRIORITY = ["suplement", "equip", "acessor", "roupa"];

const PRODUCT_SELECT_BASE =
  "id, name, slug, price, pix_price, original_price, previous_price, detected_at, last_sync, updated_at, image_url, images, affiliate_link, is_featured, is_on_sale, discount_percentage, free_shipping, marketplace, category_id, clicks_count";
const PRODUCT_SELECT_WITH_SOURCE =
  "id, name, slug, price, pix_price, original_price, previous_price, detected_at, last_sync, last_price_source, last_price_verified_at, updated_at, image_url, images, affiliate_link, is_featured, is_on_sale, discount_percentage, free_shipping, marketplace, category_id, clicks_count";

const HERO_BANNERS = [
  {
    src: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=2000&q=80",
    position: "50% 35%",
  },
  { src: "/hero/hero-1.jpg", position: "50% 35%" },
  { src: "/hero/hero-2.jpg", position: "50% 30%" },
  { src: "/hero/hero-3.jpg", position: "55% 35%" },
  { src: "/hero/hero-4.jpg", position: "50% 25%" },
  { src: "/hero/hero-5.jpg", position: "55% 30%" },
];

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

  const heroRef = useRef<HTMLDivElement | null>(null);
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
  const reduceMotion = useReducedMotion();
  const [heroBannerIndex, setHeroBannerIndex] = useState(0);
  const [priceSourceSupported, setPriceSourceSupported] = useState<boolean | null>(null);

  const heroBanner = HERO_BANNERS[heroBannerIndex % HERO_BANNERS.length];
  const heroMotion = useMemo(() => {
    const duration = reduceMotion ? 0 : 0.26;
    const stagger = reduceMotion ? 0 : 0.075;

    return {
      container: {
        hidden: {},
        show: {
          transition: {
            staggerChildren: stagger,
            delayChildren: reduceMotion ? 0 : 0.04,
          },
        },
      },
      item: {
        hidden: { opacity: 0, y: 12 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration, ease: "easeOut" as const },
        },
      },
    };
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return;
    if (HERO_BANNERS.length <= 1) return;

    const id = window.setInterval(() => {
      setHeroBannerIndex((current) => (current + 1) % HERO_BANNERS.length);
    }, 6500);

    return () => window.clearInterval(id);
  }, [reduceMotion]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (HERO_BANNERS.length <= 1) return;
    const next = HERO_BANNERS[(heroBannerIndex + 1) % HERO_BANNERS.length];
    const img = new Image();
    img.src = next.src;
  }, [heroBannerIndex]);

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
        .or(ACTIVE_FILTER)
        .or(NON_BLOCKED_FILTER);
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
        .or(ACTIVE_FILTER)
        .or(NON_BLOCKED_FILTER)
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
          .or(ACTIVE_FILTER)
          .or(NON_BLOCKED_FILTER)
          .order("updated_at", { ascending: false })
          .limit(8),
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
          .or(ACTIVE_FILTER)
          .or(NON_BLOCKED_FILTER)
          .order("updated_at", { ascending: false })
          .limit(80),
      );
    },
  });

  const bestDealsMeta = useMemo(() => {
    const nowMs = Date.now();
    const basePool = (bestDealsData || []).filter(
      (product: any) => product.is_active !== false,
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

    const toNumber = (value: unknown) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    const candidates = pool
      .map((product: any) => {
        const price = toNumber(product.price) ?? 0;
        const prev =
          toNumber(product.previous_price) ?? toNumber(product.original_price);
        const discountValue = prev ? Math.max(prev - price, 0) : 0;
        const discountFromPrev =
          prev && prev > 0 ? (discountValue / prev) * 100 : 0;
        const discountRaw = toNumber(product.discount_percentage);
        const discountFromField =
          typeof discountRaw === "number"
            ? discountRaw <= 1
              ? discountRaw * 100
              : discountRaw
            : 0;
        const discountPercent = Math.max(discountFromPrev, discountFromField);
        const pix =
          typeof product.pix_price === "number" &&
          product.pix_price > 0 &&
          product.pix_price < price
            ? product.pix_price
            : null;
        const lastUpdated =
          product.detected_at || product.last_sync || product.updated_at || null;
        const lastUpdatedMs = lastUpdated ? new Date(lastUpdated).getTime() : 0;
        return {
          product,
          prev,
          pix,
          discountValue,
          discountPercent,
          lastUpdatedMs,
        };
      })
      .filter((item) => item.discountPercent > 0);

    const shortlisted = candidates.filter(
      (item) => item.discountPercent >= BEST_DEAL_MIN_DISCOUNT,
    );

    shortlisted.sort((a, b) => {
      const pixA = a.pix ? 1 : 0;
      const pixB = b.pix ? 1 : 0;
      if (pixA !== pixB) return pixB - pixA;
      if (b.discountPercent !== a.discountPercent)
        return b.discountPercent - a.discountPercent;
      return (b.lastUpdatedMs ?? 0) - (a.lastUpdatedMs ?? 0);
    });

    const usedCategories = new Set<string>();
    const diversified: typeof shortlisted = [];
    const fallback: typeof shortlisted = [];

    for (const item of shortlisted) {
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
      items: primaryProducts.slice(0, CAROUSEL_LIMIT),
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
          .or(ACTIVE_FILTER)
          .or(NON_BLOCKED_FILTER)
          .order("updated_at", { ascending: false })
          .limit(120),
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
          .or(ACTIVE_FILTER)
          .or(NON_BLOCKED_FILTER)
          .order("price", { ascending: true })
          .limit(16),
      );
    },
  });

  const priceDropsToday = useMemo(() => {
    const primary = (dropsData || [])
      .filter((product: any) => {
        const price = Number(product.price || 0);
        const prev = typeof product.previous_price === "number" ? product.previous_price : null;
        const original =
          typeof product.original_price === "number" ? product.original_price : null;
        const hasDrop =
          (prev !== null && prev > price) ||
          (original !== null && original > price) ||
          (typeof product.discount_percentage === "number" && product.discount_percentage > 0);
        return hasDrop;
      })
      .map((product: any) => {
        const price = Number(product.price || 0);
        const prev =
          typeof product.previous_price === "number" ? product.previous_price : null;
        const original =
          typeof product.original_price === "number" ? product.original_price : null;
        const base = prev ?? original ?? price;
        const dropValue = Math.max(base - price, 0);
        const lastUpdated =
          product.detected_at || product.last_sync || product.updated_at || null;
        const lastUpdatedMs = lastUpdated ? new Date(lastUpdated).getTime() : 0;
        return { product, dropValue, lastUpdatedMs };
      })
      .sort((a, b) => {
        if (b.lastUpdatedMs !== a.lastUpdatedMs)
          return b.lastUpdatedMs - a.lastUpdatedMs;
        return b.dropValue - a.dropValue;
      })
      .map((item) => item.product);

    return primary;
  }, [dropsData]);

  const { data: eliteData = [], isLoading: eliteLoading } = useQuery({
    queryKey: ["home-v2", "elite"],
    queryFn: async () => {
      return fetchProductsSafe((select) =>
        supabase
          .from("products")
          .select(select)
          .eq("is_blocked", false)
          .or(ACTIVE_FILTER)
          .or(NON_BLOCKED_FILTER)
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
            .or(ACTIVE_FILTER)
            .or(NON_BLOCKED_FILTER)
            .order("is_featured", { ascending: false })
            .order("clicks_count", { ascending: false })
            .order("updated_at", { ascending: false })
            .limit(30),
        );
      },
    });

  const eliteProducts = useMemo(() => {
    const pool = (eliteData || []).filter((product: any) => product.is_active !== false);

    const dropped = pool
      .filter(
        (product: any) =>
          typeof product.previous_price === "number" &&
          product.previous_price > product.price,
      )
      .sort((a: any, b: any) => {
        const priceA = Number(a.price || 0);
        const priceB = Number(b.price || 0);
        return priceB - priceA;
      });

    const priceyFallback = pool
      .filter((product: any) => Number(product.price || 0) >= 150)
      .sort((a: any, b: any) => Number(b.price || 0) - Number(a.price || 0));

    const curated = mergeUnique(dropped, priceyFallback);
    const fallback = mergeUnique(eliteFallbackData, bestDealsData, previewData);
    const merged = mergeUnique(curated, fallback);
    return merged.slice(0, CAROUSEL_LIMIT);
  }, [eliteData, eliteFallbackData, bestDealsData, previewData]);

  const previewProducts = useMemo(() => {
    const merged = mergeUnique(previewData, bestDealsData, eliteData, lowPriceData);
    return merged.slice(0, 8);
  }, [previewData, bestDealsData, eliteData, lowPriceData]);

  const previewProductsLimited = useMemo(
    () => previewProducts.slice(0, CAROUSEL_LIMIT),
    [previewProducts],
  );

  const previewSlots = useMemo(
    () => Math.max(0, 8 - previewProductsLimited.length),
    [previewProductsLimited],
  );

  const bestDealsShow = useMemo(() => bestDeals, [bestDeals]);

  const bestDealsShowLimited = useMemo(
    () => bestDealsShow.slice(0, CAROUSEL_LIMIT),
    [bestDealsShow],
  );

  const bestDealsSlots = useMemo(
    () => Math.max(0, 6 - bestDealsShowLimited.length),
    [bestDealsShowLimited],
  );

  const hotCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    const bestDealIds = new Set(bestDealsShow.map((item: any) => item.id));
    const pool = mergeUnique(bestDealsData, dropsData, previewData, eliteData);

    for (const product of pool as any[]) {
      const categoryId = product?.category_id;
      if (!categoryId) continue;
      const price = Number(product.price || 0);
      const prevRaw =
        typeof product.previous_price === "number"
          ? product.previous_price
          : typeof product.original_price === "number"
            ? product.original_price
            : null;
      const prev = typeof prevRaw === "number" ? prevRaw : null;
      const hasDrop = prev !== null && prev > price;
      const isPromo =
        product.is_on_sale === true ||
        (typeof product.discount_percentage === "number" && product.discount_percentage > 0);
      const isFeatured = product.is_featured === true;
      const isBestDeal = bestDealIds.has(product.id);

      if (isBestDeal || isPromo || hasDrop || isFeatured) {
        ids.add(categoryId);
      }
    }

    return ids;
  }, [bestDealsShow, bestDealsData, dropsData, previewData, eliteData]);

  const priceDropsShow = useMemo(() => priceDropsToday, [priceDropsToday]);

  const priceDropsShowLimited = useMemo(
    () => priceDropsShow.slice(0, CAROUSEL_LIMIT),
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
    () => Math.max(0, 6 - eliteShowLimited.length),
    [eliteShowLimited],
  );

  const handleScrollToBestDeals = () => {
    document.getElementById("best-deals")?.scrollIntoView({ behavior: "smooth" });
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
        ref={heroRef}
        className="relative overflow-hidden bg-zinc-950 text-white max-h-[70vh] md:max-h-none"
      >
        <div className="absolute inset-0 z-0 pointer-events-none">
          <AnimatePresence initial={false}>
            <motion.img
              key={heroBanner.src}
              src={heroBanner.src}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover grayscale contrast-110 brightness-[1.05]"
              style={{ objectPosition: heroBanner.position }}
              initial={
                reduceMotion
                  ? { opacity: 0.6 }
                  : { opacity: 0, scale: 1.03 }
              }
              animate={{ opacity: 0.6, scale: 1 }}
              exit={
                reduceMotion
                  ? { opacity: 0.6 }
                  : { opacity: 0, scale: 1.01 }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 1.1, ease: "easeInOut" }
              }
            />
          </AnimatePresence>
        </div>
        <div className="absolute inset-0 z-[1] bg-[radial-gradient(320px_220px_at_20%_10%,rgba(163,230,53,0.22),transparent_65%)]" />
        <div className="absolute inset-0 z-[1] bg-[radial-gradient(420px_240px_at_82%_0%,rgba(249,115,22,0.2),transparent_65%)]" />
        <div className="absolute inset-0 z-[2] bg-gradient-to-r from-zinc-950/75 via-zinc-950/45 to-zinc-950/20" />
        <div className="absolute inset-0 z-[2] bg-gradient-to-b from-zinc-950/15 via-zinc-950/55 to-zinc-950/75" />
        <div className="relative z-[3] max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 md:py-20 lg:py-24">
          <motion.div variants={heroMotion.container} initial="hidden" animate="show">
            <motion.div variants={heroMotion.item}>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-2 text-xs text-zinc-200">
                Curadoria fitness com preços monitorados
              </div>
            </motion.div>

            <motion.h1
              variants={heroMotion.item}
              className="mt-5 text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.05]"
            >
              Curadoria fitness com os melhores preços reais de hoje
            </motion.h1>

            <motion.p
              variants={heroMotion.item}
              className="mt-4 text-base md:text-lg text-zinc-300 max-w-2xl"
            >
              Monitoramos preços automaticamente e te levamos direto às lojas oficiais, sem intermediários.
            </motion.p>

            <motion.div
              variants={heroMotion.item}
              className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <Button
                onClick={handleScrollToBestDeals}
                className="w-full sm:w-auto bg-lime-400 text-zinc-900 hover:bg-lime-300 font-black px-6 py-6 rounded-full gap-2"
              >
                <span>Ver ofertas de hoje</span>
                <ArrowDown className="ml-2 h-4 w-4" />
              </Button>

              <div
                className="w-full sm:w-auto inline-flex items-center justify-center sm:justify-start gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-3 text-xs text-zinc-200"
                aria-live="polite"
              >
                <span className="inline-flex h-2 w-2 rounded-full bg-lime-300/90 animate-pulse" />
                <span className="font-semibold text-white">
                  {activeOffersLoading ? "Atualizando..." : formattedActiveOffers}
                </span>
                <span>ofertas ativas</span>
              </div>
            </motion.div>

            <motion.div
              variants={heroMotion.item}
              className="mt-6 flex gap-4 overflow-x-auto no-scrollbar pb-2 text-xs text-zinc-300 md:flex-nowrap md:overflow-visible md:whitespace-nowrap"
            >
              <div className="flex items-center gap-2 shrink-0">
                <ShieldCheck size={14} className="text-lime-300" />
                Preços monitorados automaticamente
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <RefreshCw size={14} className="text-lime-300" />
                Atualizações frequentes ao longo do dia
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link2 size={14} className="text-lime-300" />
                Links diretos para lojas oficiais
              </div>
            </motion.div>
          </motion.div>
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



