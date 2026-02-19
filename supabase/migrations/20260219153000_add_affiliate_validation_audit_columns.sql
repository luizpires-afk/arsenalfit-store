-- Track affiliate validation audit for Mercado Livre products.

alter table public.products
  add column if not exists validated_at timestamptz,
  add column if not exists validated_by text,
  add column if not exists affiliate_url_used text;

create index if not exists idx_products_validated_at
  on public.products (validated_at desc)
  where validated_at is not null;
