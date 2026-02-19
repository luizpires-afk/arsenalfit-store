-- Catalog ingest v2: curation schema, metrics, constraints, and starter mappings.

alter table public.catalog_ingest_runs
  add column if not exists categories_processed integer not null default 0,
  add column if not exists replacements integer not null default 0,
  add column if not exists elite_added integer not null default 0,
  add column if not exists discarded_no_free_shipping integer not null default 0,
  add column if not exists discarded_low_reputation integer not null default 0,
  add column if not exists discarded_not_new integer not null default 0,
  add column if not exists discarded_invalid_price integer not null default 0,
  add column if not exists discarded_low_score integer not null default 0,
  add column if not exists api_errors integer not null default 0;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'category_marketplace_map_sort_mode_check'
      and conrelid = 'public.category_marketplace_map'::regclass
  ) then
    alter table public.category_marketplace_map
      drop constraint category_marketplace_map_sort_mode_check;
  end if;

  alter table public.category_marketplace_map
    add constraint category_marketplace_map_sort_mode_check
    check (sort_mode in ('relevance', 'price_asc', 'price_desc', 'sold_desc', 'sold_quantity_desc'));
exception
  when duplicate_object then null;
end $$;

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

drop trigger if exists update_category_config_modtime on public.category_config;
create trigger update_category_config_modtime
before update on public.category_config
for each row execute function public.update_updated_at_column();

drop trigger if exists update_product_scores_modtime on public.product_scores;
create trigger update_product_scores_modtime
before update on public.product_scores
for each row execute function public.update_updated_at_column();

alter table public.category_config enable row level security;
alter table public.product_scores enable row level security;

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

grant select, insert, update, delete on public.category_config to authenticated;
grant select on public.product_scores to authenticated;

insert into public.category_config (
  category_id,
  max_products,
  min_daily_new,
  elite_enabled,
  enabled,
  known_brands
)
select
  c.id as category_id,
  case
    when k.key like '%roup%' and (k.key like '%masc%' or k.key like '%homem%') then 30
    when k.key like '%roup%' and (k.key like '%fem%' or k.key like '%mulher%') then 30
    when k.key like '%acess%' then 25
    when k.key like '%suplement%' then 30
    when k.key like '%equip%' then 15
    else 20
  end as max_products,
  5 as min_daily_new,
  true as elite_enabled,
  true as enabled,
  case
    when k.key like '%suplement%' then
      array['growth','max titanium','integralmedica','dux','black skull','soldiers nutrition','ftw']
    when k.key like '%roup%' then
      array['nike','adidas','under armour','puma']
    when k.key like '%acess%' then
      array['huawei','xiaomi','stanley','gshield']
    when k.key like '%equip%' then
      array['vollo','acte','liveup','ahead sports']
    else array[]::text[]
  end as known_brands
from public.categories c
cross join lateral (
  select lower(coalesce(c.name, '') || ' ' || coalesce(c.slug, '')) as key
) k
on conflict (category_id) do update
set
  max_products = excluded.max_products,
  min_daily_new = excluded.min_daily_new,
  elite_enabled = excluded.elite_enabled,
  enabled = excluded.enabled,
  known_brands = case
    when array_length(public.category_config.known_brands, 1) is null then excluded.known_brands
    else public.category_config.known_brands
  end;

with category_keys as (
  select
    c.id as category_id,
    lower(coalesce(c.name, '') || ' ' || coalesce(c.slug, '')) as key
  from public.categories c
),
seed_queries as (
  select
    'roupas'::text as grp,
    'roupa fitness masculina'::text as query,
    array['fitness','masculino']::text[] as include_terms,
    array['kit atacado','fardo']::text[] as exclude_terms,
    180::integer as max_items,
    'sold_desc'::text as sort_mode
  union all
  select 'roupas','roupa fitness feminina',array['fitness','feminino'],array['kit atacado','fardo'],180,'sold_desc'
  union all
  select 'acessorios','relogio esportivo smartwatch',array['relogio','smartwatch'],array['usado','recondicionado'],120,'sold_desc'
  union all
  select 'acessorios','garrafa termica academia',array['garrafa','termica'],array['usado','recondicionado'],120,'sold_desc'
  union all
  select 'acessorios','strap academia levantamento',array['strap','academia'],array['usado','recondicionado'],100,'sold_desc'
  union all
  select 'suplementos','whey protein concentrado',array['whey'],array['atacado','fardo','sachê'],220,'sold_desc'
  union all
  select 'suplementos','creatina monohidratada',array['creatina'],array['atacado','fardo'],220,'sold_desc'
  union all
  select 'suplementos','pre treino',array['pre treino'],array['atacado','fardo'],220,'sold_desc'
  union all
  select 'suplementos','multivitaminico',array['multivitaminico'],array['atacado','fardo'],180,'sold_desc'
  union all
  select 'equipamentos','elastico de resistencia treino',array['elastico','resistencia'],array['profissional','estacao','rack','smith','academia completa'],90,'sold_desc'
  union all
  select 'equipamentos','halter emborrachado par',array['halter','emborrachado'],array['profissional','estacao','rack','smith','academia completa'],90,'sold_desc'
)
insert into public.category_marketplace_map (
  category_id,
  marketplace,
  site_id,
  query,
  seller_ids,
  include_terms,
  exclude_terms,
  max_items,
  is_active,
  sort_mode
)
select
  ck.category_id,
  'mercadolivre' as marketplace,
  'MLB' as site_id,
  sq.query,
  '{}'::bigint[] as seller_ids,
  sq.include_terms,
  sq.exclude_terms,
  sq.max_items,
  true as is_active,
  sq.sort_mode
from category_keys ck
join seed_queries sq on (
  (sq.grp = 'roupas' and (ck.key like '%roup%' or ck.key like '%vestuar%' or ck.key like '%fitness%'))
  or (sq.grp = 'acessorios' and (ck.key like '%acess%' or ck.key like '%util%'))
  or (sq.grp = 'suplementos' and (ck.key like '%suplement%' or ck.key like '%nutri%'))
  or (sq.grp = 'equipamentos' and (ck.key like '%equip%' or ck.key like '%treino%' or ck.key like '%academ%'))
)
where not exists (
  select 1
  from public.category_marketplace_map m
  where m.category_id = ck.category_id
    and m.marketplace = 'mercadolivre'
    and coalesce(m.query, '') = sq.query
);
