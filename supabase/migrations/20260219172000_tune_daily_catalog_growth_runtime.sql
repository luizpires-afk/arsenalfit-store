-- Tune daily catalog ingest runtime budget for daily growth.
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
    'candidate_pool_size', 50,
    'max_runtime_ms', 120000
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
