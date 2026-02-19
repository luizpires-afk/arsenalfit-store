-- Catalog ingest phase 2: fitness gate controls, category limits, and extended run metrics.

alter table public.category_marketplace_map
  add column if not exists site_category text,
  add column if not exists ml_category_allowlist text[] not null default '{}'::text[],
  add column if not exists enabled boolean not null default true,
  add column if not exists max_active integer,
  add column if not exists max_standby integer,
  add column if not exists max_new_per_day integer,
  add column if not exists min_delta_score_to_replace numeric(6,2),
  add column if not exists max_price_equipment numeric(10,2);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'category_marketplace_map_site_category_check'
      and conrelid = 'public.category_marketplace_map'::regclass
  ) then
    alter table public.category_marketplace_map
      drop constraint category_marketplace_map_site_category_check;
  end if;

  alter table public.category_marketplace_map
    add constraint category_marketplace_map_site_category_check
    check (
      site_category is null
      or site_category in ('roupas_masc', 'roupas_fem', 'acessorios', 'suplementos', 'equipamentos')
    );
exception
  when duplicate_object then null;
end $$;

update public.category_marketplace_map m
set site_category = case
  when lower(coalesce(c.name, '') || ' ' || coalesce(c.slug, '')) like '%suplement%' then 'suplementos'
  when lower(coalesce(c.name, '') || ' ' || coalesce(c.slug, '')) like '%equip%' then 'equipamentos'
  when lower(coalesce(c.name, '') || ' ' || coalesce(c.slug, '')) like '%acess%' then 'acessorios'
  when lower(coalesce(c.name, '') || ' ' || coalesce(c.slug, '')) like '%femin%' then 'roupas_fem'
  when lower(coalesce(c.name, '') || ' ' || coalesce(c.slug, '')) like '%mascul%' then 'roupas_masc'
  when lower(coalesce(c.name, '') || ' ' || coalesce(c.slug, '')) like '%roup%' then 'roupas_masc'
  when lower(coalesce(m.query, '')) like '%femin%' then 'roupas_fem'
  when lower(coalesce(m.query, '')) like '%mascul%' then 'roupas_masc'
  when lower(coalesce(m.query, '')) like any (array['%whey%', '%creatina%', '%suplement%']) then 'suplementos'
  when lower(coalesce(m.query, '')) like any (array['%halter%', '%elastico%', '%mini band%', '%kettlebell%']) then 'equipamentos'
  when lower(coalesce(m.query, '')) like any (array['%strap%', '%shaker%', '%squeeze%', '%acessor%']) then 'acessorios'
  else site_category
end
from public.categories c
where c.id = m.category_id
  and (m.site_category is null or btrim(m.site_category) = '');

update public.category_marketplace_map
set site_category = 'acessorios'
where site_category is null or btrim(site_category) = '';

update public.category_marketplace_map
set enabled = coalesce(enabled, is_active, true);

update public.category_marketplace_map
set ml_category_allowlist = array[upper(btrim(ml_category_id))]
where (ml_category_allowlist is null or array_length(ml_category_allowlist, 1) is null)
  and ml_category_id is not null
  and btrim(ml_category_id) <> '';

update public.category_marketplace_map m
set
  max_active = coalesce(max_active, cfg.max_products, 20),
  max_standby = coalesce(max_standby, greatest(coalesce(max_active, cfg.max_products, 20), coalesce(cfg.max_products, 20) * 2)),
  max_new_per_day = coalesce(max_new_per_day, greatest(1, coalesce(cfg.min_daily_new, 5))),
  min_delta_score_to_replace = coalesce(min_delta_score_to_replace, 8)
from public.category_config cfg
where cfg.category_id = m.category_id;

update public.category_marketplace_map
set
  max_active = coalesce(max_active, 20),
  max_standby = coalesce(max_standby, greatest(coalesce(max_active, 20), 40)),
  max_new_per_day = coalesce(max_new_per_day, 5),
  min_delta_score_to_replace = coalesce(min_delta_score_to_replace, 8);

alter table public.catalog_ingest_runs
  add column if not exists rejected_by_allowlist integer not null default 0,
  add column if not exists rejected_by_negative_terms integer not null default 0,
  add column if not exists rejected_ambiguous_without_gym_context integer not null default 0,
  add column if not exists rejected_low_score integer not null default 0,
  add column if not exists inserted_active integer not null default 0,
  add column if not exists inserted_standby integer not null default 0,
  add column if not exists replaced_active integer not null default 0,
  add column if not exists offers_added integer not null default 0,
  add column if not exists offers_updated integer not null default 0;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'products_status_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products drop constraint products_status_check;
  end if;

  alter table public.products
    add constraint products_status_check
    check (status in ('active', 'out_of_stock', 'paused', 'standby', 'archived'));
exception
  when duplicate_object then null;
end $$;
