import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Layout } from "@/Components/layout/Layout";
import SEOHead from "@/Components/SEOHead";
import { ProductCard } from "@/Components/ProductCard";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/types/database";

type FitnessSlug = "halteres" | "whey" | "bicicleta-ergometrica" | "esteira";

const CATEGORY_CONFIG: Record<FitnessSlug, { label: string; terms: string[] }> = {
  halteres: { label: "Halteres", terms: ["halter", "halteres", "dumbbell"] },
  whey: { label: "Whey", terms: ["whey"] },
  "bicicleta-ergometrica": {
    label: "Bicicleta Ergométrica",
    terms: ["bicicleta ergometrica", "bicicleta ergométrica", "bike ergometrica", "bike ergométrica"],
  },
  esteira: { label: "Esteira", terms: ["esteira", "treadmill"] },
};

const normalize = (value = "") =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const matchesTerms = (product: Product, terms: string[]) => {
  const haystack = normalize([
    product.name,
    product.description,
    product.short_description,
    product.subcategory,
    product.brand,
  ]
    .filter(Boolean)
    .join(" "));
  return terms.some((term) => haystack.includes(normalize(term)));
};

const toCardProduct = (p: Product) => ({
  id: p.id,
  title: p.name,
  name: p.name,
  description: p.description ?? undefined,
  price: p.price,
  pix_price: p.pix_price ?? undefined,
  pix_price_source: p.pix_price_source ?? undefined,
  original_price: p.original_price ?? undefined,
  discount_percentage: p.discount_percentage ?? undefined,
  image_url: p.image_url ?? null,
  images: p.images ?? undefined,
  slug: p.slug,
  affiliate_link: p.affiliate_link ?? null,
  source_url: p.source_url ?? null,
  canonical_offer_url: p.source_url ?? null,
  ml_item_id: p.external_id ?? null,
  is_featured: p.is_featured ?? false,
  is_on_sale: p.is_on_sale ?? false,
  free_shipping: p.free_shipping ?? false,
  last_sync: p.last_sync ?? undefined,
  updated_at: p.updated_at ?? undefined,
  detected_at: p.detected_at ?? undefined,
  marketplace: p.marketplace ?? "mercadolivre",
  brand: p.brand ?? null,
  subcategory: p.subcategory ?? null,
  curation_badges: p.curation_badges ?? null,
});

export default function FitnessCategorySEO() {
  const { slug } = useParams<{ slug: FitnessSlug }>();
  const categorySlug = (slug && CATEGORY_CONFIG[slug as FitnessSlug] ? slug : "whey") as FitnessSlug;
  const config = CATEGORY_CONFIG[categorySlug];

  const [products, setProducts] = useState<Product[]>([]);
  const [scoresByProduct, setScoresByProduct] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      const { data: activeProducts } = await supabase
        .from("products")
        .select(
          "id,name,slug,description,short_description,price,pix_price,pix_price_source,original_price,discount_percentage,image_url,images,affiliate_link,source_url,is_featured,is_on_sale,free_shipping,last_sync,updated_at,detected_at,marketplace,brand,subcategory,curation_badges,is_active,status",
        )
        .eq("is_active", true)
        .eq("status", "active")
        .eq("marketplace", "mercadolivre")
        .is("removed_at", null)
        .limit(5000);

      const { data: scoreRows } = await supabase
        .from("product_scores")
        .select("product_id,product_score,score_custo_beneficio")
        .limit(5000);

      if (!mounted) return;

      const scoreMap = new Map<string, number>();
      for (const row of scoreRows || []) {
        const score = Number((row as any).product_score ?? (row as any).score_custo_beneficio ?? 0);
        scoreMap.set((row as any).product_id, score);
      }

      const filtered = (activeProducts || []).filter((p: any) => matchesTerms(p as Product, config.terms));
      filtered.sort((a: any, b: any) => {
        const as = scoreMap.get(a.id) ?? 0;
        const bs = scoreMap.get(b.id) ?? 0;
        return bs - as;
      });

      setScoresByProduct(scoreMap);
      setProducts(filtered as Product[]);
      setLoading(false);
    };

    load();
    return () => {
      mounted = false;
    };
  }, [categorySlug, config.terms]);

  const seoTitle = `${config.label} com desconto | Ofertas Fitness`;
  const seoDescription = `Confira ${config.label} com desconto no Mercado Livre. Compare preços e veja as melhores ofertas fitness.`;
  const canonicalUrl =
    typeof window !== "undefined" ? `${window.location.origin}/fitness/${categorySlug}` : undefined;

  const cards = useMemo(() => products.map((product) => toCardProduct(product)), [products]);

  return (
    <Layout>
      <SEOHead
        title={seoTitle}
        description={seoDescription}
        ogType="website"
        canonicalUrl={canonicalUrl}
        appendBaseTitle={false}
      />

      <section className="container-fit py-10 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-zinc-900">{config.label}</h1>
            <p className="text-sm text-zinc-600">Produtos ativos ordenados por product_score.</p>
          </div>
          <Link to="/" className="text-sm text-zinc-600 hover:text-zinc-900">Voltar</Link>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">Carregando ofertas...</p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum produto ativo encontrado para esta categoria.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {cards.map((product) => (
              <div key={product.id} className="space-y-1">
                <ProductCard product={product as any} />
                <p className="text-[11px] text-zinc-500 px-1">
                  product_score: {(scoresByProduct.get(product.id) ?? 0).toFixed(4)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}
