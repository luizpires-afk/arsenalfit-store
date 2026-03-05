begin;

create table if not exists public.trend_near_matches (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  source_platform text not null,
  trend_score numeric(6,3) not null,
  mercadolivre_product_url text not null,
  price numeric(12,2) null,
  seller_rating numeric(6,3) null,
  reviews integer null,
  match_confidence numeric(6,4) not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_trend_near_matches_ml_url
  on public.trend_near_matches (mercadolivre_product_url);

create index if not exists idx_trend_near_matches_created
  on public.trend_near_matches (created_at desc);

alter table public.trend_near_matches enable row level security;

drop policy if exists trend_near_matches_admin_select on public.trend_near_matches;
create policy trend_near_matches_admin_select
on public.trend_near_matches
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists trend_near_matches_admin_insert on public.trend_near_matches;
create policy trend_near_matches_admin_insert
on public.trend_near_matches
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists trend_near_matches_admin_delete on public.trend_near_matches;
create policy trend_near_matches_admin_delete
on public.trend_near_matches
for delete
to authenticated
using (public.has_role(auth.uid(), 'admin'));

commit;
