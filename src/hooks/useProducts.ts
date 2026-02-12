import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  pix_price?: number | null;
  original_price?: number | null;
  previous_price?: number | null;
  detected_at?: string | null;
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
  is_blocked?: boolean | null;
  free_shipping?: boolean;
  marketplace?: string;
  last_sync?: string | null;
  updated_at?: string;
  ultima_verificacao?: string | null;
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
        .eq('is_blocked', false)
        .or('auto_disabled_reason.is.null,auto_disabled_reason.neq.blocked')
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

  const getDailyDeals = useMemo(
    () => () => {
      const now = Date.now();
      const limit = 24 * 60 * 60 * 1000;
      return products.filter((p) => {
        if (!p.detected_at || p.previous_price === null || p.previous_price === undefined) {
          return false;
        }
        const detectedTime = new Date(p.detected_at).getTime();
        const isRecent = Number.isFinite(detectedTime) && now - detectedTime <= limit;
        const isDrop = p.previous_price > p.price;
        return isRecent && isDrop;
      });
    },
    [products]
  );

  return {
    products,
    loading: productsQuery.isLoading,
    error: productsQuery.error ? 'Erro ao carregar produtos' : null,
    refetch: productsQuery.refetch,
    getFeaturedProducts,
    getOnSaleProducts,
    getDailyDeals,
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
        .eq('is_blocked', false)
        .or('auto_disabled_reason.is.null,auto_disabled_reason.neq.blocked')
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
