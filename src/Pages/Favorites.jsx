import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Loader2, Heart, ArrowLeft, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/Components/ui/button';

import SEOHead from '@/Components/SEOHead';
import { ProductCard } from '@/Components/ProductCard';

export default function Favorites() {
  const [user, setUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const isAuth = await base44.auth.isAuthenticated();
        if (isAuth) {
          const userData = await base44.auth.me();
          setUser(userData);
        }
      } catch (e) {}
      setIsCheckingAuth(false);
    };
    checkAuth();
  }, []);

  const { data: favorites = [], isLoading: favoritesLoading } = useQuery({
    queryKey: ['favorites', user?.email],
    queryFn: () => base44.entities.Favorite.filter({ created_by: user.email }),
    enabled: !!user,
  });

  const { data: allProducts = [], isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
    enabled: favorites.length > 0,
  });

  const favoriteProducts = allProducts.filter(product => 
    favorites.some(f => f.product_id === product.id)
  );

  const isLoading = isCheckingAuth || favoritesLoading || productsLoading;

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-zinc-50 pt-24 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 pt-24">
        <SEOHead title="Favoritos" description="Faça login para ver seus produtos favoritos." />
        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-zinc-100 flex items-center justify-center">
            <Heart className="w-10 h-10 text-zinc-400" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 mb-4">Faça login para ver seus favoritos</h1>
          <p className="text-zinc-500 mb-8">Você precisa estar logado para salvar e ver seus produtos favoritos.</p>
          <Button 
            onClick={() => base44.auth.redirectToLogin()}
            className="bg-zinc-900 hover:bg-zinc-800"
          >
            Entrar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 pt-24">
      <SEOHead 
        title="Meus Favoritos"
        description="Veja seus produtos fitness favoritos salvos na ArsenalFit."
      />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link to={createPageUrl('Home')}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-zinc-900">Meus Favoritos</h1>
            <p className="text-zinc-500">
              {favoriteProducts.length} {favoriteProducts.length === 1 ? 'produto' : 'produtos'}
            </p>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        )}

        {/* Products Grid */}
        {!isLoading && favoriteProducts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence mode="popLayout">
              {favoriteProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && favoriteProducts.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-zinc-100 flex items-center justify-center">
              <Heart className="w-10 h-10 text-zinc-400" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-900 mb-2">
              Nenhum favorito ainda
            </h3>
            <p className="text-zinc-500 mb-8 max-w-md mx-auto">
              Explore nossos produtos e clique no coração para salvá-los aqui
            </p>
            <Link to={createPageUrl('Products')}>
              <Button className="bg-zinc-900 hover:bg-zinc-800">
                <ShoppingBag className="w-4 h-4 mr-2" />
                Explorar Produtos
              </Button>
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}

