-- Deals: produtos ativos ordenados por maior desconto e mais recentes
CREATE OR REPLACE FUNCTION public.get_deals(limit_count integer DEFAULT 12)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  image_url text,
  preco numeric,
  preco_anterior numeric,
  desconto numeric,
  last_updated timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id,
    p.name,
    p.slug,
    p.image_url,
    p.price AS preco,
    p.original_price AS preco_anterior,
    COALESCE(p.original_price, p.price, 0) - COALESCE(p.price, 0) AS desconto,
    p.updated_at AS last_updated
  FROM public.products p
  WHERE p.is_active = true
  ORDER BY (COALESCE(p.original_price, p.price, 0) - COALESCE(p.price, 0)) DESC,
           p.updated_at DESC
  LIMIT limit_count;
$$;
