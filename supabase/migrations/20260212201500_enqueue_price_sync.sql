create extension if not exists pg_net;

create schema if not exists private;

create table if not exists private.cron_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create or replace function public.enqueue_price_sync(p_payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  secret text;
  url text := 'https://pixqurduxqfcujfadkbw.supabase.co/functions/v1/price-sync';
  headers jsonb;
  body jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if coalesce(auth.role(), 'none') <> 'service_role' then
    raise exception 'forbidden';
  end if;

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
end
$$;

revoke all on function public.enqueue_price_sync(jsonb) from public;
grant execute on function public.enqueue_price_sync(jsonb) to service_role;
