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

create or replace function public.set_cron_secret(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if coalesce(auth.role(), 'none') <> 'service_role' then
    raise exception 'forbidden';
  end if;

  insert into private.cron_secrets(key, value, updated_at)
  values (p_key, p_value, now())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at;
end $$;

revoke all on function public.set_cron_secret(text, text) from public;

create or replace function private.invoke_price_drop_alerts()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  secret text;
  url text := 'https://pixqurduxqfcujfadkbw.supabase.co/functions/v1/price-drop-alerts';
  headers jsonb;
  body jsonb := jsonb_build_object('source','cron');
begin
  select value into secret from private.cron_secrets where key = 'price-drop-alerts';
  if secret is null then
    raise exception 'cron secret missing';
  end if;

  headers := jsonb_build_object(
    'Content-Type','application/json',
    'x-cron-secret', secret
  );

  perform net.http_post(
    url := url,
    headers := headers,
    body := body
  );
end $$;

revoke all on function private.invoke_price_drop_alerts() from public;

do $$
declare
  job_id int;
begin
  select jobid into job_id from cron.job where jobname = 'price-drop-alerts';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;

  perform cron.schedule(
    'price-drop-alerts',
    '0 */6 * * *',
    $cron$select private.invoke_price_drop_alerts();$cron$
  );
end $$;
