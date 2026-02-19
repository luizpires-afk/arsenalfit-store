-- Harden accessories ingestion against coffee/thermal products
-- and align daily catalog-ingest before the 03:00 local price-sync window.

-- 1) Replace old thermal-bottle accessory query with fitness bottle query.
update public.category_marketplace_map
set
  query = 'squeeze academia garrafa esportiva',
  include_terms = array['squeeze', 'garrafa esportiva', 'academia', 'fitness', 'treino'],
  exclude_terms = (
    select array_agg(distinct term order by term)
    from unnest(
      coalesce(public.category_marketplace_map.exclude_terms, '{}'::text[]) ||
      array[
        'cafe',
        'cafeteira',
        'chimarrao',
        'erva mate',
        'cuia',
        'bule',
        'coador',
        'garrafa termica',
        'copo termico',
        'stanley',
        'termolar',
        'magic pump'
      ]::text[]
    ) as term
  )
where marketplace = 'mercadolivre'
  and site_category = 'acessorios'
  and lower(coalesce(query, '')) like '%garrafa%'
  and lower(coalesce(query, '')) like '%termica%';

-- 2) Ensure all accessory mappings carry strong coffee/thermal excludes.
update public.category_marketplace_map
set exclude_terms = (
  select array_agg(distinct term order by term)
  from unnest(
    coalesce(public.category_marketplace_map.exclude_terms, '{}'::text[]) ||
    array[
      'cafe',
      'cafeteira',
      'chimarrao',
      'erva mate',
      'cuia',
      'bule',
      'coador',
      'garrafa termica',
      'copo termico',
      'stanley',
      'termolar',
      'magic pump'
    ]::text[]
  ) as term
)
where marketplace = 'mercadolivre'
  and site_category = 'acessorios';

-- 3) Remove coffee/thermal products from active storefront (keep history in standby).
with accessory_categories as (
  select id
  from public.categories
  where lower(coalesce(name, '') || ' ' || coalesce(slug, '')) like '%acessor%'
)
update public.products p
set
  is_active = false,
  status = 'standby',
  auto_disabled_reason = 'blocked',
  auto_disabled_at = coalesce(p.auto_disabled_at, now())
where p.marketplace = 'mercadolivre'
  and p.category_id in (select id from accessory_categories)
  and (
    lower(coalesce(p.name, '')) ~ '(garrafa termica|garrafa térmica|copo termico|copo térmico|stanley|termolar|magic pump|cafeteira|garrafa de cafe|garrafa de café|chimarrao|erva ?mate|bule|coador|cuia)'
    or lower(coalesce(p.short_description, '')) ~ '(garrafa termica|garrafa térmica|copo termico|copo térmico|stanley|termolar|magic pump|cafeteira|garrafa de cafe|garrafa de café|chimarrao|erva ?mate|bule|coador|cuia)'
  );

-- 4) Accessory known brands: remove thermal/coffee-oriented brands.
update public.category_config cfg
set known_brands = array_remove(
  array_remove(
    array_remove(coalesce(cfg.known_brands, '{}'::text[]), 'stanley'),
    'termolar'
  ),
  'magic pump'
)
from public.categories c
where cfg.category_id = c.id
  and lower(coalesce(c.name, '') || ' ' || coalesce(c.slug, '')) like '%acessor%';

-- 5) Schedule catalog-ingest at 05:30 UTC (02:30 BRT), before 06:00 UTC sync (03:00 BRT).
do $$
declare
  ingest_job_id int;
  has_invoke boolean := exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'invoke_catalog_ingest'
  );
begin
  if has_invoke then
    select jobid into ingest_job_id from cron.job where jobname = 'catalog-ingest';
    if ingest_job_id is not null then
      perform cron.unschedule(ingest_job_id);
    end if;

    perform cron.schedule(
      'catalog-ingest',
      '30 5 * * *',
      $cron$select private.invoke_catalog_ingest();$cron$
    );
  end if;
end $$;

