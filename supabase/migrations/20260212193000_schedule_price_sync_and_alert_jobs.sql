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

create or replace function private.invoke_price_sync()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  secret text;
  url text := 'https://pixqurduxqfcujfadkbw.supabase.co/functions/v1/price-sync';
  headers jsonb;
  body jsonb := jsonb_build_object('source', 'cron');
begin
  select value into secret from private.cron_secrets where key = 'price-sync';
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

revoke all on function private.invoke_price_sync() from public;

do $$
declare
  sync_job_id int;
  alerts_job_id int;
  sync_schedule text := '0 */6 * * *';
begin
  select jobid into sync_job_id from cron.job where jobname = 'price-sync';
  if sync_job_id is not null then
    perform cron.unschedule(sync_job_id);
  end if;

  perform cron.schedule(
    'price-sync',
    sync_schedule,
    $cron$select private.invoke_price_sync();$cron$
  );

  select jobid into alerts_job_id from cron.job where jobname = 'price-drop-alerts';
  if alerts_job_id is not null then
    perform cron.unschedule(alerts_job_id);
  end if;

  perform cron.schedule(
    'price-drop-alerts',
    sync_schedule,
    $cron$select private.invoke_price_drop_alerts();$cron$
  );
end $$;
