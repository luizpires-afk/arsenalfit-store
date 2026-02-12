import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import ReactGA from "react-ga4";

import { Card } from "@/Components/ui/card";
import { Badge } from "@/Components/ui/badge";
import { Button } from "@/Components/ui/button";

import {
  ExternalLink,
  ShoppingCart,
  Star,
  Truck,
} from "lucide-react";

import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";

import { PriceDisclaimer } from "@/Components/PriceDisclaimer";
import { useCart } from "@/hooks/useCart";
import { bounceCartIcon, flyToCartAnimation, showAddToCartToast } from "@/lib/cartFeedback";

interface ProductProps {
  product: {
    id: string;
    title?: string;
    name?: string;
    description?: string;
    price: number;
    pix_price?: number | null;
    original_price?: number;
    previous_price?: number | null;
    image_url: string | null;
    images?: string[];
    slug: string;
    affiliate_link: string | null;
    source_url?: string | null;
    checkout_url?: string | null;
    is_featured?: boolean;
    is_on_sale?: boolean;
    discount_percentage?: number;
    free_shipping?: boolean;
    last_sync?: string;
    updated_at?: string;
    ultima_verificacao?: string | null;
    detected_at?: string | null;
    marketplace?: string;
    brand?: string | null;
    subcategory?: string | null;
    rating?: number;
    reviews_count?: number;
  };
  variant?: "default" | "compact" | "technical" | "curation" | "highlight";
}

export const ProductCard = ({ product, variant = "default" }: ProductProps) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const { addToCart, isLoggedIn } = useCart();
  const navigate = useNavigate();
  const imageRef = useRef<HTMLImageElement | null>(null);

  const displayTitle = product.name || product.title || "Produto sem nome";
  const productLink = product.slug ? `/produto/${product.slug}` : "#";

  const images =
    product.images && product.images.length > 0
      ? [product.image_url, ...product.images].filter(Boolean) as string[]
      : [
          product.image_url ||
            "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400",
        ];

  const discount =
    product.discount_percentage && product.discount_percentage > 0
      ? Math.round(product.discount_percentage)
      : product.original_price && product.original_price > product.price
      ? Math.round(
          ((product.original_price - product.price) / product.original_price) * 100
        )
      : null;
  const saving =
    product.original_price && product.original_price > product.price
      ? product.original_price - product.price
      : null;
  const isHighlight = variant === "highlight";
  const isCompact = variant !== "default";
  const isTechnical = variant === "technical";
  const isCuration = variant === "curation";
  const showOriginalPrice = true;
  const showSavings = true;
  const showDisclaimer = variant === "default";
  const showBrand = variant === "default";
  const showMicrotext = variant === "default" || isHighlight;

  const getMarketplaceLabel = () => {
    const market = product.marketplace?.toLowerCase();
    if (market?.includes("amazon")) return { name: "Amazon" };
    if (market?.includes("mercado")) return { name: "Mercado Livre" };
    return { name: "Oferta Exclusiva" };
  };

  const marketInfo = getMarketplaceLabel();
  const lastUpdated = product.updated_at
    ? new Date(product.updated_at)
    : product.last_sync
      ? new Date(product.last_sync)
      : product.ultima_verificacao
        ? new Date(product.ultima_verificacao)
        : null;

  const hasDrop = typeof product.previous_price === "number" && product.previous_price > product.price;
  const detectedAt = product.detected_at ? new Date(product.detected_at) : null;
  const isRecentDrop = hasDrop && detectedAt ? Date.now() - detectedAt.getTime() <= 24 * 60 * 60 * 1000 : false;
  const pixPrice =
    typeof product.pix_price === "number" && Number.isFinite(product.pix_price)
      ? product.pix_price
      : null;
  const showPix = pixPrice !== null && pixPrice > 0;
  const pixSaving =
    showPix && pixPrice !== null && product.price > pixPrice
      ? product.price - pixPrice
      : null;

  const fixedBadge = product.free_shipping
    ? {
        label: "Frete grátis",
        className:
          "bg-[#a3e635] text-black text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-tighter shadow-md gap-1",
      }
    : {
        label: marketInfo.name,
        className:
          marketInfo.name === "Mercado Livre"
            ? "bg-[#facc15] text-black text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-tighter shadow-md gap-1"
            : marketInfo.name === "Amazon"
              ? "bg-[#f59e0b] text-black text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-tighter shadow-md gap-1"
              : "bg-zinc-900 text-white text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-tighter shadow-md gap-1",
      };

  const dynamicBadge = (() => {
    if (discount && discount >= 1) {
      return {
        label: `-${discount}%`,
        className:
          "bg-[hsl(var(--badge-red))] text-white text-[11px] font-black px-3 py-1.5 rounded-lg uppercase tracking-widest shadow-lg shadow-red-500/30 gap-1",
      };
    }
    if (isTechnical && isRecentDrop) {
      return {
        label: "Caiu hoje",
        className:
          "bg-zinc-900 text-white text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-widest border border-zinc-800 gap-1",
      };
    }
    if (isRecentDrop) {
      return {
        label: "Caiu hoje",
        className:
          "bg-[#a3e635] text-black text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-widest shadow-md gap-1",
      };
    }
    if (isCuration || product.is_featured) {
      return {
        label: "Destaque",
        className:
          "bg-black text-white text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-widest border border-zinc-700 gap-1",
      };
    }
    return null;
  })();

  useEffect(() => {
    setImageLoaded(false);
  }, [images[0]]);

  const rating =
    typeof product.rating === "number" ? product.rating : null;
  const ratingCount =
    typeof product.reviews_count === "number" ? product.reviews_count : null;


  const trackLocalInterest = () => {
    try {
      const raw = localStorage.getItem("arsenalfit_interest");
      const data = raw ? JSON.parse(raw) : {};
      const text = displayTitle.toLowerCase();
      const bump = (key: string) => {
        data[key] = (data[key] || 0) + 1;
      };
      if (text.includes("whey")) bump("whey");
      if (text.includes("creatina")) bump("creatina");
      if (text.includes("roupa") || text.includes("vestu")) bump("roupas");
      if (text.includes("acessor")) bump("acessorios");
      if (text.includes("equip")) bump("equipamentos");
      if (text.includes("suplement")) bump("suplementos");
      localStorage.setItem("arsenalfit_interest", JSON.stringify(data));
    } catch {
      // ignore storage errors
    }
  };

  const handleQuickAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isLoggedIn) {
      await addToCart(product.id);
      return;
    }

    const targetEl = document.querySelector("[data-cart-icon]") as HTMLElement | null;
    Promise.resolve(
      flyToCartAnimation({
        sourceEl: imageRef.current,
        targetEl,
        imageSrc: images[0],
      })
    ).then(() => bounceCartIcon(targetEl));

    const added = await addToCart(product.id, 1, { silent: true });
    if (added) {
      showAddToCartToast({ onGoToCart: () => navigate("/carrinho") });
    }
  };

  const handleBuyNow = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const purchaseLink = product.affiliate_link || undefined;

    if (purchaseLink) {
      ReactGA.event({
        category: "Conversion",
        action: "Click_Affiliate",
        label: `${displayTitle} (${product.id})`,
        value: Number(product.price),
      });

      supabase.rpc("increment_product_clicks", { product_id: product.id });
      trackLocalInterest();

      window.open(purchaseLink, "_blank", "noopener,noreferrer");
    } else {
      toast.error("Link de afiliado indisponível no momento.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -8 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="h-full"
    >
      <Card
        className={`h-full flex flex-col group relative overflow-hidden border-zinc-800 bg-zinc-900 rounded-[24px] shadow-lg hover:shadow-[#a3e635]/20 hover:border-[#a3e635]/50 transition-all duration-300 focus-within:ring-2 focus-within:ring-[#a3e635]/40 ${
          isCompact ? "rounded-[20px]" : ""
        } ${isHighlight ? "ring-1 ring-orange-200/60 shadow-[0_12px_30px_rgba(249,115,22,0.15)]" : ""}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120px_120px_at_80%_0%,rgba(163,230,53,0.08),transparent_60%)] opacity-0 group-hover:opacity-100 transition-opacity" />

        <div className={`relative aspect-[5/4] overflow-hidden bg-white ${isCompact ? "p-2.5" : "p-4"}`}>
          <div className="absolute top-3 left-3 z-20 flex flex-col gap-2 items-start">
            {fixedBadge && (
              <Badge className={fixedBadge.className}>
                {product.free_shipping && (
                  <Truck size={10} strokeWidth={3} />
                )}
                {fixedBadge.label}
              </Badge>
            )}
            {dynamicBadge && (
              <Badge className={dynamicBadge.className}>
                {dynamicBadge.label}
              </Badge>
            )}
          </div>

          <Link to={productLink} className="block w-full h-full focus:outline-none">
            <div
              className={`pointer-events-none absolute inset-0 bg-zinc-100 transition-opacity duration-300 ${imageLoaded ? "opacity-0" : "opacity-100 animate-pulse"}`}
            />
            <img
              src={images[0]}
              alt={displayTitle}
              ref={imageRef}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(true)}
              className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105 will-change-transform"
              loading="lazy"
            />
          </Link>

          <motion.button
            onClick={handleQuickAdd}
            className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all z-20 bg-zinc-100/85 text-zinc-500 hover:bg-[#FF6A00] hover:text-black hover:scale-110 shadow-sm"
            aria-label="Adicionar ao carrinho"
            whileTap={{ scale: 0.9 }}
          >
            <ShoppingCart className="w-4 h-4 transition-all" />
          </motion.button>
        </div>

        <div className={`flex flex-col flex-1 ${isCompact ? "p-3" : "p-5"}`}>

          <Link to={productLink} className="mb-1 block">
            <h3
              className={`font-bold text-white leading-tight line-clamp-2 group-hover:text-[#a3e635] transition-colors uppercase italic tracking-tight ${
                isCompact ? "text-[13px]" : "text-base"
              }`}
            >
              {displayTitle}
            </h3>
          </Link>

          {rating !== null && rating > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-zinc-400 mb-2">
              <div className="flex items-center gap-0.5 text-amber-400">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={12}
                    className={star <= Math.round(rating) ? "fill-current" : ""}
                  />
                ))}
              </div>
              <span className="text-zinc-400">{rating.toFixed(1)}</span>
              {ratingCount !== null && ratingCount > 0 && (
                <span className="text-zinc-500">({ratingCount})</span>
              )}
            </div>
          )}

          {showBrand && (product.brand || product.subcategory) && (
            <p className="text-[11px] text-zinc-500 mb-2 uppercase tracking-tight flex gap-2 items-center">
              {product.brand && <span className="font-semibold">{product.brand}</span>}
              {product.brand && product.subcategory && <span className="text-zinc-600">•</span>}
              {product.subcategory && <span>{product.subcategory}</span>}
            </p>
          )}

          <div className={`mt-auto ${isCompact ? "pt-2 space-y-2" : "pt-4 space-y-3"}`}>
            <div className="flex flex-col">
              {showOriginalPrice && product.original_price && product.original_price > product.price && (
                <span className="text-[11px] text-zinc-500/80 line-through font-medium">
                  De: R$ {Number(product.original_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              )}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest">Por</span>
                  <span
                    className={`font-black text-white tracking-tighter italic ${
                      isHighlight
                        ? "text-2xl sm:text-[28px]"
                        : isCompact
                          ? "text-lg sm:text-xl"
                          : "text-2xl sm:text-3xl"
                    }`}
                  >
                    R$ {Number(product.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              {showPix && (
                <div className="flex items-center gap-2 text-emerald-300 font-bold">
                  <span className="rounded-full border border-emerald-400/40 bg-emerald-400/15 px-2 py-0.5 text-[9px] uppercase tracking-widest">
                    Pix
                  </span>
                  <span className="text-[12px]">
                    no Pix: R${" "}
                    {Number(pixPrice).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
              {showSavings && (pixSaving || saving) && (
                <span className="text-[11px] text-emerald-300/90 font-semibold">
                  Economize R${" "}
                  {Number(pixSaving ?? saving).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              )}
              {!isCompact && (
                <span className="text-[10px] text-zinc-500/80">À vista ou em até 12x</span>
              )}
              {showDisclaimer && (
                <PriceDisclaimer
                  lastUpdated={lastUpdated}
                  className="text-[10px] text-zinc-500/80"
                />
              )}
            </div>

            <Button
              onClick={handleBuyNow}
              className={`w-full bg-[#a3e635] hover:bg-[#b7f24c] text-black font-black rounded-xl transition-all flex items-center justify-center gap-2 uppercase italic tracking-wide shadow-[0_0_15px_rgba(163,230,53,0.1)] group-hover:shadow-[0_0_24px_rgba(163,230,53,0.4)] hover:scale-[1.01] ${
                isCompact ? "h-9 text-[11px]" : "h-11 text-sm"
              }`}
              aria-label={`Ver oferta de ${displayTitle}`}
            >
              Ver oferta <ExternalLink size={16} strokeWidth={2.5} />
            </Button>
            {showMicrotext && (
              <p className="text-[10px] text-zinc-500/80 text-center">
                Você será redirecionado para o site oficial
              </p>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
};









