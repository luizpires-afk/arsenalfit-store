import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Loader2, 
  GitCompare, 
  ArrowLeft, 
  ShoppingBag, 
  X, 
  ExternalLink,
  Star,
  Check,
  Minus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/Components/ui/button';
import { Badge } from '@/Components/ui/badge';
import { toast } from 'sonner';

import SEOHead from '@/Components/SEOHead';
import { PriceDisclaimer } from '@/Components/PriceDisclaimer';
import { buildOutProductPath } from '@/lib/offer.js';
import { resolvePricePresentation } from '@/lib/pricing.js';

const categoryLabels = {
  suplementos: "Suplementos",
  equipamentos: "Equipamentos",
  roupas: "Roupas",
  acessorios: "Acessórios"
};

const formatPrice = (value) => {
  if (!(typeof value === 'number' && Number.isFinite(value))) return null;
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
};

export default function Compare() {
  const [compareItems, setCompareItems] = useState([]);

  useEffect(() => {
    const loadItems = () => {
      setCompareItems(JSON.parse(localStorage.getItem('compareItems') || '[]'));
    };
    loadItems();
    window.addEventListener('compareUpdated', loadItems);
    return () => window.removeEventListener('compareUpdated', loadItems);
  }, []);

  const { data: allProducts = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
    enabled: compareItems.length > 0,
  });

  const { data: allReviews = [] } = useQuery({
    queryKey: ['allReviews'],
    queryFn: () => base44.entities.Review.list(),
    enabled: compareItems.length > 0,
  });

  const compareProducts = allProducts.filter(product =>
    compareItems.includes(product.id) && !product.is_blocked
  );

  const getProductRating = (productId) => {
    const productReviews = allReviews.filter(r => r.product_id === productId);
    if (productReviews.length === 0) return null;
    return (productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length).toFixed(1);
  };

  const getProductReviewCount = (productId) => {
    return allReviews.filter(r => r.product_id === productId).length;
  };

  const removeFromCompare = (productId) => {
    const items = compareItems.filter(id => id !== productId);
    localStorage.setItem('compareItems', JSON.stringify(items));
    setCompareItems(items);
    window.dispatchEvent(new Event('compareUpdated'));
    toast.success('Removido da comparação');
  };

  const clearAll = () => {
    localStorage.setItem('compareItems', JSON.stringify([]));
    setCompareItems([]);
    window.dispatchEvent(new Event('compareUpdated'));
    toast.success('Comparação limpa');
  };

  if (isLoading && compareItems.length > 0) {
    return (
      <div className="min-h-screen bg-zinc-50 pt-24 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 pt-24">
      <SEOHead 
        title="Comparar Produtos"
        description="Compare produtos fitness lado a lado para fazer a melhor escolha."
      />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to={createPageUrl('Products')}>
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-zinc-900">Comparar Produtos</h1>
              <p className="text-zinc-500">
                {compareProducts.length} de 4 produtos selecionados
              </p>
            </div>
          </div>
          {compareProducts.length > 0 && (
            <Button variant="outline" onClick={clearAll} className="text-red-600 border-red-200 hover:bg-red-50">
              Limpar tudo
            </Button>
          )}
        </div>

        {/* Empty State */}
        {compareProducts.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-zinc-100 flex items-center justify-center">
              <GitCompare className="w-10 h-10 text-zinc-400" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-900 mb-2">
              Nenhum produto para comparar
            </h3>
            <p className="text-zinc-500 mb-8 max-w-md mx-auto">
              Adicione produtos clicando no ícone de comparar nos cards de produto
            </p>
            <Link to={createPageUrl('Products')}>
              <Button className="bg-zinc-900 hover:bg-zinc-800">
                <ShoppingBag className="w-4 h-4 mr-2" />
                Explorar Produtos
              </Button>
            </Link>
          </motion.div>
        )}

        {/* Comparison Table */}
        {compareProducts.length > 0 && (
          <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                {/* Product Images & Names */}
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="p-6 text-left text-sm font-medium text-zinc-500 w-48">Produto</th>
                    {compareProducts.map((product) => (
                      <th key={product.id} className="p-6 text-center relative">
                        <button
                          onClick={() => removeFromCompare(product.id)}
                          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center transition-colors"
                        >
                          <X className="w-4 h-4 text-zinc-600" />
                        </button>
                        <div className="space-y-4">
                          <div className="w-32 h-32 mx-auto rounded-2xl overflow-hidden bg-zinc-100">
                            <img
                              src={product.images?.[0] || 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400'}
                              alt={product.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <Link 
                            to={createPageUrl('ProductDetail', { slug: product.slug || product.id })}
                            className="block font-semibold text-zinc-900 hover:text-lime-600 transition-colors line-clamp-2"
                          >
                            {product.title}
                          </Link>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Price */}
                  <tr className="border-b border-zinc-50">
                    <td className="p-6 text-sm font-medium text-zinc-500">Preço</td>
                    {compareProducts.map((product) => {
                      const pricing = resolvePricePresentation(product);
                      const primary = formatPrice(pricing.displayPricePrimary);
                      const strikethrough = formatPrice(pricing.displayStrikethrough);
                      return (
                      <td key={product.id} className="p-6 text-center">
                        <div className="text-2xl font-bold text-zinc-900">
                          {primary || '-'}
                        </div>
                        {strikethrough && (
                          <div className="text-sm text-zinc-400 line-through">
                            {strikethrough}
                          </div>
                        )}
                        <PriceDisclaimer
                          lastUpdated={
                            product.updated_at
                              ? new Date(product.updated_at)
                              : product.ultima_verificacao
                                ? new Date(product.ultima_verificacao)
                                : null
                          }
                          className="text-[10px] text-zinc-400 mt-1 block"
                        />
                      </td>
                    )})}
                  </tr>

                  {/* Rating */}
                  <tr className="border-b border-zinc-50">
                    <td className="p-6 text-sm font-medium text-zinc-500">Avaliação</td>
                    {compareProducts.map((product) => {
                      const rating = getProductRating(product.id);
                      const reviewCount = getProductReviewCount(product.id);
                      return (
                        <td key={product.id} className="p-6 text-center">
                          {rating ? (
                            <div className="flex items-center justify-center gap-2">
                              <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star 
                                    key={star}
                                    className={`w-4 h-4 ${
                                      star <= Math.round(rating)
                                        ? 'fill-amber-400 text-amber-400'
                                        : 'text-zinc-200'
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="font-medium">{rating}</span>
                              <span className="text-zinc-400 text-sm">({reviewCount})</span>
                            </div>
                          ) : (
                            <span className="text-zinc-400">Sem avaliações</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Category */}
                  <tr className="border-b border-zinc-50">
                    <td className="p-6 text-sm font-medium text-zinc-500">Categoria</td>
                    {compareProducts.map((product) => (
                      <td key={product.id} className="p-6 text-center">
                        <Badge variant="outline" className="border-zinc-200">
                          {categoryLabels[product.category]}
                        </Badge>
                      </td>
                    ))}
                  </tr>

                  {/* Brand */}
                  <tr className="border-b border-zinc-50">
                    <td className="p-6 text-sm font-medium text-zinc-500">Marca</td>
                    {compareProducts.map((product) => (
                      <td key={product.id} className="p-6 text-center font-medium text-zinc-900">
                        {product.brand || <Minus className="w-4 h-4 mx-auto text-zinc-300" />}
                      </td>
                    ))}
                  </tr>

                  {/* Featured */}
                  <tr className="border-b border-zinc-50">
                    <td className="p-6 text-sm font-medium text-zinc-500">Destaque</td>
                    {compareProducts.map((product) => (
                      <td key={product.id} className="p-6 text-center">
                        {product.featured ? (
                          <Check className="w-5 h-5 text-lime-500 mx-auto" />
                        ) : (
                          <Minus className="w-5 h-5 text-zinc-300 mx-auto" />
                        )}
                      </td>
                    ))}
                  </tr>

                  {/* Discount */}
                  <tr className="border-b border-zinc-50">
                    <td className="p-6 text-sm font-medium text-zinc-500">Desconto</td>
                    {compareProducts.map((product) => {
                      const pricing = resolvePricePresentation(product);
                      const discount = typeof pricing.discountPercent === 'number' ? pricing.discountPercent : null;
                      return (
                        <td key={product.id} className="p-6 text-center">
                          {discount ? (
                            <Badge className="bg-lime-400 text-zinc-900 border-0">
                              -{discount}%
                            </Badge>
                          ) : (
                            <Minus className="w-4 h-4 mx-auto text-zinc-300" />
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Description */}
                  <tr className="border-b border-zinc-50">
                    <td className="p-6 text-sm font-medium text-zinc-500">Descrição</td>
                    {compareProducts.map((product) => (
                      <td key={product.id} className="p-6 text-center">
                        <p className="text-sm text-zinc-600 line-clamp-3">
                          {product.description || <Minus className="w-4 h-4 mx-auto text-zinc-300" />}
                        </p>
                      </td>
                    ))}
                  </tr>

                  {/* Action */}
                  <tr>
                    <td className="p-6"></td>
                    {compareProducts.map((product) => (
                      <td key={product.id} className="p-6 text-center">
                        <a
                          href={buildOutProductPath(product.id, 'compare')}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button className="bg-zinc-900 hover:bg-zinc-800 rounded-xl">
                            Comprar
                            <ExternalLink className="w-4 h-4 ml-2" />
                          </Button>
                        </a>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

