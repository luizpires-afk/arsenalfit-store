import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import ReactGA from "react-ga4";

import { Card } from "@/Components/ui/card";
import { Badge } from "@/Components/ui/badge";
import { Button } from "@/Components/ui/button";

import {
  ExternalLink,
  Heart,
  Zap,
  Truck,
  CheckCircle,
  ShoppingBag,
} from "lucide-react";

import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { formatDistanceToNow, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ProductProps {
  product: {
    id: string;
    title?: string;
    name?: string;
    description?: string;
    price: number;
    original_price?: number;
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
    marketplace?: string;
    brand?: string | null;
    subcategory?: string | null;
  };
}

export const ProductCard = ({ product }: ProductProps) => {
  const [user, setUser] = useState<any>(null);
  const queryClient = useQueryClient();

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
      ? product.discount_percentage
      : product.original_price && product.original_price > product.price
      ? Math.round(
          ((product.original_price - product.price) / product.original_price) * 100
        )
      : null;

  const getSyncStatus = () => {
    const dateStr = product.updated_at || product.last_sync;
    if (!dateStr) return "Preço verificado";
    const dateObj = new Date(dateStr);
    return isValid(dateObj)
      ? `Atualizado ${formatDistanceToNow(dateObj, {
          addSuffix: true,
          locale: ptBR,
        })}`
      : "Preço verificado";
  };

  const getMarketplaceLabel = () => {
    const market = product.marketplace?.toLowerCase();
    if (market?.includes("amazon")) return { name: "Amazon", color: "text-yellow-500" };
    if (market?.includes("mercado")) return { name: "Mercado Livre", color: "text-yellow-400" };
    return { name: "Oferta Exclusiva", color: "text-[#a3e635]" };
  };

  const marketInfo = getMarketplaceLabel();

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setUser(user);
    };
    checkAuth();
  }, []);

  const { data: favorites = [] } = useQuery({
    queryKey: ["favorites", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("favorites")
        .select("product_id")
        .eq("user_id", user.id);
      return data || [];
    },
    enabled: !!user,
  });

  const isFavorited = favorites.some((f: any) => f.product_id === product.id);

  const handleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      toast.error("Faça login para salvar favoritos", {
        description: "Você precisa de uma conta para criar sua lista de desejos.",
      });
      return;
    }

    const previousFavorites = queryClient.getQueryData(["favorites", user.id]);

    try {
      if (isFavorited) {
        await supabase
          .from("favorites")
          .delete()
          .eq("product_id", product.id)
          .eq("user_id", user.id);
        toast.success("Removido dos favoritos");
      } else {
        await supabase
          .from("favorites")
          .insert({ product_id: product.id, user_id: user.id });
        toast.success("Salvo nos favoritos!");
      }
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    } catch (error) {
      toast.error("Erro ao atualizar favoritos");
      queryClient.setQueryData(["favorites", user?.id], previousFavorites as any);
    }
  };

  const handleBuyNow = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const purchaseLink =
      product.checkout_url || product.affiliate_link || product.source_url || undefined;

    if (purchaseLink) {
      ReactGA.event({
        category: "Conversion",
        action: "Click_Affiliate",
        label: `${displayTitle} (${product.id})`,
        value: Number(product.price),
      });

      supabase.rpc("increment_product_clicks", { product_id: product.id });

      window.open(purchaseLink, "_blank", "noopener,noreferrer");
    } else {
      toast.error("Link de oferta indisponível no momento.");
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
      <Card className="h-full flex flex-col group relative overflow-hidden border-zinc-800 bg-zinc-900 rounded-[26px] shadow-lg hover:shadow-[#a3e635]/20 hover:border-[#a3e635]/50 transition-all duration-300 focus-within:ring-2 focus-within:ring-[#a3e635]/40">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120px_120px_at_80%_0%,rgba(163,230,53,0.08),transparent_60%)] opacity-0 group-hover:opacity-100 transition-opacity" />

        <div className="relative aspect-square overflow-hidden bg-white p-6">
          <div className="absolute top-3 left-3 z-20 flex flex-col gap-2 items-start">
            {product.free_shipping && (
              <Badge className="bg-[#a3e635] hover:bg-[#8cc629] text-black text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-tighter flex items-center gap-1 shadow-md">
                <Truck size={10} strokeWidth={3} /> Frete Grátis
              </Badge>
            )}
            {(product.is_featured || (product as any).featured) && (
              <Badge className="bg-black text-white border border-zinc-700 px-2 py-1 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                <Zap size={10} className="fill-[#a3e635] text-[#a3e635]" /> Destaque
              </Badge>
            )}
          </div>

          <Link to={productLink} className="block w-full h-full focus:outline-none">
            <img
              src={images[0]}
              alt={displayTitle}
              className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110 will-change-transform"
              loading="lazy"
            />
          </Link>

          <AnimatePresence>
            {discount && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute bottom-3 right-3 z-20">
                <div className="bg-red-600 text-white text-xs font-black px-2 py-1 rounded shadow-lg -rotate-2">
                  -{discount}%
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={handleFavorite}
            className={`absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all z-20 ${
              isFavorited
                ? "bg-red-500 text-white shadow-red-500/30 shadow-lg scale-110"
                : "bg-zinc-100/80 text-zinc-400 hover:bg-white hover:text-red-500 hover:scale-110"
            }`}
            aria-label={isFavorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            aria-pressed={isFavorited}
          >
            <Heart className={`w-4 h-4 transition-all ${isFavorited ? "fill-current" : ""}`} />
          </button>
        </div>

        <div className="flex flex-col flex-1 p-5">
          <div className="flex items-center justify-between mb-2">
            <span
              className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 ${marketInfo.color}`}
            >
              <ShoppingBag size={10} /> {marketInfo.name}
            </span>
            <div className="flex items-center gap-1 text-[9px] text-zinc-600 font-medium">
              <CheckCircle size={10} /> {getSyncStatus()}
            </div>
          </div>

          <Link to={productLink} className="mb-1 block">
            <h3 className="font-bold text-white text-base leading-tight line-clamp-2 group-hover:text-[#a3e635] transition-colors uppercase italic tracking-tight">
              {displayTitle}
            </h3>
          </Link>

          {(product.brand || product.subcategory) && (
            <p className="text-[12px] text-zinc-400 mb-2 uppercase tracking-tight flex gap-2 items-center">
              {product.brand && <span className="font-semibold">{product.brand}</span>}
              {product.brand && product.subcategory && <span className="text-zinc-600">•</span>}
              {product.subcategory && <span>{product.subcategory}</span>}
            </p>
          )}

          <div className="mt-auto pt-4 space-y-3">
            <div className="flex flex-col">
              {product.original_price && product.original_price > product.price && (
                <span className="text-xs text-zinc-500 line-through font-medium">
                  De: R$ {Number(product.original_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              )}
              <div className="flex items-baseline gap-1">
                <span className="text-xs text-zinc-400 font-bold uppercase">Por</span>
                <span className="text-2xl font-black text-white tracking-tighter italic">
                  R$ {Number(product.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500">À vista ou em até 12x</span>
            </div>

            <Button
              onClick={handleBuyNow}
              className="w-full bg-[#a3e635] hover:bg-[#8cc629] text-black font-black h-11 rounded-xl transition-all flex items-center justify-center gap-2 text-sm uppercase italic tracking-wide shadow-[0_0_15px_rgba(163,230,53,0.1)] group-hover:shadow-[0_0_20px_rgba(163,230,53,0.3)]"
              aria-label={`Ver oferta de ${displayTitle}`}
            >
              Ver Oferta <ExternalLink size={16} strokeWidth={2.5} />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
};
