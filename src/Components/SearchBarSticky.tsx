import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  X,
  TrendingUp,
  Tag,
  Sparkles,
  Flame,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/Components/ui/input";
import { supabase } from "@/integrations/supabase/client";

type SuggestionItem = {
  id: string;
  name: string;
  slug: string;
  price: number | null;
  original_price: number | null;
  image_url: string | null;
  affiliate_link: string | null;
  badge?: "promo" | "popular" | null;
  category_name?: string | null;
  category_id?: string | null;
};

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  image_url?: string | null;
};

type SearchResponse = {
  query: string;
  suggestions: SuggestionItem[];
  similar: SuggestionItem[];
  categories: CategoryItem[];
  completions: string[];
  hot: SuggestionItem[];
  mostClicked?: Record<string, SuggestionItem[]>;
  didYouMean?: string | null;
  total: number;
  mode: "query" | "empty" | "no_results";
};

const formatPrice = (value?: number | null) => {
  if (typeof value !== "number") return "";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
};

const CACHE_TTL_MS = 60_000;
const MAX_SUGGESTIONS = 7;
const ACTIVE_FILTER = "is_active.is.null,is_active.eq.true";

const normalize = (value = "") =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const SYNONYMS: Record<string, string[]> = {
  blusa: ["camisa", "top", "camiseta"],
  camisa: ["blusa", "camiseta", "top"],
  camiseta: ["camisa", "blusa", "t-shirt"],
  top: ["blusa", "camiseta"],
  calca: ["legging", "jeans", "pants"],
  calcas: ["legging", "jeans", "pants"],
  legging: ["calca", "calcas"],
  short: ["bermuda"],
  bermuda: ["short"],
  tenis: ["sneaker"],
  moletom: ["hoodie", "casaco"],
  jaqueta: ["casaco", "moletom"],
  sutia: ["top"],
};

const buildSynonyms = (term: string) => {
  if (!term) return [];
  const normalized = normalize(term);
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  const result = new Set<string>();
  tokens.forEach((token) => {
    (SYNONYMS[token] || []).forEach((entry) => result.add(entry));
  });
  return Array.from(result);
};

const CATEGORY_MATCHERS: Array<{
  slug: string;
  label: string;
  keywords: string[];
}> = [
  {
    slug: "roupas",
    label: "Roupas",
    keywords: ["roupa", "roupas", "vestu", "vestuario", "moda"],
  },
  {
    slug: "suplementos",
    label: "Suplementos",
    keywords: ["suplemento", "suplementos", "whey", "creatina", "vitamina"],
  },
  {
    slug: "equipamentos",
    label: "Equipamentos",
    keywords: ["equipamento", "equipamentos", "treino"],
  },
  {
    slug: "acessorios",
    label: "Acessórios",
    keywords: ["acessorio", "acessorios", "acessório"],
  },
];

const parseGenderParam = (value?: string | null) => {
  if (!value) return null;
  const normalized = normalize(value);
  if (!normalized) return null;
  if (
    normalized.startsWith("masc") ||
    normalized.includes("masc") ||
    normalized === "m" ||
    normalized.includes("homem") ||
    normalized.includes("male")
  ) {
    return "masculino" as const;
  }
  if (
    normalized.startsWith("fem") ||
    normalized.includes("fem") ||
    normalized === "f" ||
    normalized.includes("mulher") ||
    normalized.includes("female")
  ) {
    return "feminino" as const;
  }
  return null;
};
export default function SearchBarSticky() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isExpandedMobile, setIsExpandedMobile] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [scrollState, setScrollState] = useState<
    Record<string, { canLeft: boolean; canRight: boolean }>
  >({});
  const autoScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const autoScrollPaused = useRef<Set<string>>(new Set());
  const scrollUpdateRef = useRef<Record<string, number>>({});
  const manualScrollKeys = useRef<Set<string>>(new Set());
  const scrollTimerRef = useRef<Record<string, number[]>>({});
  const dragTimerRef = useRef<Record<string, number>>({});
  const [draggingRows, setDraggingRows] = useState<Record<string, boolean>>({});
  const cacheRef = useRef<Map<string, { ts: number; data: SearchResponse }>>(new Map());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<number | null>(null);

  const trimmedQuery = query.trim();
  const baseSelect =
    "id, name, slug, price, original_price, image_url, affiliate_link, is_on_sale, clicks_count, category_id, discount_percentage";

  const genderIntent = useMemo(() => parseGenderParam(trimmedQuery), [trimmedQuery]);

  const categoryMatch = useMemo(() => {
    if (!trimmedQuery) return null;
    const normalizedQuery = normalize(trimmedQuery);

    const fromResults = (results?.categories || []).find((category) => {
      const name = normalize(category.name || "");
      const slug = normalize(category.slug || "");
      return (
        normalizedQuery.includes(name) ||
        normalizedQuery.includes(slug) ||
        name.includes(normalizedQuery) ||
        slug.includes(normalizedQuery)
      );
    });

    if (fromResults) return fromResults;

    const fallback = CATEGORY_MATCHERS.find((entry) =>
      entry.keywords.some((keyword) =>
        normalizedQuery === keyword ||
        normalizedQuery.startsWith(`${keyword} `) ||
        normalizedQuery.endsWith(` ${keyword}`),
      ),
    );

    if (!fallback) return null;

    return {
      id: fallback.slug,
      name: fallback.label,
      slug: fallback.slug,
      image_url: null,
    } as CategoryItem;
  }, [trimmedQuery, results?.categories]);

  const goToCategory = (
    category: CategoryItem | null,
    genderOverride?: "masculino" | "feminino" | null,
  ) => {
    if (!category?.slug) return;
    const slug = category.slug;
    const gender = genderOverride || null;
    if (slug === "roupas" && gender) {
      window.location.href = `/categoria/roupas?gender=${gender}`;
      return;
    }
    window.location.href = `/categoria/${slug}`;
  };
  const openDropdown = () => {
    setIsOpen(true);
  };

  const closeDropdown = () => {
    setIsOpen(false);
  };

  const expandMobileSearch = () => {
    setIsExpandedMobile(true);
    setIsFocused(true);
    openDropdown();
    if (!results && !isLoading) fetchResults("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const collapseMobileSearch = () => {
    setIsExpandedMobile(false);
    setIsFocused(false);
    closeDropdown();
    inputRef.current?.blur();
  };

  const toggleMobileSearch = () => {
    if (isExpandedMobile) {
      collapseMobileSearch();
      return;
    }
    expandMobileSearch();
  };

  const setQuerySafe = (value: string) => {
    setQuery(value);
    if (!isOpen) setIsOpen(true);
  };

  const fetchResults = async (searchTerm: string) => {
    const cacheKey = searchTerm || "__empty__";
    const cached = cacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setResults(cached.data);
      return;
    }

    setIsLoading(true);
    try {
      const url = new URL("/api/search", window.location.origin);
      if (searchTerm) url.searchParams.set("q", searchTerm);
      url.searchParams.set("limit", String(MAX_SUGGESTIONS));
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("api_unavailable");
      const data: SearchResponse = await response.json();
      if ((data as any)?.error) throw new Error("api_error");
      cacheRef.current.set(cacheKey, { ts: Date.now(), data });
      setResults(data);
    } catch {
      try {
        const fallback = await fetchViaSupabase(searchTerm);
        cacheRef.current.set(cacheKey, { ts: Date.now(), data: fallback });
        setResults(fallback);
      } catch {
        setResults({
          query: searchTerm,
          suggestions: [],
          similar: [],
          categories: [],
          completions: [],
          hot: [],
          mostClicked: {},
          didYouMean: null,
          total: 0,
          mode: searchTerm ? "query" : "empty",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchViaSupabase = async (searchTerm: string): Promise<SearchResponse> => {
    const synonyms = buildSynonyms(searchTerm);
    const formatItems = (items: any[] = []) =>
      items.map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        price: item.price,
        original_price: item.original_price,
        image_url: item.image_url,
        affiliate_link: item.affiliate_link,
        badge: item.is_on_sale ? "promo" : item.clicks_count > 5 ? "popular" : null,
        category_id: item.category_id,
      }));

    const response: SearchResponse = {
      query: searchTerm,
      suggestions: [],
      similar: [],
      categories: [],
      completions: [],
      hot: [],
      mostClicked: {},
      didYouMean: null,
      total: 0,
      mode: searchTerm ? "query" : "empty",
    };

    if (!searchTerm) {
      const [{ data: suggestions }, { data: hotRows }, { data: categories }] = await Promise.all([
        supabase
          .from("products")
          .select(baseSelect)
          .or(ACTIVE_FILTER)
          .order("is_on_sale", { ascending: false })
          .order("clicks_count", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(MAX_SUGGESTIONS),
        supabase
          .from("products")
          .select(baseSelect)
          .or(ACTIVE_FILTER)
          .or("discount_percentage.gte.20,is_on_sale.eq.true")
          .order("discount_percentage", { ascending: false })
          .order("clicks_count", { ascending: false })
          .limit(8),
        supabase.from("categories").select("id, name, slug"),
      ]);

      response.suggestions = formatItems(suggestions || []);
      response.hot = formatItems(hotRows || []);

      const categoryList = categories || [];
      const resolveCategory = (matchers: string[]) =>
        categoryList.find((cat: any) => {
          const name = normalize(cat.name || "");
          const slug = normalize(cat.slug || "");
          return matchers.some((matcher) => name.includes(matcher) || slug.includes(matcher));
        });

      const mostClicked: Record<string, SuggestionItem[]> = {};
      const groups = [
        { key: "Suplementos", matchers: ["suplement"] },
        { key: "Acessórios", matchers: ["acessor"] },
        { key: "Roupas", matchers: ["roupa", "vestu"] },
      ];

      for (const group of groups) {
        const cat = resolveCategory(group.matchers);
        if (!cat?.id) {
          mostClicked[group.key] = [];
          continue;
        }
        const { data } = await supabase
          .from("products")
          .select(baseSelect)
          .or(ACTIVE_FILTER)
          .eq("category_id", cat.id)
          .order("clicks_count", { ascending: false })
          .limit(20);
        mostClicked[group.key] = formatItems(data || []);
      }

      response.mostClicked = mostClicked;
    } else {
      const [completionRes, searchRes] = await Promise.all([
        supabase
          .from("products")
          .select("name, clicks_count")
          .or(ACTIVE_FILTER)
          .ilike("name", `${searchTerm}%`)
          .order("clicks_count", { ascending: false })
          .limit(5),
        supabase.rpc("search_products", {
          q: searchTerm,
          limit_count: MAX_SUGGESTIONS,
          synonyms,
        }),
      ]);

      response.completions = (completionRes.data || [])
        .map((row: any) => row.name)
        .filter(Boolean);

      const terms = [searchTerm, ...synonyms].filter(Boolean);
      const orParts = terms.flatMap((term) => [
        `name.ilike.%${term}%`,
        `description.ilike.%${term}%`,
      ]);

      if (searchRes.error) {
        const { data: fallbackRows } = await supabase
          .from("products")
          .select(baseSelect)
          .or(ACTIVE_FILTER)
          .or(orParts.join(","))
          .order("is_on_sale", { ascending: false })
          .order("clicks_count", { ascending: false })
          .limit(MAX_SUGGESTIONS);
        response.suggestions = formatItems(fallbackRows || []);
      } else {
        response.suggestions = formatItems(searchRes.data || []);
      }

      if (response.suggestions.length === 0 && orParts.length) {
        const { data: fallbackRows } = await supabase
          .from("products")
          .select(baseSelect)
          .or(ACTIVE_FILTER)
          .or(orParts.join(","))
          .order("is_on_sale", { ascending: false })
          .order("clicks_count", { ascending: false })
          .limit(MAX_SUGGESTIONS);
        response.suggestions = formatItems(fallbackRows || []);
      }

      if (response.suggestions.length < 3 && response.suggestions[0]?.category_id) {
        const excludeIds = response.suggestions.map((item) => item.id);
        const { data: similarRows } = await supabase
          .from("products")
          .select(baseSelect)
          .or(ACTIVE_FILTER)
          .eq("category_id", response.suggestions[0].category_id)
          .not("id", "in", `(${excludeIds.join(",")})`)
          .order("is_on_sale", { ascending: false })
          .order("clicks_count", { ascending: false })
          .limit(Math.max(0, MAX_SUGGESTIONS - response.suggestions.length));
        response.similar = formatItems(similarRows || []);
      }

      const { data: categoryRows } = await supabase
        .from("categories")
        .select("id, name, slug, image_url")
        .ilike("name", `%${searchTerm}%`)
        .limit(5);

      const suggestionCategoryIds = [
        ...new Set(response.suggestions.map((item: any) => item.category_id).filter(Boolean)),
      ];
      let categoryFromSuggestions: any[] = [];
      if (suggestionCategoryIds.length) {
        const { data } = await supabase
          .from("categories")
          .select("id, name, slug, image_url")
          .in("id", suggestionCategoryIds);
        categoryFromSuggestions = data || [];
      }
      const merged = new Map();
      for (const item of [...(categoryRows || []), ...categoryFromSuggestions]) {
        if (!item?.id) continue;
        merged.set(item.id, item);
      }
      response.categories = Array.from(merged.values()).slice(0, 5);

      if (!response.suggestions.length) {
        response.mode = "no_results";
        const { data: did } = await supabase.rpc("suggest_search_term", { q: searchTerm });
        response.didYouMean = typeof did === "string" ? did : null;
      }
    }

    response.total = response.suggestions.length;
    return response;
  };

  useEffect(() => {
    if (!isFocused) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      fetchResults(trimmedQuery);
    }, 380);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [trimmedQuery, isFocused]);

  useEffect(() => {
    if (!isFocused) return;
    if (!results && !isLoading) {
      fetchResults("");
    }
  }, [isFocused]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-search-toggle]")) return;
      if (!containerRef.current.contains(target)) {
        closeDropdown();
        setIsFocused(false);
        if (isMobile && isExpandedMobile) {
          setIsExpandedMobile(false);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isMobile, isExpandedMobile]);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const interval = window.setInterval(() => {
      Object.entries(autoScrollRefs.current).forEach(([key, el]) => {
        if (!el) return;
        if (autoScrollPaused.current.has(key)) return;
        const maxScroll = el.scrollWidth - el.clientWidth;
        if (maxScroll <= 0) return;
        const speed = key === "hot" ? 0.6 : 0.4;
        if (el.scrollLeft >= maxScroll - 1) {
          el.scrollLeft = 0;
        } else {
          el.scrollLeft += speed;
        }
      });
    }, 30);

    return () => window.clearInterval(interval);
  }, []);

  const registerAutoScroll = (key: string) => (el: HTMLDivElement | null) => {
    autoScrollRefs.current[key] = el;
    if (el) {
      requestAnimationFrame(() => updateScrollState(key));
    }
  };

  const pauseAutoScroll = (key: string) => {
    autoScrollPaused.current.add(key);
  };

  const resumeAutoScroll = (key: string) => {
    if (manualScrollKeys.current.has(key)) return;
    autoScrollPaused.current.delete(key);
  };

  const markManualScroll = (key: string) => {
    manualScrollKeys.current.add(key);
    autoScrollPaused.current.add(key);
    updateScrollState(key);
  };

  const setDragging = (key: string, value: boolean) => {
    setDraggingRows((prev) => {
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
  };

  const startDragging = (key: string) => {
    setDragging(key, true);
    if (dragTimerRef.current[key]) {
      window.clearTimeout(dragTimerRef.current[key]);
    }
  };

  const stopDragging = (key: string) => {
    if (dragTimerRef.current[key]) {
      window.clearTimeout(dragTimerRef.current[key]);
      delete dragTimerRef.current[key];
    }
    setDragging(key, false);
  };

  const bumpDragging = (key: string) => {
    setDragging(key, true);
    if (dragTimerRef.current[key]) window.clearTimeout(dragTimerRef.current[key]);
    dragTimerRef.current[key] = window.setTimeout(() => {
      setDragging(key, false);
    }, 180);
  };

  const scrollRow = (key: string, direction: "left" | "right" = "right") => {
    const el = autoScrollRefs.current[key];
    if (!el) return;
    markManualScroll(key);
    startDragging(key);
    const amount = Math.max(160, el.clientWidth * 0.7);
    const delta = direction === "left" ? -amount : amount;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const target = Math.min(maxScroll, Math.max(0, el.scrollLeft + delta));
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ left: target, behavior: "smooth" });
    } else {
      el.scrollLeft = target;
    }
    scheduleScrollStateUpdate(key);
  };

  const computeScrollState = (el: HTMLDivElement | null) => {
    if (!el) return { canLeft: false, canRight: false };
    const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    if (maxScrollLeft <= 8) {
      return { canLeft: false, canRight: false };
    }
    const first = el.firstElementChild as HTMLElement | null;
    const last = el.lastElementChild as HTMLElement | null;
    const leftEdge = first ? first.offsetLeft : 0;
    const rightEdge = last ? last.offsetLeft + last.offsetWidth : el.scrollWidth;
    const visibleLeft = el.scrollLeft;
    const visibleRight = el.scrollLeft + el.clientWidth;
    return {
      canLeft: visibleLeft > leftEdge + 8,
      canRight: visibleRight < rightEdge - 8,
    };
  };

  const updateScrollState = (key: string) => {
    const el = autoScrollRefs.current[key];
    const next = computeScrollState(el);
    setScrollState((prev) => {
      const current = prev[key];
      if (current && current.canLeft === next.canLeft && current.canRight === next.canRight) {
        return prev;
      }
      return { ...prev, [key]: next };
    });
  };

  const handleRowScroll = (key: string) => {
    const now = Date.now();
    const last = scrollUpdateRef.current[key] || 0;
    if (now - last < 80) {
      bumpDragging(key);
      return;
    }
    scrollUpdateRef.current[key] = now;
    updateScrollState(key);
    bumpDragging(key);
  };

  const scheduleScrollStateUpdate = (key: string) => {
    updateScrollState(key);
    if (scrollTimerRef.current[key]) {
      scrollTimerRef.current[key].forEach((id) => window.clearTimeout(id));
    }
    const timers = [
      window.setTimeout(() => updateScrollState(key), 120),
      window.setTimeout(() => updateScrollState(key), 260),
      window.setTimeout(() => updateScrollState(key), 520),
    ];
    scrollTimerRef.current[key] = timers;
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsCompact(window.scrollY > 24);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("arsenalfit:search-state", {
        detail: { expanded: isExpandedMobile },
      }),
    );
  }, [isExpandedMobile]);

  useEffect(() => {
    const handleExternalToggle = () => {
      if (!isMobile) return;
      toggleMobileSearch();
    };

    window.addEventListener("arsenalfit:toggle-search", handleExternalToggle);
    return () => window.removeEventListener("arsenalfit:toggle-search", handleExternalToggle);
  }, [isMobile, isExpandedMobile, results, isLoading]);

  useEffect(() => {
    if (!isMobile && isExpandedMobile) {
      setIsExpandedMobile(false);
    }
  }, [isMobile, isExpandedMobile]);

  useEffect(() => {
    if (!isOpen) return;
    const sync = () => {
      Object.keys(autoScrollRefs.current).forEach((key) => updateScrollState(key));
    };
    const id = window.setTimeout(sync, 0);
    window.addEventListener("resize", sync);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", sync);
    };
  }, [isOpen, results, isMobile]);

  useEffect(() => {
    return () => {
      Object.values(dragTimerRef.current).forEach((id) => window.clearTimeout(id));
      Object.values(scrollTimerRef.current).forEach((ids) =>
        ids.forEach((id) => window.clearTimeout(id)),
      );
    };
  }, []);

  const hasSuggestions = (results?.suggestions?.length || 0) > 0;
  const hasSimilar = (results?.similar?.length || 0) > 0;
  const hasCategories = (results?.categories?.length || 0) > 0;
  const hasCompletions = (results?.completions?.length || 0) > 0;
  const hasHot = (results?.hot?.length || 0) > 0;
  const mostClickedEntries = useMemo(() => {
    if (!results?.mostClicked) return [];
    return Object.entries(results.mostClicked).filter(([, items]) => (items?.length || 0) > 0);
  }, [results]);
  const hasMostClicked = mostClickedEntries.length > 0;
  const getScrollState = (key: string) =>
    scrollState[key] || { canLeft: false, canRight: false };

  const dropdownTitle = useMemo(() => {
    if (!trimmedQuery) return "Promoções e mais vendidos";
    if (hasSuggestions) return "Resultados";
    if (hasCategories) return "Categorias relacionadas";
    return "Sem resultados";
  }, [trimmedQuery, hasSuggestions, hasCategories]);

  const handleFocus = () => {
    if (isMobile && !isExpandedMobile) {
      setIsExpandedMobile(true);
    }
    setIsFocused(true);
    openDropdown();
    if (!results) fetchResults(trimmedQuery);
  };

  const handleClearOrClose = () => {
    if (query.trim().length > 0) {
      setQuery("");
      fetchResults("");
      inputRef.current?.focus();
      return;
    }

    if (isMobile) {
      collapseMobileSearch();
    }
  };

  const handleSuggestionClick = async (item: SuggestionItem) => {
    trackLocalInterest(item);
    try {
      await fetch("/api/search-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: "click", product_id: item.id, term: trimmedQuery }),
      });
    } catch {
      // ignore tracking errors
    }
  };

  const handleCategoryClick = async (category: CategoryItem) => {
    trackLocalInterest({ name: category.name, category_name: category.name } as any);
    try {
      await fetch("/api/search-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: "category_click", term: trimmedQuery, category_id: category.id }),
      });
    } catch {
      // ignore tracking errors
    }
  };
  const handleCategoryNavigate = (
    category: CategoryItem | null,
    genderOverride?: "masculino" | "feminino" | null,
  ) => {
    if (!category) return;
    handleCategoryClick(category);
    goToCategory(category, genderOverride ?? null);
  };

  const storeInterest = (key: string) => {
    if (!key) return;
    try {
      const raw = localStorage.getItem("arsenalfit_interest");
      const data = raw ? JSON.parse(raw) : {};
      data[key] = (data[key] || 0) + 1;
      localStorage.setItem("arsenalfit_interest", JSON.stringify(data));
    } catch {
      // ignore storage errors
    }
  };

  const trackLocalInterest = (item: { name?: string; category_name?: string | null }) => {
    const text = `${item.name || ""} ${item.category_name || ""}`.toLowerCase();
    if (text.includes("whey")) storeInterest("whey");
    if (text.includes("creatina")) storeInterest("creatina");
    if (text.includes("roupa") || text.includes("vestu")) storeInterest("roupas");
    if (text.includes("acess")) storeInterest("acessorios");
    if (text.includes("equip")) storeInterest("equipamentos");
    if (text.includes("suplement")) storeInterest("suplementos");
  };

  const miniCardImageWrapper =
    "h-12 w-12 sm:h-14 sm:w-14 flex-shrink-0 rounded-lg bg-zinc-50 border border-zinc-200 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)] overflow-hidden flex items-center justify-center p-1";
  const miniCardImageClass = "h-full w-full object-contain";
  const showClearOrClose = Boolean(query.trim().length) || (isMobile && isExpandedMobile);
  return (
    <div id="sticky-search" ref={containerRef} className="sticky top-20 md:top-16 z-40">
      <div
        className={`mx-auto max-w-6xl px-4 sm:px-6 transition-all duration-200 ${
          isCompact ? "py-2" : "py-3 sm:py-4"
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-search-toggle
            className="sm:hidden h-11 w-11 rounded-full border border-zinc-200 bg-white/95 backdrop-blur flex items-center justify-center text-zinc-600 shadow-sm hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            onClick={toggleMobileSearch}
            aria-label={isExpandedMobile ? "Fechar busca" : "Abrir busca"}
            aria-expanded={isExpandedMobile}
            aria-controls="sticky-search-field"
          >
            {isExpandedMobile ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </button>

          <div
            id="sticky-search-field"
            className={`relative w-full transition-all duration-200 ${
              isExpandedMobile ? "block" : "hidden sm:block"
            }`}
          >
            <div
              className={`flex items-center gap-2 w-full rounded-full border bg-white/95 backdrop-blur transition-all duration-200 ${
                isCompact
                  ? "h-11 sm:h-12 shadow-[0_18px_40px_rgba(15,23,42,0.16)] border-zinc-200"
                  : "h-11 sm:h-14 shadow-[0_10px_28px_rgba(15,23,42,0.12)] border-zinc-200"
              } ${isFocused ? "ring-2 ring-orange-200/70 border-orange-300" : ""}`}
            >
              <Search className="ml-3 sm:ml-4 h-4 w-4 sm:h-5 sm:w-5 text-zinc-400" />
              <Input
                ref={inputRef}
                type="text"
                placeholder="Buscar produtos, marcas ou categorias..."
                value={query}
                onChange={(e) => setQuerySafe(e.target.value)}
                onFocus={handleFocus}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && trimmedQuery) {
                    if (categoryMatch?.slug) {
                      goToCategory(categoryMatch, categoryMatch.slug === "roupas" ? genderIntent : null);
                      return;
                    }
                    window.location.href = `/produtos?search=${encodeURIComponent(trimmedQuery)}`;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    if (isMobile) {
                      collapseMobileSearch();
                    } else {
                      closeDropdown();
                      setIsFocused(false);
                      inputRef.current?.blur();
                    }
                  }
                }}
                aria-label="Buscar produtos"
                className="h-full flex-1 border-0 bg-transparent px-1 pr-3 text-[13px] sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {showClearOrClose && (
                <button
                  type="button"
                  onClick={handleClearOrClose}
                  className="mr-1 h-10 w-10 rounded-full text-zinc-400 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label={query.trim().length > 0 ? "Limpar busca" : "Fechar busca"}
                >
                  <X className="h-4 w-4 mx-auto" />
                </button>
              )}
            </div>
          </div>
        </div>

        {isOpen && isMobile && isExpandedMobile && (
          <button
            type="button"
            className="fixed inset-0 z-20 bg-zinc-950/35 backdrop-blur-[1px]"
            onClick={collapseMobileSearch}
            aria-label="Fechar busca"
          />
        )}

        {isOpen && (
          <div className="relative">
            <div className="absolute left-0 right-0 z-30 mt-3 max-h-[min(72vh,620px)] rounded-3xl border border-zinc-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] overflow-y-auto overflow-x-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 text-sm text-zinc-500">
                <span className="font-medium text-zinc-700 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  {dropdownTitle}
                </span>
                {isLoading && <span className="text-xs">Carregando...</span>}
              </div>

              {trimmedQuery &&
                !hasSuggestions &&
                results?.didYouMean &&
                results.didYouMean.toLowerCase() !== trimmedQuery.toLowerCase() && (
                <div className="px-4 py-3 border-b border-zinc-100 bg-white">
                  <button
                    type="button"
                    onClick={() => setQuerySafe(results.didYouMean || "")}
                    className="text-sm text-zinc-700 hover:text-zinc-900 flex items-center gap-2"
                  >
                    <span className="text-zinc-500">Você não quis dizer:</span>
                    <span className="font-semibold underline underline-offset-2">
                      {results.didYouMean}
                    </span>
                  </button>
                </div>
              )}

              {trimmedQuery && categoryMatch && (
                <div className="px-4 py-4 border-b border-zinc-100 bg-white">
                  <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-white via-white to-zinc-50 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        onClick={() => handleCategoryNavigate(categoryMatch, null)}
                        className="flex flex-1 items-center gap-3 text-left group"
                      >
                        <div className="h-12 w-12 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center overflow-hidden">
                          {categoryMatch.image_url ? (
                            <img
                              src={categoryMatch.image_url}
                              alt={categoryMatch.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <Tag className="h-5 w-5 text-zinc-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-400">
                            Categoria
                          </p>
                          <p className="text-base font-semibold text-zinc-900 truncate">
                            {categoryMatch.name}
                          </p>
                          <p className="text-xs text-zinc-500">
                            Acessar página da categoria
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCategoryNavigate(categoryMatch, null)}
                        className="inline-flex items-center justify-center rounded-full border border-zinc-200 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-700 hover:border-zinc-300 hover:text-zinc-900 transition"
                      >
                        Ver
                      </button>
                    </div>

                    {categoryMatch.slug === "roupas" && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleCategoryNavigate(categoryMatch, "masculino")}
                          className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-700 hover:border-zinc-300 hover:text-zinc-900"
                        >
                          Masculino
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCategoryNavigate(categoryMatch, "feminino")}
                          className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-700 hover:border-zinc-300 hover:text-zinc-900"
                        >
                          Feminino
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {!trimmedQuery && hasHot && (() => {
                const hotScroll = getScrollState("hot");
                const showLeft = hotScroll.canLeft && manualScrollKeys.current.has("hot");
                const showRight = hotScroll.canRight;
                const hotDragging = Boolean(draggingRows.hot);
                return (
                <div className="px-4 py-3 sm:py-4 border-b border-zinc-100">
                  <div className="flex items-center gap-2 text-[10px] sm:text-xs uppercase tracking-widest text-zinc-400 mb-2">
                    <span>Quentes do dia</span>
                  </div>
                  <div className="relative">
                    {showLeft && (
                      <button
                        type="button"
                        onClick={() => scrollRow("hot", "left")}
                        className="absolute left-1 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full border border-zinc-300 bg-white/95 text-zinc-500 shadow-md hover:text-zinc-900 hover:border-zinc-400 transition-all duration-200 hover:scale-105 active:scale-95"
                        aria-label="Voltar quentes do dia"
                      >
                        <ChevronLeft className="h-4 w-4 mx-auto" />
                      </button>
                    )}
                    {showRight && (
                      <button
                        type="button"
                        onClick={() => scrollRow("hot", "right")}
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full border border-zinc-300 bg-white/95 text-zinc-500 shadow-md hover:text-zinc-900 hover:border-zinc-400 transition-all duration-200 hover:scale-105 active:scale-95"
                        aria-label="Ver mais quentes do dia"
                      >
                        <ChevronRight className="h-4 w-4 mx-auto" />
                      </button>
                    )}
                    <div
                      className={`rounded-2xl transition-shadow duration-200 ${
                        hotDragging
                          ? "shadow-[0_18px_40px_rgba(15,23,42,0.18)]"
                          : "shadow-[0_10px_28px_rgba(15,23,42,0.12)]"
                      }`}
                    >
                      <div
                        ref={registerAutoScroll("hot")}
                        onScroll={() => handleRowScroll("hot")}
                        onMouseEnter={() => pauseAutoScroll("hot")}
                        onMouseLeave={() => {
                          resumeAutoScroll("hot");
                          stopDragging("hot");
                        }}
                        onPointerDown={() => {
                          markManualScroll("hot");
                          startDragging("hot");
                        }}
                        onPointerUp={() => {
                          resumeAutoScroll("hot");
                          stopDragging("hot");
                        }}
                        onTouchStart={() => {
                          markManualScroll("hot");
                          startDragging("hot");
                        }}
                        onTouchEnd={() => {
                          resumeAutoScroll("hot");
                          stopDragging("hot");
                        }}
                        onWheel={() => markManualScroll("hot")}
                        className="flex gap-2 sm:gap-3 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-proximity overscroll-x-contain px-8 sm:px-12 scroll-px-8 sm:scroll-px-12"
                      >
                        {(isMobile ? results?.hot.slice(0, 6) : results?.hot).map((item) => (
                          <a
                            key={`hot-${item.id}`}
                            href={item.slug ? `/produto/${item.slug}` : item.affiliate_link || "#"}
                            onClick={() => handleSuggestionClick(item)}
                            className="min-w-[170px] sm:min-w-[190px] rounded-xl border border-zinc-200 bg-white px-3 py-2.5 flex items-center gap-2 hover:border-zinc-300 snap-start"
                          >
                            <div className={miniCardImageWrapper}>
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt={item.name}
                                  className={miniCardImageClass}
                                  loading="lazy"
                                />
                              ) : (
                                <Search className="h-4 w-4 text-zinc-400" />
                              )}
                            </div>
                            <div className="text-[11px] sm:text-xs">
                              <div className="text-zinc-500 flex items-center gap-1">
                                <Flame className="h-3 w-3 text-orange-500" />
                                <span>Quente</span>
                              </div>
                              <div className="font-semibold text-zinc-900">{formatPrice(item.price)}</div>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                );
              })()}

              {!trimmedQuery && hasMostClicked && (
                <div className="px-4 py-3 sm:py-4 border-b border-zinc-100">
                  <div className="flex items-center gap-2 text-[10px] sm:text-xs uppercase tracking-widest text-zinc-400 mb-3">
                    <span>Mais procurados</span>
                  </div>
                  <div className="space-y-4">
                    {(isMobile ? mostClickedEntries.slice(0, 2) : mostClickedEntries).map(
                      ([key, items]) => {
                      const rowKey = `most-${key}`;
                      const rowScroll = getScrollState(rowKey);
                      const showLeft =
                        rowScroll.canLeft && manualScrollKeys.current.has(rowKey);
                      const showRight = rowScroll.canRight;
                      const rowDragging = Boolean(draggingRows[rowKey]);
                      return (
                      <div key={`most-${key}`}>
                        <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">
                          {key}
                        </div>
                        <div className="relative">
                          {showLeft && (
                            <button
                              type="button"
                              onClick={() => scrollRow(rowKey, "left")}
                              className="absolute left-1 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full border border-zinc-300 bg-white/95 text-zinc-500 shadow-md hover:text-zinc-900 hover:border-zinc-400 transition-all duration-200 hover:scale-105 active:scale-95"
                              aria-label={`Voltar em ${key}`}
                            >
                              <ChevronLeft className="h-4 w-4 mx-auto" />
                            </button>
                          )}
                          {showRight && (
                            <button
                              type="button"
                              onClick={() => scrollRow(rowKey, "right")}
                              className="absolute right-1 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full border border-zinc-300 bg-white/95 text-zinc-500 shadow-md hover:text-zinc-900 hover:border-zinc-400 transition-all duration-200 hover:scale-105 active:scale-95"
                              aria-label={`Ver mais em ${key}`}
                            >
                              <ChevronRight className="h-4 w-4 mx-auto" />
                            </button>
                          )}
                          <div
                            className={`rounded-2xl transition-shadow duration-200 ${
                              rowDragging
                                ? "shadow-[0_18px_40px_rgba(15,23,42,0.18)]"
                                : "shadow-[0_10px_28px_rgba(15,23,42,0.12)]"
                            }`}
                          >
                            <div
                              ref={registerAutoScroll(`most-${key}`)}
                              onScroll={() => handleRowScroll(`most-${key}`)}
                              onMouseEnter={() => pauseAutoScroll(`most-${key}`)}
                              onMouseLeave={() => {
                                resumeAutoScroll(`most-${key}`);
                                stopDragging(`most-${key}`);
                              }}
                              onPointerDown={() => {
                                markManualScroll(`most-${key}`);
                                startDragging(`most-${key}`);
                              }}
                              onPointerUp={() => {
                                resumeAutoScroll(`most-${key}`);
                                stopDragging(`most-${key}`);
                              }}
                              onTouchStart={() => {
                                markManualScroll(`most-${key}`);
                                startDragging(`most-${key}`);
                              }}
                              onTouchEnd={() => {
                                resumeAutoScroll(`most-${key}`);
                                stopDragging(`most-${key}`);
                              }}
                              onWheel={() => markManualScroll(`most-${key}`)}
                              className="flex gap-2 sm:gap-3 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-proximity overscroll-x-contain px-8 sm:px-12 scroll-px-8 sm:scroll-px-12"
                            >
                              {(isMobile ? items.slice(0, 8) : items).map((item) => (
                                <a
                                  key={`most-${key}-${item.id}`}
                                  href={item.slug ? `/produto/${item.slug}` : item.affiliate_link || "#"}
                                  onClick={() => handleSuggestionClick(item)}
                                  className="min-w-[170px] sm:min-w-[190px] rounded-xl border border-zinc-200 bg-white px-3 py-2.5 flex items-center gap-2 hover:border-zinc-300 snap-start"
                                >
                                  <div className={miniCardImageWrapper}>
                                    {item.image_url ? (
                                      <img
                                        src={item.image_url}
                                        alt={item.name}
                                        className={miniCardImageClass}
                                        loading="lazy"
                                      />
                                    ) : (
                                      <Search className="h-4 w-4 text-zinc-400" />
                                    )}
                                  </div>
                                  <div className="text-[11px] sm:text-xs">
                                    <div className="font-semibold text-zinc-900">
                                      {formatPrice(item.price)}
                                    </div>
                                    <div className="text-[10px] text-zinc-500 line-clamp-1">
                                      {item.name}
                                    </div>
                                  </div>
                                </a>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      );
                    },
                    )}
                  </div>
                </div>
              )}

              {trimmedQuery && hasCompletions && (
                <div className="px-4 py-3 border-b border-zinc-100">
                  <p className="text-xs uppercase tracking-widest text-zinc-400 mb-2">
                    Sugestões de busca
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {results?.completions.map((term) => (
                      <button
                        key={`completion-${term}`}
                        className="text-xs px-3 py-1 rounded-full border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300"
                        onClick={() => setQuerySafe(term)}
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {trimmedQuery && hasSuggestions && (
                <div className="divide-y divide-zinc-100">
                  {results?.suggestions.map((item) => (
                    <a
                      key={item.id}
                      href={item.slug ? `/produto/${item.slug}` : item.affiliate_link || "#"}
                      onClick={() => handleSuggestionClick(item)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition"
                    >
                      <div className="h-12 w-12 rounded-xl bg-zinc-100 overflow-hidden flex items-center justify-center">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <Search className="h-5 w-5 text-zinc-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 line-clamp-1">
                          {item.name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          {item.price !== null && <span>{formatPrice(item.price)}</span>}
                          {item.badge === "promo" && (
                            <span className="px-2 py-0.5 rounded-full bg-lime-100 text-lime-700">
                              Promoção
                            </span>
                          )}
                          {item.badge === "popular" && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              Mais vendido
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-zinc-400">Ver</span>
                    </a>
                  ))}
                </div>
              )}

              {trimmedQuery && hasCategories && (
                <div className="border-t border-zinc-100 px-4 py-4 space-y-2">
                  <p className="text-xs uppercase tracking-widest text-zinc-400 mb-2">
                    Categorias relacionadas
                  </p>
                  {results?.categories.map((category) => (
                    <a
                      key={category.id}
                      href={category.slug ? `/categoria/${category.slug}` : "#"}
                      onClick={() => handleCategoryClick(category)}
                      className="flex items-center gap-2 text-sm text-zinc-700 hover:text-zinc-900"
                    >
                      <Tag className="h-4 w-4 text-zinc-400" />
                      {category.name}
                    </a>
                  ))}
                </div>
              )}

              {trimmedQuery && hasSuggestions && hasSimilar && (
                <div className="border-t border-zinc-100 px-4 py-3">
                  <p className="text-xs uppercase tracking-widest text-zinc-400 mb-2">
                    Produtos similares
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {results?.similar.map((item) => (
                      <a
                        key={item.id}
                        href={item.slug ? `/produto/${item.slug}` : item.affiliate_link || "#"}
                        onClick={() => handleSuggestionClick(item)}
                        className="flex items-center gap-2 text-sm text-zinc-700 hover:text-zinc-900"
                      >
                        <TrendingUp className="h-4 w-4 text-zinc-400" />
                        <span className="line-clamp-1">{item.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {trimmedQuery && !hasSuggestions && !hasCategories && !isLoading && (
                <div className="px-4 py-6 text-sm text-zinc-500">
                  Nenhum resultado. Tente buscar por outra palavra ou categoria.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


