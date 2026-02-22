import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Search,
  Lock,
  ShieldCheck,
  Star,
  Tag,
  Truck,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";

import { Layout } from "@/Components/layout/Layout";
import { Button } from "@/Components/ui/button";
import { Skeleton } from "@/Components/ui/skeleton";
import { Dialog, DialogContent, DialogTrigger } from "@/Components/ui/dialog";
import SEOHead from "@/Components/SEOHead";
import { StickyMobileCTA } from "@/Components/product/StickyMobileCTA";
import { openMonitorInfoDialog } from "@/Components/monitoring/MonitorInfoDialog";

import { normalizeMarketplaceProduct } from "@/lib/productNormalizer";
import { formatPrice } from "@/lib/validators";
import { bounceCartIcon, flyToCartAnimation, showAddToCartToast } from "@/lib/cartFeedback";
import { resolvePricePresentation } from "@/lib/pricing.js";
import {
  buildOutProductPath,
  getOfferUnavailableMessage,
  resolveOfferUrl,
} from "@/lib/offer.js";
import { useProduct } from "@/hooks/useProducts";
import { useCart } from "@/hooks/useCart";
import { useSyncedHeight } from "@/hooks/useSyncedHeight";
import { usePriceMonitoring } from "@/hooks/usePriceMonitoring";
import { supabase } from "@/integrations/supabase/client";

interface ExtendedProduct {
  id: string;
  name?: string;
  title?: string;
  slug?: string;
  price: number;
  pix_price?: number | null;
  pix_price_source?: string | null;
  detected_price?: number | null;
  original_price?: number | null;
  discount_percentage?: number | null;
  image_url?: string | null;
  images?: string[] | null;
  description?: string | null;
  short_description?: string | null;
  brand?: string | null;
  subcategory?: string | null;
  affiliate_link?: string | null;
  source_url?: string | null;
  canonical_offer_url?: string | null;
  ml_item_id?: string | null;
  free_shipping?: boolean | null;
  marketplace?: string | null;
  status?: string | null;
  auto_disabled_reason?: string | null;
  advantages?: string[] | null;
  specifications?: Record<string, unknown> | null;
  instructions?: string | null;
  usage_instructions?: string | null;
  sku?: string | null;
  is_featured?: boolean | null;
  is_active?: boolean | null;
  stock_quantity?: number | null;
  last_sync?: string | null;
  updated_at?: string | null;
  ultima_verificacao?: string | null;
}

const buildJsonLd = (
  product: ExtendedProduct,
  title: string,
  images: string[],
  availability?: string
) => {
  const offers: Record<string, unknown> = {
    "@type": "Offer",
    price: product.price,
    priceCurrency: "BRL",
  };

  if (availability) {
    offers.availability = availability;
  }

  if (typeof window !== "undefined") {
    offers.url = window.location.href;
  }

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    sku: product.sku || undefined,
    image: images.length ? images : undefined,
    offers,
  };
};

const stripUndefined = (input: unknown): unknown => {
  if (Array.isArray(input)) {
    return input.map(stripUndefined).filter((item) => item !== undefined);
  }
  if (typeof input === "object" && input !== null) {
    const output: Record<string, unknown> = {};
    Object.entries(input).forEach(([key, value]) => {
      const cleaned = stripUndefined(value);
      if (cleaned !== undefined) output[key] = cleaned;
    });
    return output;
  }
  return input === undefined ? undefined : input;
};

const ProductGallery = ({
  title,
  images,
  activeIndex,
  onSelect,
  className,
  isSticky,
  mainImageRef,
}: {
  title: string;
  images: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
  className?: string;
  isSticky?: boolean;
  mainImageRef?: RefObject<HTMLImageElement>;
}) => (
  <div className={`flex flex-col gap-4 ${className ?? ""}`}>
    <div className="flex-1">
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className={`group relative h-full w-full overflow-hidden rounded-[28px] border border-zinc-200 bg-white p-4 sm:p-6 shadow-[0_16px_36px_rgba(15,23,42,0.08)] transition-[transform,box-shadow,filter] duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none motion-reduce:transform-none ${
              isSticky
                ? "lg:scale-[0.985] lg:shadow-[0_18px_40px_rgba(0,0,0,0.08)] lg:filter lg:saturate-[1.02] lg:contrast-[1.02]"
                : ""
            }`}
            aria-label="Ampliar imagem do produto"
          >
            <div className="flex h-full min-h-[260px] sm:min-h-[340px] lg:min-h-[440px] items-center justify-center">
              <img
                src={images[activeIndex]}
                alt={title}
                ref={mainImageRef}
                className="block h-auto w-full max-w-[92%] max-h-[320px] sm:max-h-[360px] lg:max-h-[560px] object-contain object-center"
                loading="lazy"
              />
            </div>
            <span className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-600 shadow-sm opacity-70 transition-opacity duration-200 group-hover:opacity-100">
              <ZoomIn size={12} /> Clique para ampliar
            </span>
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl w-[92vw] rounded-[24px] border border-zinc-200 bg-white p-6">
          <div className="flex items-center justify-center max-h-[80vh]">
            <img
              src={images[activeIndex]}
              alt={title}
              className="max-h-[80vh] w-full object-contain"
              loading="lazy"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>

    {images.length > 1 && (
      <div className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-5 sm:overflow-visible">
        {images.map((img, index) => (
          <button
            key={`${img}-${index}`}
            onClick={() => onSelect(index)}
            className={`min-w-[72px] rounded-2xl border p-2 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
              activeIndex === index ? "border-primary" : "border-zinc-200"
            }`}
            aria-label={`Selecionar imagem ${index + 1}`}
            type="button"
          >
            <img src={img} alt="" className="h-16 w-full object-contain" loading="lazy" />
          </button>
        ))}
      </div>
    )}
  </div>
);

const BuyBoxSticky = ({
  price,
  secondaryPrice,
  hasPixPrice,
  originalPrice,
  savings,
  discountPercent,
  isFeatured,
  freeShipping,
  installment,
  lastUpdatedLabel,
  onBuyNow,
  canBuyNow,
  buyDisabledText,
  onAddToCart,
  isBuying,
  isAdding,
  containerRef,
  monitorActive,
  onToggleMonitor,
  monitorDisabled,
}: {
  price: number;
  secondaryPrice?: number | null;
  hasPixPrice?: boolean;
  originalPrice?: number | null;
  savings?: number | null;
  discountPercent?: number | null;
  isFeatured?: boolean | null;
  freeShipping?: boolean | null;
  installment?: string;
  lastUpdatedLabel?: string | null;
  onBuyNow: () => void;
  canBuyNow: boolean;
  buyDisabledText?: string | null;
  onAddToCart: () => void;
  isBuying: boolean;
  isAdding: boolean;
  containerRef?: RefObject<HTMLDivElement>;
  monitorActive?: boolean;
  onToggleMonitor?: () => void;
  monitorDisabled?: boolean;
}) => (
  <div
    ref={containerRef}
    className="lg:sticky lg:top-[calc(var(--header-height,72px)+24px)]"
  >
    <div className="rounded-[24px] border border-zinc-200 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {isFeatured && (
            <span className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-700">
              Destaque Arsenal
            </span>
          )}
        </div>

        {onToggleMonitor && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onToggleMonitor}
              disabled={monitorDisabled}
              aria-pressed={Boolean(monitorActive)}
              aria-label={monitorActive ? "Desativar monitoramento de preco" : "Ativar monitoramento de preco"}
              className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[12px] font-bold text-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-orange))]/30 ${
                monitorActive
                  ? "border-orange-200 bg-orange-50 text-orange-700"
                  : "border-zinc-200 bg-white hover:border-[hsl(var(--accent-orange))]/40 hover:text-[hsl(var(--accent-orange))]"
              } ${monitorDisabled ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <Search size={16} className="text-[hsl(var(--accent-orange))]" />
              {monitorActive ? "Monitorando" : "Monitorar produto"}
            </button>
            <button
              type="button"
              onClick={openMonitorInfoDialog}
              className="inline-flex h-11 items-center rounded-full border border-zinc-200 bg-white px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600 transition-colors hover:border-[hsl(var(--accent-orange))]/35 hover:text-[hsl(var(--accent-orange))]"
            >
              Como monitorar
            </button>
            <p className="w-full text-right text-[11px] text-zinc-500">
              Ative e acompanhe no carrinho. Você recebe e-mail só quando cair.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-400">
          {hasPixPrice && secondaryPrice !== null && secondaryPrice > price
            ? "Preco no Pix"
            : "Preco ArsenalFit"}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <span className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-900">
            {formatPrice(price)}
          </span>
          {originalPrice && originalPrice > price && (
            <span className="text-sm text-zinc-400 line-through">
              {formatPrice(originalPrice)}
            </span>
          )}
        </div>
        {secondaryPrice !== null && secondaryPrice > price && (
          <p className="text-sm text-zinc-600">
            ou {formatPrice(secondaryPrice)} em outros meios
          </p>
        )}
        {savings && savings > 0 && discountPercent ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            Economia de {formatPrice(savings)} ({discountPercent}%)
          </span>
        ) : null}
        {installment && (
          <p className="text-xs text-zinc-500">{installment}</p>
        )}
      </div>

      <div className="grid gap-3">
        <Button
          onClick={onBuyNow}
          className="h-14 rounded-2xl bg-[hsl(var(--accent-orange))] text-white font-semibold text-base transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-[hsl(var(--accent-orange))]/90 focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-orange))]/40"
          disabled={isBuying || !canBuyNow}
        >
          {isBuying ? "Redirecionando..." : canBuyNow ? "Comprar agora" : "Aguardando validacao"}
        </Button>
        <Button
          variant="outline"
          onClick={onAddToCart}
          className="h-12 rounded-2xl border-zinc-200 text-zinc-900 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm hover:border-[hsl(var(--accent-orange))]/40 hover:text-[hsl(var(--accent-orange))]"
          disabled={isAdding}
        >
          {isAdding ? "Adicionando..." : "Adicionar ao carrinho"}
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {freeShipping && (
          <span className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold text-zinc-600">
            <Truck size={14} className="text-[hsl(var(--accent-orange))]" />
            Frete grátis
          </span>
        )}
        <span className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold text-zinc-600">
          <ShieldCheck size={14} className="text-[hsl(var(--accent-orange))]" />
          Compra segura
        </span>
        <span className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold text-zinc-600">
          <Lock size={14} className="text-[hsl(var(--accent-orange))]" />
          Checkout protegido
        </span>
      </div>

      {lastUpdatedLabel && (
        <p className="text-[11px] text-zinc-400">{lastUpdatedLabel}</p>
      )}
      {!canBuyNow && buyDisabledText && (
        <p className="text-[11px] text-amber-600">{buyDisabledText}</p>
      )}
    </div>
  </div>
);

const DESCRIPTION_ALLOWED_TAGS = new Set([
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "strong",
  "b",
  "em",
  "i",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "a",
]);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sanitizeDescriptionHtml = (raw: string) => {
  if (!raw.trim()) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return `<p>${escapeHtml(raw).replace(/\n/g, "<br/>")}</p>`;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, "text/html");

  const sanitizeNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.parentNode?.removeChild(node);
      return;
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();

    if (!DESCRIPTION_ALLOWED_TAGS.has(tagName)) {
      const fragment = doc.createDocumentFragment();
      while (element.firstChild) {
        fragment.appendChild(element.firstChild);
      }
      element.replaceWith(fragment);
      return;
    }

    const attributes = [...element.attributes];
    for (const attr of attributes) {
      const attrName = attr.name.toLowerCase();
      if (tagName === "a") {
        if (!["href", "target", "rel", "title"].includes(attrName)) {
          element.removeAttribute(attr.name);
          continue;
        }
        if (attrName === "href") {
          const href = element.getAttribute("href") || "";
          const isSafe = /^https?:\/\//i.test(href);
          if (!isSafe) element.removeAttribute("href");
        }
      } else {
        element.removeAttribute(attr.name);
      }
    }

    for (const child of [...element.childNodes]) {
      sanitizeNode(child);
    }
  };

  for (const child of [...doc.body.childNodes]) {
    sanitizeNode(child);
  }

  return doc.body.innerHTML.trim();
};

const CollapsibleDescription = ({ text }: { text: string }) => {
  const [expanded, setExpanded] = useState(false);
  const hasHtmlMarkup = /<\/?[a-z][\s\S]*>/i.test(text);
  const sanitizedHtml = useMemo(
    () => (hasHtmlMarkup ? sanitizeDescriptionHtml(text) : ""),
    [hasHtmlMarkup, text],
  );
  const canCollapse = text.length > 240;
  const previewLength = Math.max(240, Math.floor(text.length * 0.38));
  const previewText =
    text.length > previewLength
      ? text.slice(0, previewLength).replace(/\s+\S*$/, "")
      : text;
  const displayText = expanded ? text : previewText;

  if (hasHtmlMarkup) {
    return (
      <div
        className="prose prose-zinc max-w-none text-sm leading-relaxed prose-p:my-2 prose-li:my-0.5 prose-a:text-[hsl(var(--accent-orange))]"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <p className="text-sm leading-relaxed text-zinc-700 whitespace-pre-line">
          {displayText}
          {!expanded && displayText !== text ? "..." : null}
        </p>
        {!expanded && displayText !== text && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white via-white/80 to-transparent" />
        )}
      </div>
      {canCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[hsl(var(--accent-orange))] transition-colors hover:text-[hsl(var(--accent-orange))]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-orange))]/30"
          aria-expanded={expanded}
        >
          {expanded ? "Ver menos" : "Ver mais"}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      )}
    </div>
  );
};

export default function ProductDetails() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { addToCart, isLoggedIn, user } = useCart();
  const { isMonitoring, toggleMonitoring, loading: monitoringLoading } = usePriceMonitoring(user);

  const { product, loading, error } = useProduct(slug);
  const p = product as ExtendedProduct | null;

  const [showStickyCTA, setShowStickyCTA] = useState(false);
  const [related, setRelated] = useState<ExtendedProduct[]>([]);
  const [activeImage, setActiveImage] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const [monitorBusy, setMonitorBusy] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [isSticky, setIsSticky] = useState(false);
  const imageCardRef = useRef<HTMLDivElement | null>(null);
  const buyBoxRef = useRef<HTMLDivElement | null>(null);
  const stickySentinelRef = useRef<HTMLDivElement | null>(null);
  const mainImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setSyncEnabled(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useSyncedHeight(buyBoxRef, imageCardRef, syncEnabled);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 1024px)");
    let observer: IntersectionObserver | null = null;
    let resizeTimeout: number | null = null;

    const readHeaderOffset = () => {
      const rootStyles = getComputedStyle(document.documentElement);
      const raw = rootStyles.getPropertyValue("--header-height").trim();
      const parsed = Number.parseFloat(raw);
      const headerHeight = Number.isFinite(parsed) ? parsed : 72;
      return headerHeight + 24;
    };

    const setupObserver = () => {
      if (!stickySentinelRef.current) return;
      if (observer) observer.disconnect();
      const offset = readHeaderOffset();
      observer = new IntersectionObserver(
        ([entry]) => setIsSticky(!entry.isIntersecting),
        {
          root: null,
          threshold: 0,
          rootMargin: `-${offset}px 0px 0px 0px`,
        }
      );
      observer.observe(stickySentinelRef.current);
    };

    const handleMediaChange = () => {
      if (media.matches) {
        setupObserver();
      } else {
        if (observer) observer.disconnect();
        setIsSticky(false);
      }
    };

    const handleResize = () => {
      if (!media.matches) return;
      if (resizeTimeout) window.clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(setupObserver, 100);
    };

    handleMediaChange();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    if (media.addEventListener) {
      media.addEventListener("change", handleMediaChange);
    } else {
      media.addListener(handleMediaChange);
    }

    return () => {
      if (observer) observer.disconnect();
      if (resizeTimeout) window.clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
      if (media.addEventListener) {
        media.removeEventListener("change", handleMediaChange);
      } else {
        media.removeListener(handleMediaChange);
      }
      setIsSticky(false);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [slug]);

  const title = p?.name || p?.title || "Produto";
  const isMonitored = Boolean(p?.id && isMonitoring(p.id));

  const galleryImages = useMemo(() => {
    const extraImages = Array.isArray(p?.images) ? p.images : [];
    const seen = new Set<string>();
    const images = [p?.image_url, ...extraImages]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim())
      .filter((value) => {
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
      });
    return images.length ? images : ["/placeholder.svg"];
  }, [p?.image_url, p?.images]);

  useEffect(() => {
    setActiveImage(0);
  }, [p?.id, galleryImages.length]);

  const normalized = useMemo(() => {
    if (!p) return null;
    try {
      return normalizeMarketplaceProduct(p);
    } catch (error) {
      console.error("product_normalizer_failed", { productId: p.id, error });
      return {
        specs: [],
        ingredients: [],
        allergens: [],
        usage: [],
        howToUse: [],
        warnings: [],
        benefits: [],
        faq: [],
        headline: typeof p.short_description === "string" ? p.short_description : "",
        subheadline: "",
        isCreatine100g: false,
        technicalRating: {
          scores: [],
          finalScore: null,
          finalLabel: "N/A",
          note: "Dados técnicos indisponíveis.",
        },
      };
    }
  }, [p]);
  const shortDescription = normalized?.headline || "";
  const originLine = normalized?.subheadline || null;
  const longDescription = useMemo(() => {
    const rawDescription =
      typeof p?.description === "string"
        ? p.description
        : p?.description != null
          ? String(p.description)
          : "";
    if (!rawDescription) return "";
    const trimmed = rawDescription.trim();
    if (!trimmed) return "";
    if (shortDescription && trimmed === shortDescription.trim()) return "";
    return trimmed;
  }, [p?.description, shortDescription]);
  const pricing = useMemo(() => (p ? resolvePricePresentation(p) : null), [p]);
  const finalPrice = pricing?.displayPricePrimary ?? p?.price ?? 0;
  const secondaryPrice = pricing?.displayPriceSecondary ?? null;
  const offerResolution = useMemo(() => (p ? resolveOfferUrl(p) : null), [p]);
  const canBuyNow = Boolean(p?.id && offerResolution?.canRedirect);
  const buyDisabledText = offerResolution
    ? getOfferUnavailableMessage(offerResolution, p?.marketplace ?? "")
    : null;
  const listPrice = pricing?.displayStrikethrough ?? null;
  const savings = pricing?.savings ?? null;
  const lastUpdated = p?.updated_at
    ? new Date(p.updated_at)
    : p?.last_sync
      ? new Date(p.last_sync)
      : p?.ultima_verificacao
        ? new Date(p.ultima_verificacao)
        : null;
  const availability =
    p?.is_active === false || p?.stock_quantity === 0
      ? "https://schema.org/OutOfStock"
      : p
        ? "https://schema.org/InStock"
        : undefined;

  const discountPercent = pricing?.discountPercent ?? null;
  const effectiveDiscountPercent = discountPercent;

  const lastUpdatedLabel = lastUpdated
    ? `Última atualização em ${lastUpdated.toLocaleDateString("pt-BR")} às ${lastUpdated.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : null;

  useEffect(() => {
    const onScroll = () => {
      setShowStickyCTA(window.scrollY > 520);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!p) return;
    const productForSchema = { ...p, price: finalPrice };
    const jsonLd = stripUndefined(
      buildJsonLd(
        productForSchema,
        title,
        galleryImages.filter((img) => !img.includes("placeholder")),
        availability,
      )
    );
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-schema", "product");
    script.text = JSON.stringify(jsonLd);
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, [p, title, galleryImages, availability, finalPrice]);

  useEffect(() => {
    const fetchRelated = async () => {
      if (p?.brand) {
        const { data } = await supabase
          .from("products")
          .select("*")
          .eq("brand", p.brand)
          .neq("id", p.id)
          .eq("is_active", true)
          .limit(12);
        setRelated((data as ExtendedProduct[]) || []);
      }
    };
    fetchRelated();
  }, [p?.brand, p?.id]);

  useEffect(() => {
    if (!p?.id) return;
    void Promise.resolve(
      supabase.rpc("enqueue_price_check_refresh", {
        p_product_id: p.id,
        p_force: false,
        p_reason: "product_page_view",
      })
    ).catch(() => {});
  }, [p?.id]);

  const handleToggleMonitoring = async () => {
    if (!p) return;
    if (monitorBusy) return;
    if (!isLoggedIn) {
      toast.info("Entre para monitorar este produto.", {
        description: "Crie sua conta para receber alerta por e-mail quando o preco cair.",
        action: {
          label: "Entrar",
          onClick: () => navigate("/auth"),
        },
      });
      return;
    }

    setMonitorBusy(true);
    try {
      const enabled = await toggleMonitoring({
        id: p.id,
        title,
        imageUrl: p.image_url ?? null,
        price: Number(finalPrice) || 0,
      });
      toast.success(
        enabled
          ? "Monitoramento ativado. Veja em Carrinho > Produtos monitorados."
          : "Monitoramento removido",
      );
    } finally {
      setMonitorBusy(false);
    }
  };

  const handleBuyNow = () => {
    if (!p?.id || !canBuyNow) {
      toast.error(buyDisabledText || "Oferta indisponivel no momento.");
      return;
    }
    void Promise.resolve(
      supabase.rpc("enqueue_price_check_refresh", {
        p_product_id: p.id,
        p_force: false,
        p_reason: "offer_click",
      })
    ).catch(() => {});
    setIsBuying(true);
    window.location.assign(buildOutProductPath(p.id, "product_details"));
    window.setTimeout(() => setIsBuying(false), 800);
  };

  const handleAddToCart = async () => {
    if (!p) return;
    if (!isLoggedIn) {
      await addToCart(p.id, 1);
      return;
    }
    setIsAdding(true);
    const targetEl = document.querySelector("[data-cart-icon]") as HTMLElement | null;
    Promise.resolve(
      flyToCartAnimation({
        sourceEl: mainImageRef.current,
        targetEl,
        imageSrc: galleryImages?.[activeImage],
      })
    ).then(() => bounceCartIcon(targetEl));
    const added = await addToCart(p.id, 1, { silent: true });
    if (added) {
      showAddToCartToast({
        onGoToCart: () => navigate("/carrinho"),
      });
    }
    setIsAdding(false);
  };

  if (loading)
    return (
      <Layout>
        <div className="container-fit py-12 space-y-10">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-48 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <div className="grid gap-12 lg:grid-cols-2">
            <Skeleton className="aspect-square w-full rounded-[40px]" />
            <div className="space-y-6">
              <Skeleton className="h-12 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-3xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </Layout>
    );

  if (error || !p || !normalized)
    return (
      <Layout>
        <div className="container-fit flex flex-col items-center justify-center py-32 text-center">
          <ShieldCheck className="h-16 w-16 text-zinc-800 mb-6" />
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Produto indisponível</h1>
          <p className="text-zinc-500 mt-2 mb-8 text-sm">
            Não encontramos este item no nosso arsenal.
          </p>
          <Button asChild>
            <a href="/produtos">Voltar para a vitrine</a>
          </Button>
        </div>
      </Layout>
    );

  const seoTitleParts = [p.brand, title, normalized.isCreatine100g ? "100g" : undefined].filter(Boolean);
  const seoTitle = seoTitleParts.join(" | ");
  const seoDescription = [normalized.headline, normalized.subheadline, p.short_description]
    .filter(Boolean)
    .join(" ");

  const descriptionText =
    longDescription || shortDescription || "Descrição completa não informada.";

  return (
    <Layout>
      <SEOHead
        title={seoTitle}
        description={seoDescription}
        ogType="product"
        ogImage={galleryImages?.[0]}
      />

      <div className="container-fit py-8 md:py-12 pb-24 md:pb-12">
        <button
          onClick={() => navigate(-1)}
          className="group inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[hsl(var(--accent-orange))]/40 hover:text-zinc-900 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-orange))]/40 mb-8"
          aria-label="Voltar"
          type="button"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors group-hover:bg-[hsl(var(--accent-orange))]/10 group-hover:text-[hsl(var(--accent-orange))]">
            <ChevronLeft size={14} />
          </span>
          Voltar
        </button>

        <div ref={stickySentinelRef} className="hidden lg:block h-px w-full" aria-hidden="true" />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}>
            <div
              ref={imageCardRef}
              className="flex flex-col lg:sticky lg:top-[calc(var(--header-height,72px)+24px)]"
            >
              <ProductGallery
                title={title}
                images={galleryImages}
                activeIndex={activeImage}
                onSelect={setActiveImage}
                className="flex-1"
                isSticky={isSticky}
                mainImageRef={mainImageRef}
              />
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="space-y-3">
              <h1 className="text-2xl md:text-3xl font-semibold leading-snug tracking-tight text-zinc-900">
                {title}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-semibold">
                {p.brand && (
                  <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary">
                    <Tag size={12} /> {p.brand}
                  </span>
                )}
                {p.subcategory && <span>{p.subcategory}</span>}
                <span className="text-zinc-400">REF: {String(p.id ?? "").slice(0, 8)}</span>
              </div>
              {originLine && <p className="text-xs text-zinc-500">{originLine}</p>}
            </div>

            <BuyBoxSticky
              price={finalPrice}
              secondaryPrice={secondaryPrice}
              hasPixPrice={Boolean(pricing?.pixPrice)}
              originalPrice={listPrice}
              savings={savings}
              discountPercent={effectiveDiscountPercent}
              isFeatured={p.is_featured}
              freeShipping={p.free_shipping}
              installment={normalized.installment}
              lastUpdatedLabel={lastUpdatedLabel}
              onBuyNow={handleBuyNow}
              canBuyNow={canBuyNow}
              buyDisabledText={buyDisabledText}
              onAddToCart={handleAddToCart}
              isBuying={isBuying}
              isAdding={isAdding}
              containerRef={buyBoxRef}
              monitorActive={isMonitored}
              onToggleMonitor={handleToggleMonitoring}
              monitorDisabled={monitorBusy || monitoringLoading}
            />

          </motion.div>
        </div>

        <div className="mt-10 rounded-[24px] border border-zinc-200 bg-white p-6 shadow-[0_16px_32px_rgba(15,23,42,0.06)]">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Descrição</p>
          <h2 className="text-lg font-semibold text-zinc-900 mt-2">Detalhes do produto</h2>
          <div className="mt-4">
            <CollapsibleDescription text={descriptionText} />
          </div>
        </div>

        {related.length > 0 && (
          <div className="mt-12 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
              <Star size={14} className="text-primary fill-primary" /> Outros produtos da marca
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {related.map((item) => (
                <a
                  key={item.id}
                  href={`/produto/${item.slug || item.id}`}
                  className="min-w-[220px] bg-white border border-zinc-200 rounded-2xl p-4 hover:border-primary transition-colors shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
                >
                  <img
                    src={item.image_url || "/placeholder.svg"}
                    alt={item.name || item.title || "Produto"}
                    className="h-32 w-full object-contain mb-3"
                  />
                  <p className="text-zinc-900 font-semibold line-clamp-2">
                    {item.name || item.title}
                  </p>
                  <p className="text-primary font-bold text-lg">
                    {formatPrice(resolvePricePresentation(item as any).displayPricePrimary ?? item.price)}
                  </p>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <StickyMobileCTA
        visible={showStickyCTA}
        price={finalPrice}
        secondaryPrice={secondaryPrice}
        hasPixPrice={Boolean(pricing?.pixPrice)}
        onBuyNow={handleBuyNow}
        disabled={!canBuyNow}
      />
    </Layout>
  );
}




