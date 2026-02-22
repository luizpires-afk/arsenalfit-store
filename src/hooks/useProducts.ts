import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { compareBySubFilter, dedupeCatalogProducts } from '@/lib/catalog';
import { resolvePricePresentation } from '@/lib/pricing.js';

export interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  pix_price?: number | null;
  pix_price_source?: string | null;
  original_price?: number | null;
  previous_price?: number | null;
  detected_at?: string | null;
  short_description?: string | null;
  description?: string | null;
  image_url?: string | null;
  image_url_original?: string | null;
  image_url_cached?: string | null;
  affiliate_link?: string | null;
  affiliate_verified?: boolean | null;
  source_url?: string | null;
  canonical_offer_url?: string | null;
  ml_item_id?: string | null;
  external_id?: string | null;
  category_id?: string | null;
  category?: any;
  brand?: string | null;
  subcategory?: string | null;
  tech_sheet?: string | null;
  is_active: boolean;
  status?: string | null;
  data_health_status?: string | null;
  auto_disabled_reason?: string | null;
  is_featured: boolean;
  is_on_sale: boolean;
  curation_badges?: string[] | null;
  specifications?: Record<string, unknown> | null;
  quality_issues?: string[] | null;
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
        .eq('status', 'active')
        .eq('data_health_status', 'HEALTHY')
        .eq('is_blocked', false)
        .or('auto_disabled_reason.is.null,auto_disabled_reason.neq.blocked')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as Product[]) || [];
    },
  });

  const products = useMemo(() => {
    const raw = ((productsQuery.data || []) as Product[]).filter((product) => {
      const status = String(product.status ?? "").toLowerCase();
      const isActive = product.is_active === true && status === "active";
      const health = String(product.data_health_status ?? "").toUpperCase();
      const autoDisabledReason = String((product as any).auto_disabled_reason ?? "").toLowerCase();
      return isActive && health === "HEALTHY" && autoDisabledReason !== "blocked";
    });
    const deduped = dedupeCatalogProducts(raw as any[]) as Product[];
    return [...deduped].sort((a, b) => compareBySubFilter(a as any, b as any, 'melhores'));
  }, [productsQuery.data]);

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
      const minDiscountPercent = 20;
      return products.filter((p) => {
        if (!p.detected_at) {
          return false;
        }
        const detectedTime = new Date(p.detected_at).getTime();
        const isRecent = Number.isFinite(detectedTime) && now - detectedTime <= limit;
        if (!isRecent) return false;

        const pricing = resolvePricePresentation(p as any);
        const discountPercent =
          typeof pricing.discountPercent === "number" ? pricing.discountPercent : 0;
        return discountPercent >= minDiscountPercent;
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
        .eq('is_blocked', false)
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
