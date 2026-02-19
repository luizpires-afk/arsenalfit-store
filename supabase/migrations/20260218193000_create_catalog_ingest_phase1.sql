-- Phase 1: Catalog ingest foundation (marketplace mapping + offers + price history + daily cron).

create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists private;

create table if not exists private.cron_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

revoke all on schema private from public;
revoke all on all tables in schema private from public;
revoke all on all sequences in schema private from public;

alter table public.products
  add column if not exists source_url text;

create table if not exists public.catalog_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'cron',
  status text not null default 'running',
  dry_run boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  total_mappings integer not null default 0,
  total_candidates integer not null default 0,
  total_processed integer not null default 0,
  inserted_products integer not null default 0,
  updated_products integer not null default 0,
  upserted_offers integer not null default 0,
  inserted_history integer not null default 0,
  skipped integer not null default 0,
  errors integer not null default 0,
  categories_processed integer not null default 0,
  replacements integer not null default 0,
  elite_added integer not null default 0,
  discarded_no_free_shipping integer not null default 0,
  discarded_low_reputation integer not null default 0,
  discarded_not_new integer not null default 0,
  discarded_invalid_price integer not null default 0,
  discarded_low_score integer not null default 0,
  api_errors integer not null default 0,
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists catalog_ingest_runs_started_at_idx
  on public.catalog_ingest_runs (started_at desc);

create table if not exists public.category_marketplace_map (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  marketplace text not null default 'mercadolivre',
  site_id text not null default 'MLB',
  ml_category_id text null,
  query text null,
  seller_ids bigint[] not null default '{}',
  include_terms text[] not null default '{}',
  exclude_terms text[] not null default '{}',
  max_items integer not null default 120,
  is_active boolean not null default true,
  sort_mode text not null default 'price_asc',
  last_run_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_marketplace_map_has_query_or_category
    check (
      (query is not null and btrim(query) <> '')
      or (ml_category_id is not null and btrim(ml_category_id) <> '')
    ),
  constraint category_marketplace_map_marketplace_check
    check (marketplace in ('mercadolivre')),
  constraint category_marketplace_map_sort_mode_check
    check (sort_mode in ('relevance', 'price_asc', 'price_desc', 'sold_desc', 'sold_quantity_desc'))
);

create index if not exists category_marketplace_map_active_idx
  on public.category_marketplace_map (is_active, marketplace, site_id);

create index if not exists category_marketplace_map_category_idx
  on public.category_marketplace_map (category_id);

create table if not exists public.product_offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid null references public.products(id) on delete set null,
  category_id uuid null references public.categories(id) on delete set null,
  marketplace text not null default 'mercadolivre',
  site_id text not null default 'MLB',
  external_id text not null,
  ml_category_id text null,
  seller_id bigint null,
  seller_name text null,
  title text not null,
  permalink text not null,
  affiliate_link text null,
  thumbnail_url text null,
  price numeric(10,2) not null,
  original_price numeric(10,2) null,
  pix_price numeric(10,2) null,
  currency_id text not null default 'BRL',
  free_shipping boolean not null default false,
  item_condition text null,
  item_status text null,
  raw_payload jsonb null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_offers_marketplace_check
    check (marketplace in ('mercadolivre'))
);

create unique index if not exists product_offers_marketplace_external_uidx
  on public.product_offers (marketplace, external_id);

create index if not exists product_offers_product_id_idx
  on public.product_offers (product_id);

create index if not exists product_offers_category_id_idx
  on public.product_offers (category_id);

create index if not exists product_offers_last_seen_at_idx
  on public.product_offers (last_seen_at desc);

create table if not exists public.offer_price_history (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.product_offers(id) on delete cascade,
  run_id uuid null references public.catalog_ingest_runs(id) on delete set null,
  source text not null default 'catalog_ingest',
  captured_at timestamptz not null default now(),
  price numeric(10,2) not null,
  original_price numeric(10,2) null,
  pix_price numeric(10,2) null
);

create index if not exists offer_price_history_offer_id_idx
  on public.offer_price_history (offer_id);

create index if not exists offer_price_history_captured_at_idx
  on public.offer_price_history (captured_at desc);

create table if not exists public.category_config (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  max_products integer not null default 20,
  min_daily_new integer not null default 5,
  elite_enabled boolean not null default true,
  enabled boolean not null default true,
  priority_weight_sales numeric(6,3) not null default 0.450,
  priority_weight_price numeric(6,3) not null default 0.350,
  priority_weight_reputation numeric(6,3) not null default 0.200,
  known_brands text[] not null default '{}',
  expensive_percentile numeric(5,4) not null default 0.8000,
  min_sales_for_elite integer not null default 50,
  min_reputation_for_elite numeric(5,4) not null default 0.8000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_config_category_uidx unique (category_id),
  constraint category_config_max_products_check check (max_products between 1 and 200),
  constraint category_config_min_daily_new_check check (min_daily_new between 0 and 50),
  constraint category_config_expensive_percentile_check check (expensive_percentile > 0 and expensive_percentile <= 1),
  constraint category_config_min_reputation_check check (min_reputation_for_elite >= 0 and min_reputation_for_elite <= 1)
);

create index if not exists category_config_enabled_idx
  on public.category_config (enabled, category_id);

create table if not exists public.product_scores (
  product_id uuid primary key references public.products(id) on delete cascade,
  category_id uuid null references public.categories(id) on delete set null,
  score_popularidade numeric(10,4) not null default 0,
  score_custo_beneficio numeric(10,4) not null default 0,
  seller_reputation numeric(5,4) null,
  sold_quantity integer not null default 0,
  popularity_rank integer null,
  is_elite boolean not null default false,
  score_version text not null default 'v2',
  last_evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_scores_category_idx
  on public.product_scores (category_id, score_custo_beneficio desc);

create index if not exists product_scores_elite_idx
  on public.product_scores (is_elite, score_custo_beneficio desc);

drop trigger if exists update_category_marketplace_map_modtime on public.category_marketplace_map;
create trigger update_category_marketplace_map_modtime
before update on public.category_marketplace_map
for each row execute function public.update_updated_at_column();

drop trigger if exists update_product_offers_modtime on public.product_offers;
create trigger update_product_offers_modtime
before update on public.product_offers
for each row execute function public.update_updated_at_column();

drop trigger if exists update_category_config_modtime on public.category_config;
create trigger update_category_config_modtime
before update on public.category_config
for each row execute function public.update_updated_at_column();

drop trigger if exists update_product_scores_modtime on public.product_scores;
create trigger update_product_scores_modtime
before update on public.product_scores
for each row execute function public.update_updated_at_column();

alter table public.catalog_ingest_runs enable row level security;
alter table public.category_marketplace_map enable row level security;
alter table public.product_offers enable row level security;
alter table public.offer_price_history enable row level security;
alter table public.category_config enable row level security;
alter table public.product_scores enable row level security;

drop policy if exists "catalog_ingest_runs_admin_read" on public.catalog_ingest_runs;
create policy "catalog_ingest_runs_admin_read"
  on public.catalog_ingest_runs
  for select
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "catalog_ingest_runs_service_manage" on public.catalog_ingest_runs;
create policy "catalog_ingest_runs_service_manage"
  on public.catalog_ingest_runs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "category_marketplace_map_admin_manage" on public.category_marketplace_map;
create policy "category_marketplace_map_admin_manage"
  on public.category_marketplace_map
  for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "category_marketplace_map_service_manage" on public.category_marketplace_map;
create policy "category_marketplace_map_service_manage"
  on public.category_marketplace_map
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "product_offers_admin_read" on public.product_offers;
create policy "product_offers_admin_read"
  on public.product_offers
  for select
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "product_offers_service_manage" on public.product_offers;
create policy "product_offers_service_manage"
  on public.product_offers
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "offer_price_history_admin_read" on public.offer_price_history;
create policy "offer_price_history_admin_read"
  on public.offer_price_history
  for select
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "offer_price_history_service_manage" on public.offer_price_history;
create policy "offer_price_history_service_manage"
  on public.offer_price_history
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "category_config_admin_manage" on public.category_config;
create policy "category_config_admin_manage"
  on public.category_config
  for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "category_config_service_manage" on public.category_config;
create policy "category_config_service_manage"
  on public.category_config
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "product_scores_admin_read" on public.product_scores;
create policy "product_scores_admin_read"
  on public.product_scores
  for select
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "product_scores_service_manage" on public.product_scores;
create policy "product_scores_service_manage"
  on public.product_scores
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.catalog_ingest_runs to authenticated;
grant select on public.product_offers to authenticated;
grant select on public.offer_price_history to authenticated;
grant select, insert, update, delete on public.category_marketplace_map to authenticated;
grant select, insert, update, delete on public.category_config to authenticated;
grant select on public.product_scores to authenticated;

insert into public.category_config (
  category_id,
  max_products,
  min_daily_new,
  elite_enabled,
  enabled
)
select
  c.id as category_id,
  case
    when c.slug in ('roupas-masculinas', 'roupas_masc', 'masculino') then 30
    when c.slug in ('roupas-femininas', 'roupas_fem', 'feminino') then 30
    when c.slug like '%acessor%' then 25
    when c.slug like '%suplement%' then 30
    when c.slug like '%equip%' then 15
    else 20
  end as max_products,
  5 as min_daily_new,
  true as elite_enabled,
  true as enabled
from public.categories c
on conflict (category_id) do nothing;

create or replace function private.invoke_catalog_ingest()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  secret text;
  url text := 'https://pixqurduxqfcujfadkbw.supabase.co/functions/v1/catalog-ingest';
  headers jsonb;
  body jsonb := jsonb_build_object('source', 'cron');
begin
  select value into secret from private.cron_secrets where key = 'catalog-ingest';
  if secret is null then
    select value into secret from private.cron_secrets where key = 'price-sync';
  end if;
  if secret is null then
    select value into secret from private.cron_secrets where key = 'price-drop-alerts';
  end if;
  if secret is null then
    raise exception 'cron secret missing';
  end if;

  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', secret
  );

  perform net.http_post(
    url := url,
    headers := headers,
    body := body
  );
end $$;

revoke all on function private.invoke_catalog_ingest() from public;

do $$
declare
  ingest_job_id int;
  ingest_schedule text := '15 4 * * *';
begin
  select jobid into ingest_job_id from cron.job where jobname = 'catalog-ingest';
  if ingest_job_id is not null then
    perform cron.unschedule(ingest_job_id);
  end if;

  perform cron.schedule(
    'catalog-ingest',
    ingest_schedule,
    $cron$select private.invoke_catalog_ingest();$cron$
  );
end $$;
