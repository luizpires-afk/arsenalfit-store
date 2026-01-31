
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ChevronLeft,
  Heart,
  ShieldCheck,
  ShoppingCart,
  Star,
  Tag,
  TrendingDown,
} from "lucide-react";
import { toast } from "sonner";

import { Layout } from "@/Components/layout/Layout";
import { Button } from "@/Components/ui/button";
import { Skeleton } from "@/Components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/Components/ui/tabs";
import { ProductAnalysis } from "@/Components/ProductAnalysis";

import { useProduct } from "@/hooks/useProducts";
import { useCart } from "@/hooks/useCart";
import { supabase } from "@/integrations/supabase/client";

interface ExtendedProduct {
  id: string;
  name?: string;
  title?: string;
  price: number;
  detected_price?: number | null;
  image_url?: string;
  description?: string;
  short_description?: string;
  brand?: string;
  subcategory?: string;
  affiliate_link?: string;
  source_url?: string;
  free_shipping?: boolean;
  marketplace?: string;
}

export default function ProductDetails() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();

  const { product, loading, error } = useProduct(slug);
  const p = product as ExtendedProduct | null;

  const [showFullDesc, setShowFullDesc] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [related, setRelated] = useState<ExtendedProduct[]>([]);

  const title = p?.name || p?.title || "Produto";

  const fullDescription = useMemo(() => {
    if (!p)
      return "Produto selecionado pela curadoria Arsenal. Nossa sele??o prioriza performance, proced?ncia e custo-benef?cio.";
    return (
      p.description ||
      p.short_description ||
      "Produto selecionado pela curadoria Arsenal. Nossa sele??o prioriza performance, proced?ncia e custo-benef?cio."
    );
  }, [p]);

  const truncatedDescription = useMemo(() => {
    if (showFullDesc) return fullDescription;
    if (fullDescription.length > 420) return fullDescription.slice(0, 420) + "?";
    return fullDescription;
  }, [fullDescription, showFullDesc]);

  const competitorPrice = p?.detected_price ?? null;
  const savingsPercent = useMemo(() => {
    if (!p?.price || !competitorPrice) return null;
    const pct = Math.round((1 - p.price / competitorPrice) * 100);
    return pct > 0 ? pct : 0;
  }, [p?.price, competitorPrice]);

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

  const handleFavorite = () => {
    setIsFavorited((s) => !s);
    toast.success(isFavorited ? "Monitoramento removido" : "Produto monitorado para alertas");
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

  if (error || !p)
    return (
      <Layout>
        <div className="container-fit flex flex-col items-center justify-center py-32 text-center">
          <ShieldCheck className="h-16 w-16 text-zinc-800 mb-6" />
          <h1 className="text-4xl font-black uppercase tracking-tighter text-white">Produto indispon?vel</h1>
          <p className="text-zinc-500 mt-2 mb-8 uppercase text-xs font-bold tracking-widest">
            N?o encontramos este item no nosso arsenal.
          </p>
          <Button asChild>
            <a href="/produtos">Voltar para a vitrine</a>
          </Button>
        </div>
      </Layout>
    );

  return (
    <Layout>
      <div className="container-fit py-8 md:py-12">
        <button
          onClick={() => navigate(-1)}
          className="group flex items-center gap-2 text-zinc-500 hover:text-primary mb-12 transition-all font-black uppercase italic text-[10px] tracking-widest"
        >
          <div className="p-2 rounded-full bg-zinc-900 group-hover:bg-primary group-hover:text-black transition-colors">
            <ChevronLeft size={14} />
          </div>
          Voltar ao Arsenal
        </button>

        <div className="grid gap-12 lg:gap-16 lg:grid-cols-2 items-start">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="relative">
            <div className="absolute -inset-6 bg-primary/10 blur-[100px] rounded-full opacity-30" />
            <div className="group aspect-square overflow-hidden rounded-[40px] bg-zinc-900/60 border border-white/5 backdrop-blur-xl flex items-center justify-center">
              <img
                src={p.image_url || "/placeholder.svg"}
                alt={title}
                className="h-full w-full object-contain transition-transform duration-700 group-hover:scale-105 drop-shadow-[0_25px_60px_rgba(0,0,0,0.45)]"
                loading="lazy"
              />
              {competitorPrice && competitorPrice > p.price && (
                <div className="absolute top-6 right-6 bg-green-500 text-black font-black text-[10px] px-4 py-2 rounded-full flex items-center gap-1 shadow-lg">
                  <TrendingDown size={12} /> {Math.round(((competitorPrice - p.price) / competitorPrice) * 100)}% OFF
                </div>
              )}
              {p.free_shipping && (
                <div className="absolute bottom-6 left-6 bg-primary text-black font-black text-[10px] px-3 py-1 rounded-full uppercase tracking-widest">
                  Frete gr?tis
                </div>
              )}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col space-y-8">
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap text-xs uppercase font-black tracking-widest text-zinc-500">
                {p.brand && (
                  <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black tracking-widest">
                    <Tag size={12} /> {p.brand}
                  </span>
                )}
                {p.subcategory && <span>{p.subcategory}</span>}
                <span className="text-zinc-600">REF: {p.id?.slice(0, 8)}</span>
              </div>

              <h1 className="text-3xl md:text-4xl font-black leading-tight tracking-tight text-white">{title}</h1>

              <div className="flex items-end gap-4 bg-zinc-900/40 w-fit p-6 rounded-[28px] border border-white/5">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase text-zinc-500 mb-1 tracking-widest">Pre?o ArsenalFit</span>
                  <span className="text-4xl md:text-5xl font-black text-white italic">R$ {Number(p.price).toFixed(2).replace(".", ",")}</span>
                  {savingsPercent !== null && (
                    <span className="text-[11px] text-green-400 font-bold uppercase tracking-widest mt-1">Economia real: -{savingsPercent}%</span>
                  )}
                </div>
                {competitorPrice && (
                  <div className="flex flex-col border-l border-white/10 pl-4 pb-1">
                    <span className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">Na concorr?ncia</span>
                    <span className="text-xl font-bold text-zinc-500 line-through italic">
                      R$ {Number(competitorPrice).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-zinc-300 text-lg leading-relaxed font-semibold italic">
                {truncatedDescription}
              </p>
              {fullDescription.length > 420 && (
                <button onClick={() => setShowFullDesc((s) => !s)} className="text-primary text-sm font-bold underline underline-offset-4">
                  {showFullDesc ? "Mostrar menos" : "Ler mais"}
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex gap-4">
                <button
                  onClick={() => (p.affiliate_link || p.source_url) && window.open(p.affiliate_link || p.source_url, "_blank")}
                  className="relative flex-[3] h-16 bg-primary hover:bg-white text-black rounded-[20px] font-black text-lg flex items-center justify-center overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                  <span className="relative z-10 flex items-center gap-3">
                    Resgatar oferta <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
                  </span>
                </button>

                <button
                  onClick={handleFavorite}
                  className={`flex-1 h-16 rounded-[20px] flex flex-col items-center justify-center border-2 transition-all gap-1 ${
                    isFavorited
                      ? "bg-primary border-primary text-black"
                      : "border-white/10 bg-zinc-900/50 text-zinc-500 hover:border-primary hover:text-primary"
                  }`}
                  aria-label="Monitorar pre?o"
                >
                  <Heart className={isFavorited ? "fill-current" : ""} size={20} />
                  <span className="text-[9px] font-black uppercase tracking-tighter">
                    {isFavorited ? "Monitorando" : "Monitorar"}
                  </span>
                </button>
              </div>

              <Button
                onClick={() => addToCart(p.id, 1)}
                variant="ghost"
                className="w-full h-12 bg-zinc-900/50 text-zinc-200 rounded-2xl font-bold hover:bg-zinc-800 hover:text-white transition-all"
              >
                <ShoppingCart size={14} className="mr-2" /> Salvar no carrinho
              </Button>

              <div className="flex items-center justify-center gap-6 pt-2 flex-wrap text-[10px] uppercase tracking-widest text-zinc-500 font-black">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={14} className="text-primary" /> Link seguro
                </div>
                {p.free_shipping && (
                  <div className="flex items-center gap-2">
                    <Star size={14} className="text-primary fill-primary" /> Frete gr?tis ArsenalFit
                  </div>
                )}
                {p.marketplace && <div className="flex items-center gap-2">Marketplace: {p.marketplace}</div>}
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="mt-16">
          <Tabs defaultValue="descricao" className="w-full">
            <TabsList className="bg-zinc-900/40 border border-white/5 rounded-full px-2 py-1">
              <TabsTrigger value="descricao">Descri??o</TabsTrigger>
              <TabsTrigger value="ficha">Ficha t?cnica</TabsTrigger>
            </TabsList>
            <TabsContent value="descricao" className="mt-6 bg-black/40 border border-white/5 rounded-3xl p-6 text-zinc-200 leading-relaxed">
              <p className="whitespace-pre-line text-lg">{fullDescription}</p>
            </TabsContent>
            <TabsContent value="ficha" className="mt-6 bg-black/40 border border-white/5 rounded-3xl p-6 text-zinc-200 leading-relaxed">
              <p className="text-sm italic text-zinc-300">
                Curadoria ArsenalFit: ficha t?cnica dispon?vel sob demanda. Produtos s?o avaliados por pureza, proced?ncia e desempenho real.
              </p>
            </TabsContent>
          </Tabs>
        </motion.div>

        <ProductAnalysis
          price={p.price}
          competitor_price={competitorPrice || undefined}
          quality_score={9}
          technical_analysis="Curadoria ArsenalFit: pureza comprovada, laudo por lote e performance consistente."
          best_use_case="Performance e hipertrofia"
        />

        {related.length > 0 && (
          <div className="mt-10 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-primary uppercase tracking-widest">
              <Star size={16} className="fill-primary" /> Outros produtos da marca
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {related.map((item) => (
                <a
                  key={item.id}
                  href={`/produtos/${item.slug || item.id}`}
                  className="min-w-[220px] bg-zinc-900/50 border border-white/5 rounded-2xl p-4 hover:border-primary transition-colors"
                >
                  <img src={item.image_url || "/placeholder.svg"} alt={item.name || item.title || "Produto"} className="h-32 w-full object-contain mb-3" />
                  <p className="text-white font-bold line-clamp-2">{item.name || item.title}</p>
                  <p className="text-primary font-black text-lg">R$ {Number(item.price).toFixed(2).replace(".", ",")}</p>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
