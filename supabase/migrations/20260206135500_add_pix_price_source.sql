alter table public.products
  add column if not exists pix_price_source text,
  add column if not exists pix_price_checked_at timestamptz;

comment on column public.products.pix_price_source is 'manual | api | scraper';
