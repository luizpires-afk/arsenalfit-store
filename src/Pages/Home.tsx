import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client'; // Ajustado para sua integração padrão
import { Loader2, Search, TrendingDown, Sparkles, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import SEOHead from '@/Components/SEOHead';
import HeroSection from '@/Components/HeroSection';
import { Navbar } from "@/Components/Navbar";
import { CategoryFilter } from '@/Components/shared/CategoryFilter';
import SearchBar from '@/Components/SearchBar';
import { ProductCard } from '@/Components/ProductCard';

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, category:categories(id, name, slug)')
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
    .filter(p => p.original_price && p.price < p.original_price)
    .sort((a, b) => {
      const discountA = ((a.original_price - a.price) / a.original_price);
      const discountB = ((b.original_price - b.price) / b.original_price);
      return discountB - discountA;
    })
    .slice(0, 4);

  // 2. PRODUTOS EM DESTAQUE (Marcados manualmente como featured)
  const featuredProducts = filteredProducts.filter(p => p.is_featured);
  
  // 3. RESTANTE DOS PRODUTOS
  const regularProducts = filteredProducts.filter(p => !p.featured);

  return (
    <div className="min-h-screen bg-[#FBFBFB]">
      <SEOHead 
        title="ArsenalFit | Melhores Ofertas Fitness"
        description="Encontre suplementos e equipamentos com preços verificados automaticamente no Mercado Livre e Amazon."
      />
      
      <Navbar />
      <HeroSection />
      
      <main id="main-content" className="py-12 md:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        
        {/* Barra de Busca e Filtros Fixa no Topo (Opcional) */}
        <div className="sticky top-20 z-30 bg-[#FBFBFB]/80 backdrop-blur-md py-4 mb-12 border-b border-zinc-100">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="w-full md:w-1/3">
              <SearchBar value={searchQuery} onChange={setSearchQuery} />
            </div>
            <div className="w-full md:w-2/3 overflow-x-auto pb-2 md:pb-0">
              <CategoryFilter selected={selectedCategory} onSelect={setSelectedCategory} />
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-32" role="status" aria-live="polite">
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
            <p className="text-zinc-400 font-medium animate-pulse">Sincronizando as melhores ofertas...</p>
          </div>
        )}

        {/* --- SEÇÃO 1: OFERTAS REAIS (DETECTADAS PELO ROBÔ) --- */}
        {!isLoading && searchQuery === '' && selectedCategory === 'all' && hotDeals.length > 0 && (
          <div className="mb-20">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-red-100 rounded-xl text-red-600">
                <TrendingDown size={24} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-zinc-900 uppercase italic tracking-tighter">
                  Preços que Caíram
                </h3>
                <p className="text-sm text-zinc-500">Detectado automaticamente pelo nosso robô nas últimas 24h</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
               {hotDeals.map((product) => (
                  <ProductCard key={`hot-${product.id}`} product={product} />
                ))}
            </div>
          </div>
        )}

        {/* --- SEÇÃO 2: DESTAQUES (CURADORIA) --- */}
        {!isLoading && featuredProducts.length > 0 && (
          <div className="mb-20">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-amber-100 rounded-xl text-amber-600">
                <Sparkles size={24} />
              </div>
              <h3 className="text-2xl font-black text-zinc-900 uppercase italic tracking-tighter">
                Curadoria Elite
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              <AnimatePresence mode="popLayout">
                {featuredProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* --- SEÇÃO 3: FEED GERAL --- */}
        {!isLoading && regularProducts.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-zinc-100 rounded-xl text-zinc-600">
                <Package size={24} />
              </div>
              <h3 className="text-2xl font-black text-zinc-900 uppercase italic tracking-tighter">
                {selectedCategory !== 'all' ? 'Filtrando Arsenal' : 'Todos os Produtos'}
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              <AnimatePresence mode="popLayout">
                {regularProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredProducts.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-32 bg-white rounded-[40px] border-2 border-dashed border-zinc-100" role="status" aria-live="polite">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-zinc-50 flex items-center justify-center">
              <Search className="w-8 h-8 text-zinc-300" />
            </div>
            <h3 className="text-xl font-bold text-zinc-900 mb-2">Nada no radar...</h3>
            <p className="text-zinc-500 max-w-xs mx-auto">
              Não encontramos produtos para essa busca ou categoria no momento.
            </p>
          </motion.div>
        )}
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




