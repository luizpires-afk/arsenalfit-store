alter table public.products
  add column if not exists auto_disabled_reason text,
  add column if not exists auto_disabled_at timestamptz;

create index if not exists products_auto_disabled_reason_idx
  on public.products (auto_disabled_reason);
