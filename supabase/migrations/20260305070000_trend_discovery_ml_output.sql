begin;

create table if not exists public.trend_discovered_products (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  source_platform text not null,
  trend_score numeric(6,3) not null,
  mercadolivre_product_url text not null,
  price numeric(12,2) null,
  seller_rating numeric(6,3) null,
  reviews integer null,
  status text not null default 'pending_review',
  ml_item_id text null,
  stock integer null,
  fast_shipping boolean not null default false,
  raw_signal jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trend_discovered_products_status_check
    check (status in ('pending_review', 'approved', 'rejected'))
);

create unique index if not exists idx_trend_discovered_products_ml_item_id
  on public.trend_discovered_products (ml_item_id)
  where ml_item_id is not null;

create unique index if not exists idx_trend_discovered_products_ml_url
  on public.trend_discovered_products (mercadolivre_product_url);

create index if not exists idx_trend_discovered_products_status_created
  on public.trend_discovered_products (status, created_at desc);

alter table public.trend_discovered_products enable row level security;

drop policy if exists trend_discovered_products_admin_select on public.trend_discovered_products;
create policy trend_discovered_products_admin_select
on public.trend_discovered_products
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists trend_discovered_products_admin_insert on public.trend_discovered_products;
create policy trend_discovered_products_admin_insert
on public.trend_discovered_products
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists trend_discovered_products_admin_update on public.trend_discovered_products;
create policy trend_discovered_products_admin_update
on public.trend_discovered_products
for update
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.set_trend_discovered_products_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_trend_discovered_products_updated_at on public.trend_discovered_products;
create trigger trg_trend_discovered_products_updated_at
before update on public.trend_discovered_products
for each row execute function public.set_trend_discovered_products_updated_at();

commit;
