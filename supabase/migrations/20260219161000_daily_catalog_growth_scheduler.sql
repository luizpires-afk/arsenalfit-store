-- Daily Catalog Growth
-- Adds daily brand usage/discovery tracking and schedules ingest at 08:30 America/Sao_Paulo.

create table if not exists public.daily_catalog_brand_usage (
  day_date date not null,
  site_category text not null,
  brand_key text not null,
  usage_count integer not null default 0,
  last_run_id uuid,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint daily_catalog_brand_usage_pk primary key (day_date, site_category, brand_key),
  constraint daily_catalog_brand_usage_site_category_check
    check (site_category in ('suplementos', 'acessorios', 'roupas_masc', 'roupas_fem', 'equipamentos')),
  constraint daily_catalog_brand_usage_usage_check
    check (usage_count >= 0)
);

create index if not exists idx_daily_catalog_brand_usage_day
  on public.daily_catalog_brand_usage (day_date desc, site_category);

create table if not exists public.daily_catalog_discoveries (
  id bigserial primary key,
  run_id uuid,
  product_id uuid references public.products(id) on delete set null,
  external_id text not null,
  site_category text not null,
  category_id uuid references public.categories(id) on delete set null,
  brand text,
  score_custo_beneficio numeric(8,6),
  score_popularidade numeric(8,6),
  source text not null default 'daily_catalog_growth',
  discovered_at timestamptz not null default now(),
  status text,
  constraint daily_catalog_discoveries_site_category_check
    check (site_category in ('suplementos', 'acessorios', 'roupas_masc', 'roupas_fem', 'equipamentos'))
);

create index if not exists idx_daily_catalog_discoveries_date
  on public.daily_catalog_discoveries (discovered_at desc);

create index if not exists idx_daily_catalog_discoveries_external
  on public.daily_catalog_discoveries (external_id, discovered_at desc);

alter table public.daily_catalog_brand_usage enable row level security;
alter table public.daily_catalog_discoveries enable row level security;

drop policy if exists "daily_catalog_brand_usage_service_manage" on public.daily_catalog_brand_usage;
create policy "daily_catalog_brand_usage_service_manage"
  on public.daily_catalog_brand_usage
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "daily_catalog_discoveries_service_manage" on public.daily_catalog_discoveries;
create policy "daily_catalog_discoveries_service_manage"
  on public.daily_catalog_discoveries
  for all
  to service_role
  using (true)
  with check (true);

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
  body jsonb := jsonb_build_object(
    'source', 'daily_catalog_growth',
    'daily_growth', true,
    'daily_quotas', jsonb_build_object(
      'suplementos', jsonb_build_object('min', 3, 'max', 5),
      'acessorios', jsonb_build_object('min', 4, 'max', 4),
      'roupas_masc', jsonb_build_object('min', 2, 'max', 2),
      'roupas_fem', jsonb_build_object('min', 2, 'max', 2),
      'equipamentos', jsonb_build_object('min', 1, 'max', 2)
    ),
    'max_brand_per_day', 2,
    'candidate_pool_size', 50
  );
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

-- 08:30 America/Sao_Paulo -> 11:30 UTC (BRT standard offset).
do $$
declare
  ingest_job_id int;
begin
  select jobid into ingest_job_id from cron.job where jobname = 'catalog-ingest';
  if ingest_job_id is not null then
    perform cron.unschedule(ingest_job_id);
  end if;

  perform cron.schedule(
    'catalog-ingest',
    '30 11 * * *',
    $cron$select private.invoke_catalog_ingest();$cron$
  );
end $$;
