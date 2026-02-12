alter table public.products
  add column if not exists last_price_source text,
  add column if not exists last_price_verified_at timestamptz;

create index if not exists products_last_price_source_idx
  on public.products (last_price_source);

create index if not exists products_last_price_verified_at_idx
  on public.products (last_price_verified_at desc);
