import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client'; // Ajustado para sua integração padrão
import { Loader2, Search, TrendingDown, Sparkles, Package, Flame, ShieldCheck, Link2, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import SEOHead from '@/Components/SEOHead';
import HeroSection from '@/Components/HeroSection';
import { CategoryFilter } from '@/Components/shared/CategoryFilter';
import SearchBar from '@/Components/SearchBar';
import { ProductCard } from '@/Components/ProductCard';
import { Button } from '@/Components/ui/button';

export default function Home() {
  const BEST_DEAL_MIN_DISCOUNT = 15;
  const BEST_DEAL_ABSOLUTE_TOP = 8;
  const ELITE_SCORE_THRESHOLD = 8;

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const autoplayRef = useRef(Autoplay({ delay: 3000, stopOnInteraction: false, stopOnMouseEnter: true }));
  const [emblaRef] = useEmblaCarousel({ loop: true, align: 'start' }, [autoplayRef.current]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

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

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-schema', 'website');
    script.text = JSON.stringify(schema);
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, category:categories(id, name, slug, image_url)')
        .eq('is_active', true)
        .eq('is_blocked', false)
        .or('auto_disabled_reason.is.null,auto_disabled_reason.neq.blocked')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  // LOGICA DE FILTRO
  const filteredProducts = products.filter(product => {
    const matchesSearch = 
      product.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase());
  
    const matchesCategory = selectedCategory === 'all' || product.category_id === selectedCategory;
    
    return product.is_active !== false && matchesCategory && matchesSearch;
  });

  // 1. OFERTAS DO ROBÔ (Maiores quedas de preço reais)
  const hotDeals = [...products]
    .filter(p => p.is_active !== false)
    .filter(p => typeof p.previous_price === 'number' && p.previous_price > p.price)
    .filter(p => {
      const ref = p.detected_at || p.last_sync || null;
      if (!ref) return false;
      const diff = Date.now() - new Date(ref).getTime();
      return diff <= 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => {
      const discountA = ((a.previous_price - a.price) / a.previous_price);
      const discountB = ((b.previous_price - b.price) / b.previous_price);
      return discountB - discountA;
    })
    .slice(0, 6);

  // 2. CURADORIA ELITE (manual ou score alto)
  const eliteProducts = useMemo(() => {
    const elite = filteredProducts.filter((product) => {
      const score = typeof (product as any).quality_score === 'number' ? (product as any).quality_score : null;
      return product.is_featured || (typeof score === 'number' && score >= ELITE_SCORE_THRESHOLD);
    });
    const seen = new Set<string>();
    return elite.filter((product) => {
      if (seen.has(product.id)) return false;
      seen.add(product.id);
      return true;
    });
  }, [filteredProducts, ELITE_SCORE_THRESHOLD]);
  
  // 3. RESTANTE DOS PRODUTOS
  const eliteIds = useMemo(() => new Set(eliteProducts.map((product) => product.id)), [eliteProducts]);
  const regularProducts = filteredProducts.filter(p => !eliteIds.has(p.id));

  const listProducts = useMemo(
    () => (searchQuery !== '' || selectedCategory !== 'all' ? filteredProducts : regularProducts),
    [filteredProducts, regularProducts, searchQuery, selectedCategory]
  );

  const formatLastUpdated = (value?: string | null) => {
    if (!value) return 'Preço pode variar. Atualização em breve';
    const date = new Date(value);
    if (!isValid(date)) return 'Preço pode variar. Atualização em breve';
    return `Preço pode variar. Atualizado em ${format(date, "dd/MM 'às' HH:mm", { locale: ptBR })}`;
  };

  const bestDeals = useMemo(() => {
    const now = Date.now();
    const candidates = (products || [])
      .filter((product) => product.is_active !== false)
      .map((product) => {
        const price = Number(product.price || 0);
        const prevRaw =
          typeof product.previous_price === 'number'
            ? product.previous_price
            : typeof product.original_price === 'number'
              ? product.original_price
              : null;
        const prev = typeof prevRaw === 'number' ? prevRaw : null;
        const lastUpdated =
          product.detected_at || product.last_sync || product.updated_at || product.created_at || null;
        const lastUpdatedMs = lastUpdated ? new Date(lastUpdated).getTime() : null;
        const pix =
          typeof product.pix_price === 'number' &&
          product.pix_price > 0 &&
          product.pix_price < price
            ? product.pix_price
            : null;
        const discountValue = prev ? Math.max(prev - price, 0) : 0;
        const discountPercent = prev && prev > 0 ? Math.round((discountValue / prev) * 100) : 0;
        return {
          product,
          price,
          prev,
          pix,
          discountValue,
          discountPercent,
          lastUpdatedText: formatLastUpdated(lastUpdated),
          lastUpdatedMs,
        };
      })
      .filter((item) => item.prev !== null && item.discountValue > 0);

    const byAbsoluteDrop = [...candidates].sort((a, b) => b.discountValue - a.discountValue);
    const topAbsoluteIds = new Set(
      byAbsoluteDrop.slice(0, BEST_DEAL_ABSOLUTE_TOP).map((item) => item.product.id)
    );

    const shortlisted = candidates.filter(
      (item) => item.discountPercent >= BEST_DEAL_MIN_DISCOUNT || topAbsoluteIds.has(item.product.id)
    );

    shortlisted.sort((a, b) => {
      const pixA = a.pix ? 1 : 0;
      const pixB = b.pix ? 1 : 0;
      if (pixA !== pixB) return pixB - pixA;
      if (b.discountPercent !== a.discountPercent) return b.discountPercent - a.discountPercent;
      return (b.lastUpdatedMs ?? 0) - (a.lastUpdatedMs ?? 0);
    });

    const usedCategories = new Set<string>();
    const diversified: typeof shortlisted = [];
    const fallback: typeof shortlisted = [];

    for (const item of shortlisted) {
      const categoryId = item.product.category_id || item.product.category?.id || 'sem-categoria';
      if (!usedCategories.has(categoryId)) {
        usedCategories.add(categoryId);
        diversified.push(item);
      } else {
        fallback.push(item);
      }
    }

    return [...diversified, ...fallback].slice(0, 12);
  }, [products, BEST_DEAL_ABSOLUTE_TOP, BEST_DEAL_MIN_DISCOUNT]);

  const popularCategories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; slug?: string | null; image?: string | null; count: number }>();
    for (const product of products) {
      if (product.is_active === false) continue;
      const cat = product.category;
      if (!cat || !cat.id) continue;
      const current = map.get(cat.id) || {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        image: cat.image_url ?? null,
        count: 0,
      };
      current.count += 1;
      map.set(cat.id, current);
    }

    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [products]);

  const showHighlights = !isLoading && searchQuery === '' && selectedCategory === 'all';
  const bestDealCards = useMemo(() => bestDeals.slice(0, 6), [bestDeals]);
  const priceDropsToday = useMemo(() => hotDeals.slice(0, 4), [hotDeals]);
  const eliteShowcase = useMemo(() => eliteProducts.slice(0, 6), [eliteProducts]);

  return (
    <div className="min-h-screen bg-[#FBFBFB]">
      <SEOHead 
        title="ArsenalFit | Melhores Ofertas Fitness"
        description="Encontre suplementos e equipamentos com preços verificados automaticamente no Mercado Livre e Amazon."
        ogType="website"
      />
      
      <HeroSection />
      
      <main id="main-content" className="py-12 md:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* --- PROVA DE CONFIANÇA --- */}
        <section className="mb-14">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Confiança ArsenalFit
            </h2>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible">
            <div className="min-w-[240px] rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-emerald-100 text-emerald-600 p-2">
                  <Activity size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Preços monitorados</p>
                  <p className="text-[11px] text-zinc-500">Atualizações automáticas e consistentes.</p>
                </div>
              </div>
            </div>
            <div className="min-w-[240px] rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-lime-100 text-lime-700 p-2">
                  <Link2 size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Links oficiais</p>
                  <p className="text-[11px] text-zinc-500">Você compra direto no marketplace.</p>
                </div>
              </div>
            </div>
            <div className="min-w-[240px] rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-orange-100 text-orange-600 p-2">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Curadoria relevante</p>
                  <p className="text-[11px] text-zinc-500">Só o que faz sentido no fitness.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- MELHORES DO DIA --- */}
        <section id="best-deals" className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-orange-100 rounded-xl text-orange-600">
              <Flame size={24} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-zinc-900 uppercase italic tracking-tighter">
                Melhores do Dia
              </h3>
              <p className="text-sm text-zinc-500">Maiores descontos e quedas reais do dia.</p>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-80 bg-white rounded-[24px] border border-zinc-100" />
              ))}
            </div>
          ) : bestDealCards.length === 0 ? (
            <div className="bg-white rounded-[24px] border border-zinc-100 p-8 text-center text-zinc-500">
              Nenhuma queda de preço recente para destacar agora. Volte em instantes.
            </div>
          ) : (
            <div className="overflow-hidden" ref={emblaRef}>
              <div className="flex -ml-4">
                {bestDealCards.map((deal) => {
                  const product = deal.product;
                  const link = product.slug ? `/produto/${product.slug}` : `/produto/${product.id}`;
                  return (
                    <div key={product.id} className="pl-4 basis-full md:basis-1/2 lg:basis-1/3">
                      <div className="h-full bg-white rounded-[24px] border border-zinc-100 p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="relative bg-zinc-50 rounded-[18px] p-4 aspect-square flex items-center justify-center">
                          <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
                            {deal.discountPercent > 0 && (
                              <span className="text-[10px] font-black uppercase tracking-widest bg-orange-500 text-white px-2 py-1 rounded-md">
                                Queda {deal.discountPercent}%
                              </span>
                            )}
                            {deal.pix && (
                              <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-600 text-white px-2 py-1 rounded-md">
                                Pix
                              </span>
                            )}
                          </div>
                          <img
                            src={product.image_url || '/placeholder.svg'}
                            alt={product.name}
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        </div>

                        <div className="flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-400">
                            <span>{product.marketplace === 'mercadolivre' ? 'Mercado Livre' : 'Marketplace'}</span>
                            {product.category?.name && (
                              <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500">
                                {product.category.name}
                              </span>
                            )}
                          </div>
                          <h4 className="font-bold text-zinc-900 text-base line-clamp-2">
                            {product.name}
                          </h4>

                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs text-zinc-500">Preço</div>
                              <div className="text-2xl font-black text-zinc-900">
                                R$ {deal.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </div>
                              {deal.prev && deal.discountValue > 0 && (
                                <div className="text-xs text-zinc-400 line-through">
                                  R$ {deal.prev.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                              )}
                            </div>

                            {deal.pix && (
                              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-right">
                                <div className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">
                                  Pix
                                </div>
                                <div className="text-xl font-black text-emerald-700">
                                  R$ {deal.pix.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                              </div>
                            )}
                          </div>

                          {deal.discountValue > 0 && (
                            <div className="text-xs font-semibold text-emerald-600">
                              Economia de R$ {deal.discountValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                          )}
                          <p className="text-[11px] text-zinc-500">{deal.lastUpdatedText}</p>
                        </div>

                        <Button
                          asChild
                          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black uppercase tracking-wide rounded-xl"
                        >
                          <a href={link}>Ver oferta</a>
                        </Button>
                        <p className="text-[10px] text-zinc-400 text-center">
                          Você será redirecionado para o site oficial
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6">
            <Button
              asChild
              variant="outline"
              className="border-zinc-200 text-zinc-700 hover:bg-zinc-100"
            >
              <a href="/melhores-ofertas">Ver todas as ofertas do dia</a>
            </Button>
          </div>
        </section>


        {/* --- SEÇÃO: PREÇOS QUE CAÍRAM HOJE --- */}
        {showHighlights && priceDropsToday.length > 0 && (
          <div className="mb-20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-xl text-red-600">
                  <TrendingDown size={24} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-zinc-900 uppercase italic tracking-tighter">
                    Preços que Caíram Hoje
                  </h3>
                  <p className="text-sm text-zinc-500">Quedas reais confirmadas nas últimas 24 horas.</p>
                </div>
              </div>
              <Button
                asChild
                variant="ghost"
                className="text-zinc-600 hover:text-zinc-900"
              >
                <a href="/melhores-ofertas">Ver quedas do dia</a>
              </Button>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-4 md:gap-6 md:overflow-visible">
              {priceDropsToday.map((product) => (
                <div key={`hot-${product.id}`} className="min-w-[260px] md:min-w-0">
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- SEÇÃO 2: DESTAQUES (CURADORIA) --- */}
        {showHighlights && eliteShowcase.length > 0 && (
          <div className="mb-20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-xl text-amber-600">
                  <Sparkles size={24} />
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
              <Button
                asChild
                variant="ghost"
                className="text-zinc-600 hover:text-zinc-900"
              >
                <a href="#products">Ver todos os produtos</a>
              </Button>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-4 md:gap-6 md:overflow-visible">
              <AnimatePresence mode="popLayout">
                {eliteShowcase.map((product) => (
                  <div key={product.id} className="min-w-[260px] md:min-w-0">
                    <ProductCard product={product} variant="curation" />
                  </div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* --- CATEGORIAS POPULARES --- */}
        {showHighlights && popularCategories.length > 0 && (
          <div className="mb-20">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-lime-100 rounded-xl text-lime-700">
                <Package size={22} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-zinc-900 uppercase italic tracking-tighter">
                  Categorias Populares
                </h3>
                <p className="text-sm text-zinc-500">Explore o que está em alta no fitness.</p>
              </div>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-3 lg:grid-cols-6 md:gap-4 md:overflow-visible">
              {popularCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => {
                    setSelectedCategory(category.id);
                    document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="min-w-[200px] group rounded-2xl border border-zinc-100 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-lime-200 hover:shadow-md md:min-w-0"
                >
                  <div className="text-xs uppercase tracking-widest text-zinc-400 group-hover:text-lime-600">
                    Categoria
                  </div>
                  <div className="mt-1 text-sm font-bold text-zinc-900">{category.name}</div>
                  <div className="mt-2 text-xs text-zinc-500">{category.count} produtos</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* --- TODOS OS PRODUTOS --- */}
        <section id="products">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-zinc-100 rounded-xl text-zinc-600">
              <Package size={24} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-zinc-900 uppercase italic tracking-tighter">
                {selectedCategory !== 'all' ? 'Filtrando Arsenal' : 'Todos os Produtos'}
              </h3>
              <p className="text-sm text-zinc-500">
                Busque por nome, filtre por categoria e encontre o melhor preço.
              </p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-8">
            <div className="w-full md:w-1/3">
              <SearchBar value={searchQuery} onChange={setSearchQuery} />
            </div>
            <div className="w-full md:w-2/3 overflow-x-auto pb-2 md:pb-0">
              <CategoryFilter
                selected={selectedCategory}
                onSelect={setSelectedCategory}
                allowedCategories={["Acessórios", "Equipamentos", "Suplementos", "Vitaminas"]}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24" role="status" aria-live="polite">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
              <p className="text-zinc-400 font-medium animate-pulse">
                Sincronizando as melhores ofertas...
              </p>
            </div>
          ) : listProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              <AnimatePresence mode="popLayout">
                {listProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-24 bg-white rounded-[40px] border-2 border-dashed border-zinc-100"
              role="status"
              aria-live="polite"
            >
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-zinc-50 flex items-center justify-center">
                <Search className="w-8 h-8 text-zinc-300" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">Nada no radar...</h3>
              <p className="text-zinc-500 max-w-xs mx-auto">
                Não encontramos produtos para essa busca ou categoria no momento.
              </p>
            </motion.div>
          )}
        </section>
      </main>

      <footer className="bg-zinc-950 text-white py-20 px-4 mt-20">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="text-center md:text-left">
            <div className="text-3xl font-black mb-4 italic tracking-tighter">
              ARSENAL<span className="text-primary">FIT</span>
            </div>
            <p className="text-zinc-400 text-sm max-w-md">
              Tecnologia de monitoramento de preços para quem leva o treino a sério. 
              Sincronizamos ofertas reais para você economizar tempo e dinheiro.
            </p>
          </div>
          <div className="flex flex-col items-center md:items-end gap-4 text-zinc-500 text-xs">
            <div className="flex gap-6 mb-4">
              <a href="#" className="hover:text-primary transition-colors">Termos</a>
              <a href="#" className="hover:text-primary transition-colors">Privacidade</a>
              <a href="#" className="hover:text-primary transition-colors">Afiliados</a>
            </div>
            <p>© {new Date().getFullYear()} ArsenalFit. O melhor preço, verificado.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
