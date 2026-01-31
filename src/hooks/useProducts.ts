import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  original_price?: number | null;
  short_description?: string | null;
  description?: string | null;
  image_url?: string | null;
  affiliate_link?: string | null;
  source_url?: string | null;
  external_id?: string | null;
  category_id?: string | null;
  category?: any;
  brand?: string | null;
  subcategory?: string | null;
  tech_sheet?: string | null;
  is_active: boolean;
  is_featured: boolean;
  is_on_sale: boolean;
  free_shipping?: boolean;
  marketplace?: string;
  created_at?: string;
}

export const useProducts = () => {
  const productsQuery = useQuery({
    queryKey: ['products', 'active'],
    staleTime: 5 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, category:categories(*)')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as Product[]) || [];
    },
  });

  const products = productsQuery.data || [];

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

export const useProduct = (slug: string) => {
  const productQuery = useQuery({
    queryKey: ['product', slug],
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, category:categories(*)')
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
