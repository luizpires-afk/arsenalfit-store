alter table public.products
  add column if not exists previous_price numeric;
