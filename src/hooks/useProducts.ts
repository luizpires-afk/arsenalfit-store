import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// 1. Definição da Interface do Produto
export interface Product {
  id: string;
  title: string;
  price: number;
  image_url: string;
  slug: string;
  description?: string;
  is_active: boolean;
  is_featured: boolean;
  is_on_sale: boolean;
  affiliate_link?: string; // Fundamental para o seu modelo de redirecionamento
  source_url?: string;
  created_at?: string;
}

// 2. Hook para Listagem Geral (Vitrine)
export const useProducts = () => {
  const productsQuery = useQuery({
    queryKey: ['products', 'active'],
    staleTime: 5 * 60 * 1000, // 5 min sem refetch automático
    cacheTime: 30 * 60 * 1000, // mantém em cache 30 min
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as Product[]) || [];
    },
  });

  const products = productsQuery.data || [];

  // Helpers memorizados
  const getFeaturedProducts = useMemo(
    () => () => products.filter(p => p.is_featured),
    [products]
  );

  const getOnSaleProducts = useMemo(
    () => () => products.filter(p => p.is_on_sale),
    [products]
  );

  return {
    products,
    loading: productsQuery.isLoading,
    error: productsQuery.error ? 'Erro ao carregar produtos' : null,
    refetch: productsQuery.refetch,
    getFeaturedProducts,
    getOnSaleProducts,
  };
};

// 3. Hook para Busca de um Único Produto (Página de Detalhes)
export const useProduct = (slug: string) => {
  const productQuery = useQuery({
    queryKey: ['product', slug],
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Produto não encontrado');
      return data as unknown as Product;
    },
  });

  return {
    product: productQuery.data || null,
    loading: productQuery.isLoading,
    error: productQuery.error ? productQuery.error.message : null,
  };
};
