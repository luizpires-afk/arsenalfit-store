import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronLeft,
  Heart,
  ShieldCheck,
  Star,
  Tag,
} from "lucide-react";
import { toast } from "sonner";

import { Layout } from "@/Components/layout/Layout";
import { Button } from "@/Components/ui/button";
import { Skeleton } from "@/Components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/Components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/Components/ui/accordion";
import SEOHead from "@/Components/SEOHead";
import { PriceTriggerCard } from "@/Components/product/PriceTriggerCard";
import { TechSpecPanel } from "@/Components/product/TechSpecPanel";
import { TechnicalRatingCard } from "@/Components/product/TechnicalRatingCard";
import { StickyMobileCTA } from "@/Components/product/StickyMobileCTA";

import { normalizeMarketplaceProduct } from "@/lib/productNormalizer";
import { formatPrice } from "@/lib/validators";
import { useProduct } from "@/hooks/useProducts";
import { useCart } from "@/hooks/useCart";
import { supabase } from "@/integrations/supabase/client";

interface ExtendedProduct {
  id: string;
  name?: string;
  title?: string;
  slug?: string;
  price: number;
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
  free_shipping?: boolean | null;
  marketplace?: string | null;
  advantages?: string[] | null;
  specifications?: Record<string, unknown> | null;
  instructions?: string | null;
  usage_instructions?: string | null;
  sku?: string | null;
  is_featured?: boolean | null;
  is_active?: boolean | null;
  stock_quantity?: number | null;
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

export default function ProductDetails() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();

  const { product, loading, error } = useProduct(slug);
  const p = product as ExtendedProduct | null;

  const [showStickyCTA, setShowStickyCTA] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [related, setRelated] = useState<ExtendedProduct[]>([]);
  const [activeImage, setActiveImage] = useState(0);

  const title = p?.name || p?.title || "Produto";

  const galleryImages = useMemo(() => {
    const images = [p?.image_url, ...(p?.images || [])].filter(Boolean) as string[];
    return images.length ? images : ["/placeholder.svg"];
  }, [p?.image_url, p?.images]);

  useEffect(() => {
    setActiveImage(0);
  }, [p?.id, galleryImages.length]);

  const normalized = useMemo(() => (p ? normalizeMarketplaceProduct(p) : null), [p]);
  const shortDescription = normalized?.headline || "";
  const longDescription = useMemo(() => {
    if (!p?.description) return "";
    const trimmed = p.description.trim();
    if (!trimmed) return "";
    if (shortDescription && trimmed === shortDescription.trim()) return "";
    return trimmed;
  }, [p?.description, shortDescription]);

  const competitorPrice = p?.detected_price ?? null;
  const availability =
    p?.is_active === false || p?.stock_quantity === 0
      ? "https://schema.org/OutOfStock"
      : p
        ? "https://schema.org/InStock"
        : undefined;

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
    const jsonLd = stripUndefined(
      buildJsonLd(p, title, galleryImages.filter((img) => !img.includes("placeholder")), availability)
    );
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-schema", "product");
    script.text = JSON.stringify(jsonLd);
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, [p, title, galleryImages, availability]);

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

  const handleBuyNow = () => {
    const link = p?.affiliate_link || p?.source_url;
    if (!link) {
      toast.error("Link de compra indisponível.");
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
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

  return (
    <Layout>
      <SEOHead title={seoTitle} description={seoDescription} />

      <div className="container-fit py-8 md:py-12 pb-24 md:pb-12">
        <button
          onClick={() => navigate(-1)}
          className="group flex items-center gap-2 text-zinc-500 hover:text-primary mb-8 transition-all text-xs font-semibold uppercase tracking-[0.3em]"
        >
          <div className="p-2 rounded-full bg-black/5 group-hover:bg-primary/20 transition-colors">
            <ChevronLeft size={14} />
          </div>
          Voltar ao Arsenal
        </button>

        <div className="grid gap-10 lg:grid-cols-[3fr_2fr] items-start">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
            <div className="rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="aspect-square w-full flex items-center justify-center">
                <img
                  src={galleryImages[activeImage]}
                  alt={title}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              </div>
            </div>
            {galleryImages.length > 1 && (
              <div className="grid grid-cols-5 gap-3">
                {galleryImages.map((img, index) => (
                  <button
                    key={`${img}-${index}`}
                    onClick={() => setActiveImage(index)}
                    className={`rounded-2xl border p-2 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                      activeImage === index ? "border-primary" : "border-zinc-200"
                    }`}
                    aria-label={`Selecionar imagem ${index + 1}`}
                    type="button"
                  >
                    <img src={img} alt="" className="h-12 w-full object-contain" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap text-xs uppercase tracking-[0.3em] text-zinc-500 font-semibold">
                {p.brand && (
                  <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-semibold tracking-[0.3em]">
                    <Tag size={12} /> {p.brand}
                  </span>
                )}
                {p.subcategory && <span>{p.subcategory}</span>}
                <span className="text-zinc-400">REF: {p.id?.slice(0, 8)}</span>
              </div>

              <h1 className="text-2xl md:text-3xl font-semibold leading-snug tracking-tight text-zinc-900 max-w-2xl">
                {title}
              </h1>
              <p className="text-sm text-zinc-600">{normalized.subheadline}</p>
            </div>

            <PriceTriggerCard
              price={p.price}
              originalPrice={p.original_price}
              pixPrice={normalized.pixPrice || undefined}
              competitorPrice={competitorPrice || undefined}
              installmentText={normalized.installment || undefined}
              onBuyNow={handleBuyNow}
              onAddToCart={() => addToCart(p.id, 1)}
              isBestSeller={Boolean(p.is_featured)}
              isFastShipping={Boolean(p.free_shipping)}
            />

            <div className="space-y-4">
              <p className="text-base text-zinc-700 leading-relaxed">
                {shortDescription || "Descrição curta não informada."}
              </p>

              <ul className="grid gap-2">
                {normalized.benefits.map((benefit, index) => (
                  <li key={`${benefit}-${index}`} className="flex items-start gap-2 text-sm text-zinc-700">
                    <CheckCircle2 size={16} className="text-primary mt-0.5" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                <button
                  type="button"
                  onClick={handleFavorite}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    isFavorited
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-zinc-200 text-zinc-500 hover:border-primary"
                  }`}
                >
                  <Heart className={isFavorited ? "fill-current" : ""} size={14} />
                  {isFavorited ? "Monitorando preço" : "Monitorar preço"}
                </button>
                <div className="inline-flex items-center gap-2 text-zinc-500">
                  <ShieldCheck size={14} className="text-primary" /> Checkout seguro
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="mt-12 rounded-3xl border border-black/10 overflow-hidden">
          <div className="bg-black text-white px-6 py-4">
            <p className="text-xs uppercase tracking-[0.3em] text-white/70">Detalhes do produto</p>
            <h2 className="text-lg font-semibold">Informações completas</h2>
          </div>
          <div className="bg-white p-6">
            <Tabs defaultValue="descricao" className="w-full">
              <TabsList className="flex flex-wrap gap-2 bg-zinc-50 border border-zinc-200 rounded-2xl p-1">
                <TabsTrigger
                  value="descricao"
                  className="rounded-full px-4 py-2 text-sm font-semibold data-[state=active]:bg-black data-[state=active]:text-white"
                >
                  Descrição
                </TabsTrigger>
                <TabsTrigger
                  value="ficha"
                  className="rounded-full px-4 py-2 text-sm font-semibold data-[state=active]:bg-black data-[state=active]:text-white"
                >
                  Ficha técnica
                </TabsTrigger>
                <TabsTrigger
                  value="como-usar"
                  className="rounded-full px-4 py-2 text-sm font-semibold data-[state=active]:bg-black data-[state=active]:text-white"
                >
                  Como usar
                </TabsTrigger>
                <TabsTrigger
                  value="faq"
                  className="rounded-full px-4 py-2 text-sm font-semibold data-[state=active]:bg-black data-[state=active]:text-white"
                >
                  FAQ
                </TabsTrigger>
                <TabsTrigger
                  value="avaliacoes"
                  className="rounded-full px-4 py-2 text-sm font-semibold data-[state=active]:bg-black data-[state=active]:text-white"
                >
                  Avaliações
                </TabsTrigger>
              </TabsList>

              <TabsContent value="descricao" className="mt-6 space-y-4 text-zinc-700">
                {longDescription ? (
                  <p className="whitespace-pre-line leading-relaxed">{longDescription}</p>
                ) : (
                  <p className="text-sm text-zinc-500">Descrição completa não informada.</p>
                )}
              </TabsContent>

              <TabsContent value="ficha" className="mt-6 space-y-8">
                <TechSpecPanel specs={normalized.specs} />
                <TechnicalRatingCard rating={normalized.technicalRating} />
              </TabsContent>

              <TabsContent value="como-usar" className="mt-6 space-y-4">
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-zinc-900">Como usar</h3>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-700">
                    {normalized.howToUse.map((step, index) => (
                      <li key={`${step}-${index}`}>{step}</li>
                    ))}
                  </ol>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                  <p className="font-semibold text-zinc-900 mb-2">Avisos</p>
                  <ul className="list-disc list-inside space-y-1">
                    {normalized.warnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </TabsContent>

              <TabsContent value="faq" className="mt-6">
                <Accordion type="single" collapsible className="w-full">
                  {normalized.faq.map((item, index) => (
                    <AccordionItem key={`${item.question}-${index}`} value={`faq-${index}`}>
                      <AccordionTrigger className="text-sm font-semibold text-zinc-800">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-zinc-600">
                        {item.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </TabsContent>

              <TabsContent value="avaliacoes" className="mt-6">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-center">
                  <p className="text-sm text-zinc-600">
                    Nenhuma avaliação disponível no momento. Em breve você verá experiências reais aqui.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
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
                  className="min-w-[220px] bg-white border border-zinc-200 rounded-2xl p-4 hover:border-primary transition-colors"
                >
                  <img
                    src={item.image_url || "/placeholder.svg"}
                    alt={item.name || item.title || "Produto"}
                    className="h-32 w-full object-contain mb-3"
                  />
                  <p className="text-zinc-900 font-semibold line-clamp-2">{item.name || item.title}</p>
                  <p className="text-primary font-bold text-lg">{formatPrice(Number(item.price))}</p>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <StickyMobileCTA visible={showStickyCTA} price={p.price} onBuyNow={handleBuyNow} />
    </Layout>
  );
}
