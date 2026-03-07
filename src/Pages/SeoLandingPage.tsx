import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SEOHead from "@/Components/SEOHead";
import { Layout } from "@/Components/layout/Layout";
import { ProductCard } from "@/Components/ProductCard";
import { dedupeCatalogProducts } from "@/lib/catalog";
import {
  getProgrammaticSeeds,
  keywordSlugToLabel,
  listRelatedSeoLinks,
  toSlug,
} from "@/lib/programmaticSeo";
import { resolvePromotionMetrics } from "@/lib/pricing.js";

const PRODUCT_SELECT =
  "id, name, slug, price, pix_price, original_price, previous_price, previous_price_source, previous_price_expires_at, detected_at, last_sync, updated_at, image_url, images, affiliate_link, source_url, canonical_offer_url, ml_item_id, is_active, status, auto_disabled_reason, affiliate_verified, is_featured, is_on_sale, discount_percentage, free_shipping, marketplace, category_id, clicks_count, curation_badges";

const VISIBLE_PRODUCTS_FILTER =
  "and(is_active.eq.true,status.eq.active,data_health_status.eq.HEALTHY,auto_disabled_reason.is.null),and(is_active.eq.true,status.eq.active,data_health_status.eq.HEALTHY,auto_disabled_reason.neq.blocked)";

type CategoryRow = {
  id: string;
  slug: string | null;
  name: string;
};

type SeoDbPage = {
  id: number;
  slug: string | null;
  title: string | null;
  description: string | null;
  keyword: string | null;
  meta_title: string | null;
  meta_description: string | null;
  search_intent: string | null;
  is_active: boolean | null;
  release_status: string | null;
  updated_at: string | null;
};

const normalizeSeoPath = (slug: string) => {
  const raw = String(slug || "").trim().replace(/^\/+/, "");
  if (!raw) return "/seo";
  if (raw.startsWith("seo/")) return `/${raw}`;
  return `/seo/${raw}`;
};

const paragraphFromKeyword = (keywordLabel: string, categoryName: string) => {
  return [
    `Se voce busca ${keywordLabel}, esta pagina resume os pontos mais importantes para escolher com seguranca dentro de ${categoryName}. Nosso processo cruza dados de preco monitorado, atualizacoes frequentes e sinais de confianca para priorizar opcoes que realmente fazem sentido para treino e rotina fitness.`,
    `A curadoria considera historico de variacao, disponibilidade de frete gratis e relevancia para objetivos reais. Sempre que encontramos quedas consistentes, os produtos ganham destaque. Isso ajuda a evitar compra por impulso em anuncios com precos instaveis e melhora sua decisao com base em dados atualizados.`,
    `Para melhorar sua comparacao, separamos os produtos relacionados com foco em custo-beneficio, reputacao de oferta e aderencia a categoria. No final, voce encontra FAQ, buscas relacionadas e links internos para continuar a navegacao sem perder contexto.`,
  ].join(" ");
};

export default function SeoLandingPage() {
  const params = useParams();
  const wildcardRaw = String(params["*"] || "").trim();
  const wildcardSlug = wildcardRaw
    .split("/")
    .map((chunk) => toSlug(chunk))
    .filter(Boolean)
    .join("/");
  const singleSlug = toSlug(params.slug || "");
  const categorySlug = toSlug(params.category || "");
  const keywordSlug = toSlug(params.keyword || "");
  const composedSlug = [categorySlug, keywordSlug].filter(Boolean).join("/");

  const slugCandidates = useMemo(() => {
    const wildcardSegments = wildcardSlug.split("/").filter(Boolean);
    const wildcardLastSegment = wildcardSegments.length > 0 ? wildcardSegments[wildcardSegments.length - 1] : "";
    const pool = [wildcardSlug, singleSlug, composedSlug, keywordSlug, wildcardLastSegment].filter(Boolean);
    return Array.from(new Set(pool));
  }, [wildcardSlug, singleSlug, composedSlug, keywordSlug]);

  const isKeywordAllowed = useMemo(() => {
    if (!categorySlug || !keywordSlug) return false;
    const seed = getProgrammaticSeeds().find((item) => item.slug === categorySlug);
    if (!seed) return false;
    return seed.keywords.includes(keywordSlug);
  }, [categorySlug, keywordSlug]);

  const { data: dbPage } = useQuery({
    queryKey: ["seo-page", "db-page", ...slugCandidates],
    queryFn: async () => {
      if (slugCandidates.length === 0) return null;
      const { data, error } = await supabase
        .from("seo_pages" as any)
        .select("id,slug,title,description,keyword,meta_title,meta_description,search_intent,is_active,release_status,updated_at")
        .in("slug", slugCandidates)
        .eq("is_active", true)
        .eq("release_status", "released")
        .order("updated_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data || [])[0] as SeoDbPage | undefined) || null;
    },
    enabled: slugCandidates.length > 0,
  });

  const isPageAllowed = isKeywordAllowed || Boolean(dbPage);
  const effectiveKeywordSlug = toSlug(dbPage?.keyword || keywordSlug || singleSlug || wildcardSlug);
  const keywordLabel = keywordSlugToLabel(effectiveKeywordSlug);

  const { data: category } = useQuery({
    queryKey: ["seo-page", "category", categorySlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name")
        .eq("slug", categorySlug)
        .maybeSingle();
      if (error) throw error;
      return (data as CategoryRow | null) || null;
    },
    enabled: Boolean(categorySlug && isPageAllowed),
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["seo-page", "products", category?.id || "all", effectiveKeywordSlug],
    queryFn: async () => {
      const words = effectiveKeywordSlug
        .split("-")
        .map((word) => word.trim())
        .filter((word) => word.length >= 3)
        .slice(0, 5);

      let query = supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("is_blocked", false)
        .or(VISIBLE_PRODUCTS_FILTER)
        .order("updated_at", { ascending: false })
        .limit(80);

      if (category?.id) {
        query = query.eq("category_id", category.id);
      }

      if (words.length > 0) {
        const ilike = words.map((word) => `name.ilike.%${word}%`).join(",");
        query = query.or(ilike);
      }

      const { data, error } = await query;
      if (error) throw error;

      const deduped = dedupeCatalogProducts((data || []) as any[])
        .filter((item: any) => item?.is_active !== false)
        .sort((a: any, b: any) => {
          const promoA = resolvePromotionMetrics(a);
          const promoB = resolvePromotionMetrics(b);
          if (promoB.discountPercent !== promoA.discountPercent) {
            return promoB.discountPercent - promoA.discountPercent;
          }
          const updatedA = new Date(a?.updated_at || 0).getTime() || 0;
          const updatedB = new Date(b?.updated_at || 0).getTime() || 0;
          return updatedB - updatedA;
        });

      return deduped;
    },
    enabled: isPageAllowed,
  });

  const categoryName = category?.name || "categoria fitness";
  const relatedSeoLinks = listRelatedSeoLinks(categorySlug, keywordSlug, 6);
  const relatedProducts = products.slice(0, 12);

  const hasMinimumData = isPageAllowed && relatedProducts.length >= 3;
  const longText = String(dbPage?.description || "").trim() || paragraphFromKeyword(keywordLabel, categoryName);
  const pageTitle = String(dbPage?.title || "").trim() || `Best ${keywordLabel}`;
  const pageDescription = String(dbPage?.meta_description || "").trim() ||
    `Discover the best ${keywordLabel} with updated prices, reviews and comparisons.`;
  const canonicalSlug = String(dbPage?.slug || wildcardSlug || composedSlug || singleSlug || effectiveKeywordSlug).trim();
  const canonicalPath = normalizeSeoPath(canonicalSlug);

  if (!isPageAllowed) {
    return (
      <Layout>
        <SEOHead
          title="Pagina SEO indisponivel"
          description="A pagina solicitada nao esta publicada."
          noindex
        />
        <div className="container-tight py-12">
          <h1 className="text-3xl font-black text-zinc-900">Pagina nao publicada</h1>
          <p className="mt-3 text-zinc-600">
            A regra de geracao desta URL nao esta ativa no painel de SEO.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <SEOHead
        title={`${String(dbPage?.meta_title || pageTitle)} | Best Deals and Reviews`}
        description={pageDescription}
        canonicalPath={canonicalPath}
        noindex={!hasMinimumData}
        ogType="article"
      />

      <div className="container-tight py-8 md:py-12">
        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">SEO Page</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-black text-zinc-900 tracking-tight">
            {pageTitle}
          </h1>
          <p className="mt-4 text-zinc-700 leading-7">{longText}</p>
        </header>

        {!hasMinimumData ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="text-xl font-black text-zinc-900">Publicacao pausada</h2>
            <p className="mt-2 text-zinc-600">
              Esta pagina nao possui dados suficientes para indexacao. Assim que houver mais produtos validos,
              ela sera publicada automaticamente.
            </p>
          </section>
        ) : (
          <>
            <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6">
              <h2 className="text-2xl font-black text-zinc-900">Overview of {keywordLabel}</h2>
              <p className="mt-3 text-zinc-700 leading-7">{longText}</p>
            </section>

            <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6">
              <h2 className="text-2xl font-black text-zinc-900">Benefits of products in {categoryName}</h2>
              <p className="mt-3 text-zinc-700 leading-7">
                Aqui voce encontra opcoes com foco em performance, custo-beneficio e consistencia de preco.
                Priorizamos anuncios com historico confiavel, produtos ativos e sinais de oferta real.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-black text-zinc-900 mb-4">Comparison and Features</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {relatedProducts.slice(0, 6).map((product: any) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>

            <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6">
              <h2 className="text-2xl font-black text-zinc-900">Related products</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {relatedProducts.slice(0, 8).map((product: any) => (
                  <Link
                    key={`related-product-${product.id}`}
                    to={product.slug ? `/produto/${product.slug}` : `/produto/${product.id}`}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
                  >
                    {product.name}
                  </Link>
                ))}
              </div>
            </section>

            <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6">
              <h2 className="text-2xl font-black text-zinc-900">FAQ</h2>
              <div className="mt-4 space-y-4 text-zinc-700">
                <div>
                  <h3 className="font-bold">Como os produtos sao selecionados para esta pagina?</h3>
                  <p>
                    O sistema usa categoria, palavra-chave e status de qualidade do catalogo para listar apenas itens ativos
                    e relevantes.
                  </p>
                </div>
                <div>
                  <h3 className="font-bold">Os precos sao atualizados automaticamente?</h3>
                  <p>
                    Sim. A base e sincronizada por robos de monitoramento e auditoria, com foco em detectar quedas reais.
                  </p>
                </div>
                <div>
                  <h3 className="font-bold">Por que algumas paginas podem nao ser indexadas?</h3>
                  <p>
                    Quando faltam dados minimos (produtos validos ou conteudo suficiente), a pagina entra em modo noindex
                    para evitar conteudo fraco.
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-6">
              <h2 className="text-2xl font-black text-zinc-900">Related searches</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {categorySlug ? (
                  <Link
                    to={`/categoria/${categorySlug}`}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
                  >
                    best {categoryName}
                  </Link>
                ) : null}
                {relatedSeoLinks.map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}

        {isLoading ? <p className="mt-6 text-sm text-zinc-500">Atualizando produtos da pagina...</p> : null}
      </div>
    </Layout>
  );
}
