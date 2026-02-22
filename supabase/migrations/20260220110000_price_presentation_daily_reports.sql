begin;

create extension if not exists pg_net;

alter table public.products
  add column if not exists previous_price_source text,
  add column if not exists previous_price_expires_at timestamptz;

comment on column public.products.previous_price_source is 'Source of previous price shown in promotion: HISTORY | API_LIST | SCRAPER | NONE';
comment on column public.products.previous_price_expires_at is 'Expiration timestamp for previous price promotional display';

do $$
begin
  alter table public.products drop constraint if exists products_previous_price_source_check;
  alter table public.products
    add constraint products_previous_price_source_check
    check (
      previous_price_source is null
      or previous_price_source in ('HISTORY', 'API_LIST', 'SCRAPER', 'NONE')
    );
exception
  when undefined_table then
    null;
end $$;

alter table public.price_sync_reports
  add column if not exists report_date date,
  add column if not exists since_at timestamptz,
  add column if not exists until_at timestamptz,
  add column if not exists delivery_attempts integer,
  add column if not exists delivery_status text,
  add column if not exists last_error text,
  add column if not exists summary jsonb,
  add column if not exists source text;

update public.price_sync_reports
set
  report_date = coalesce(report_date, (coalesce(sent_at, created_at, now()) at time zone 'America/Sao_Paulo')::date),
  since_at = coalesce(since_at, coalesce(sent_at, created_at, now()) - interval '24 hours'),
  until_at = coalesce(until_at, coalesce(sent_at, created_at, now())),
  delivery_attempts = greatest(coalesce(delivery_attempts, 1), 1),
  delivery_status = coalesce(delivery_status, case when status = 'sent' then 'sent' else 'failed' end),
  last_error = coalesce(last_error, error),
  summary = coalesce(summary, '{}'::jsonb),
  source = coalesce(source, 'price_sync_report')
where true;

alter table public.price_sync_reports
  alter column report_date set not null,
  alter column delivery_attempts set default 1,
  alter column delivery_attempts set not null,
  alter column delivery_status set default 'pending',
  alter column delivery_status set not null,
  alter column summary set default '{}'::jsonb,
  alter column summary set not null,
  alter column source set default 'price_sync_report',
  alter column source set not null;

do $$
begin
  alter table public.price_sync_reports drop constraint if exists price_sync_reports_delivery_status_check;
  alter table public.price_sync_reports
    add constraint price_sync_reports_delivery_status_check
    check (delivery_status in ('pending', 'sent', 'failed', 'retrying'));
exception
  when undefined_table then
    null;
end $$;

with ranked as (
  select
    id,
    report_date,
    row_number() over (
      partition by report_date
      order by coalesce(sent_at, created_at) desc, created_at desc, id desc
    ) as rn
  from public.price_sync_reports
)
delete from public.price_sync_reports p
using ranked r
where p.id = r.id
  and r.rn > 1;

create unique index if not exists idx_price_sync_reports_report_date
  on public.price_sync_reports (report_date);

create table if not exists public.daily_run_reports (
  id uuid primary key default gen_random_uuid(),
  run_id uuid,
  source text not null default 'daily_import',
  report_date date not null,
  checklist jsonb not null default '{}'::jsonb,
  overall_status text not null default 'PASS',
  critical_failures integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (overall_status in ('PASS', 'FAIL')),
  check (critical_failures >= 0)
);

create index if not exists idx_daily_run_reports_date
  on public.daily_run_reports (report_date desc, created_at desc);

create index if not exists idx_daily_run_reports_run
  on public.daily_run_reports (run_id);

alter table public.daily_run_reports enable row level security;

drop policy if exists "daily_run_reports_admin_read" on public.daily_run_reports;
create policy "daily_run_reports_admin_read"
  on public.daily_run_reports
  for select
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "daily_run_reports_service_manage" on public.daily_run_reports;
create policy "daily_run_reports_service_manage"
  on public.daily_run_reports
  for all
  to service_role
  using (true)
  with check (true);

create or replace function private.invoke_price_sync_report()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  secret text;
  url text := 'https://pixqurduxqfcujfadkbw.supabase.co/functions/v1/price-sync-report';
  headers jsonb;
  body jsonb;
begin
  select value into secret from private.cron_secrets where key = 'price-sync-report';
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

  body := jsonb_build_object(
    'source', 'daily_report_cron',
    'mode', 'generate_daily',
    'report_date', to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD'),
    'max_retries', 3
  );

  perform net.http_post(
    url := url,
    headers := headers,
    body := body
  );
end $$;

revoke all on function private.invoke_price_sync_report() from public;

create or replace function public.request_price_sync_report_resend(
  p_report_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_secret text;
  v_url text := 'https://pixqurduxqfcujfadkbw.supabase.co/functions/v1/price-sync-report';
  v_headers jsonb;
  v_body jsonb;
  v_date date := coalesce(p_report_date, (now() at time zone 'America/Sao_Paulo')::date);
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'unauthorized';
  end if;

  select value into v_secret from private.cron_secrets where key = 'price-sync-report';
  if v_secret is null then
    select value into v_secret from private.cron_secrets where key = 'price-sync';
  end if;
  if v_secret is null then
    select value into v_secret from private.cron_secrets where key = 'price-drop-alerts';
  end if;
  if v_secret is null then
    raise exception 'cron secret missing';
  end if;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', v_secret
  );

  v_body := jsonb_build_object(
    'source', 'admin_resend',
    'mode', 'resend',
    'report_date', to_char(v_date, 'YYYY-MM-DD'),
    'max_retries', 3
  );

  perform net.http_post(
    url := v_url,
    headers := v_headers,
    body := v_body
  );

  return jsonb_build_object(
    'ok', true,
    'report_date', to_char(v_date, 'YYYY-MM-DD')
  );
end $$;

grant execute on function public.request_price_sync_report_resend(date) to authenticated, service_role;

do $$
declare
  report_job_id int;
begin
  select jobid into report_job_id from cron.job where jobname = 'price-sync-report';
  if report_job_id is not null then
    perform cron.unschedule(report_job_id);
  end if;

  -- 08:00 America/Sao_Paulo -> 11:00 UTC.
  perform cron.schedule(
    'price-sync-report',
    '0 11 * * *',
    $cron$select private.invoke_price_sync_report();$cron$
  );
end $$;

commit;
