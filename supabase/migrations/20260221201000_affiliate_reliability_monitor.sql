begin;

create table if not exists public.affiliate_reliability_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'cron',
  captured_at timestamptz not null default now(),
  window_hours integer not null default 48,
  standby_total integer not null default 0,
  standby_healthy integer not null default 0,
  standby_strict_gate integer not null default 0,
  active_total integer not null default 0,
  active_sec_link integer not null default 0,
  active_api_recent integer not null default 0,
  active_ml_item_ok integer not null default 0,
  open_affiliate_batches integer not null default 0,
  trace_report_date date,
  trace_total_mismatch integer not null default 0,
  overall_status text not null default 'PASS',
  checklist jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affiliate_reliability_snapshots_source_check
    check (source in ('cron', 'manual', 'on_demand')),
  constraint affiliate_reliability_snapshots_window_check
    check (window_hours between 1 and 168),
  constraint affiliate_reliability_snapshots_status_check
    check (overall_status in ('PASS', 'WARN', 'FAIL'))
);

create index if not exists idx_affiliate_reliability_snapshots_captured
  on public.affiliate_reliability_snapshots (captured_at desc);

create index if not exists idx_affiliate_reliability_snapshots_status
  on public.affiliate_reliability_snapshots (overall_status, captured_at desc);

alter table public.affiliate_reliability_snapshots enable row level security;

drop policy if exists "affiliate_reliability_snapshots_admin_read" on public.affiliate_reliability_snapshots;
create policy "affiliate_reliability_snapshots_admin_read"
  on public.affiliate_reliability_snapshots
  for select
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "affiliate_reliability_snapshots_service_manage" on public.affiliate_reliability_snapshots;
create policy "affiliate_reliability_snapshots_service_manage"
  on public.affiliate_reliability_snapshots
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.capture_affiliate_reliability_snapshot(
  p_source text default 'manual',
  p_window_hours integer default 48
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_hours integer := greatest(1, least(coalesce(p_window_hours, 48), 168));
  v_source text := case
    when lower(coalesce(p_source, '')) in ('cron', 'manual', 'on_demand') then lower(p_source)
    else 'manual'
  end;
  v_standby_total integer := 0;
  v_standby_healthy integer := 0;
  v_standby_strict_gate integer := 0;
  v_active_total integer := 0;
  v_active_sec_link integer := 0;
  v_active_api_recent integer := 0;
  v_active_ml_item_ok integer := 0;
  v_open_affiliate_batches integer := 0;
  v_trace_report_date date := null;
  v_trace_total_mismatch integer := 0;
  v_overall_status text := 'PASS';
  v_critical_failures integer := 0;
  v_checklist jsonb := '{}'::jsonb;
begin
  select
    count(*)::int as standby_total,
    count(*) filter (
      where coalesce(p.data_health_status, 'HEALTHY') = 'HEALTHY'
    )::int as standby_healthy,
    count(*) filter (
      where coalesce(p.data_health_status, 'HEALTHY') = 'HEALTHY'
        and coalesce(p.last_price_source, '') in ('API_BASE', 'API_PIX')
        and coalesce(p.last_price_verified_at, to_timestamp(0)) >= now() - make_interval(hours => v_window_hours)
        and coalesce(p.price_mismatch_status, 'NONE') <> 'OPEN'
        and coalesce(p.price, 0) > 0
        and coalesce(p.ml_item_id, '') <> ''
        and coalesce(nullif(btrim(p.source_url), ''), nullif(btrim(p.affiliate_link), '')) is not null
        and public.normalize_ml_external_id(p.ml_item_id) = public.resolve_product_ml_item_id(p.external_id, p.source_url, p.affiliate_link)
        and public.resolve_ml_canonical_offer_url(p.source_url, p.affiliate_link, p.ml_item_id) is not null
        and (
          p.canonical_offer_url is null
          or public.normalize_ml_permalink(p.canonical_offer_url) = public.resolve_ml_canonical_offer_url(p.source_url, p.affiliate_link, p.ml_item_id)
        )
    )::int as standby_strict_gate
  into
    v_standby_total,
    v_standby_healthy,
    v_standby_strict_gate
  from public.products p
  where lower(coalesce(p.marketplace, '')) like 'mercado%'
    and coalesce(p.auto_disabled_reason, '') <> 'blocked'
    and (
      lower(coalesce(p.status, '')) in ('standby', 'pending', 'pending_validacao', 'pending_validation')
      or coalesce(p.is_active, false) = false
      or coalesce(p.affiliate_verified, false) = false
    );

  select
    count(*)::int as active_total,
    count(*) filter (
      where public.is_mercadolivre_sec_link(p.affiliate_link)
    )::int as active_sec_link,
    count(*) filter (
      where coalesce(p.last_price_source, '') in ('API_BASE', 'API_PIX')
        and coalesce(p.last_price_verified_at, to_timestamp(0)) >= now() - make_interval(hours => v_window_hours)
    )::int as active_api_recent,
    count(*) filter (
      where public.normalize_ml_external_id(p.ml_item_id) = public.resolve_product_ml_item_id(p.external_id, p.source_url, p.affiliate_link)
    )::int as active_ml_item_ok
  into
    v_active_total,
    v_active_sec_link,
    v_active_api_recent,
    v_active_ml_item_ok
  from public.products p
  where lower(coalesce(p.marketplace, '')) like 'mercado%'
    and coalesce(p.auto_disabled_reason, '') <> 'blocked'
    and lower(coalesce(p.status, '')) = 'active'
    and coalesce(p.is_active, false) = true;

  select count(*)::int
    into v_open_affiliate_batches
  from public.affiliate_validation_batches b
  where b.status = 'OPEN';

  select r.report_date, coalesce(r.total_destination_mismatch, 0)
    into v_trace_report_date, v_trace_total_mismatch
  from public.offer_destination_trace_reports r
  order by r.report_date desc
  limit 1;

  if v_trace_total_mismatch > 0 then
    v_overall_status := 'FAIL';
    v_critical_failures := v_critical_failures + 1;
  elsif v_active_total > 0 and (
    v_active_sec_link < v_active_total
    or v_active_ml_item_ok < v_active_total
  ) then
    v_overall_status := 'WARN';
  elsif v_open_affiliate_batches > 0 then
    v_overall_status := 'WARN';
  end if;

  v_checklist := jsonb_build_object(
    'window_hours', v_window_hours,
    'captured_at', now(),
    'standby_total', v_standby_total,
    'standby_healthy', v_standby_healthy,
    'standby_strict_gate', v_standby_strict_gate,
    'active_total', v_active_total,
    'active_sec_link', v_active_sec_link,
    'active_api_recent', v_active_api_recent,
    'active_ml_item_ok', v_active_ml_item_ok,
    'open_affiliate_batches', v_open_affiliate_batches,
    'trace_report_date', v_trace_report_date,
    'trace_total_mismatch', v_trace_total_mismatch
  );

  insert into public.affiliate_reliability_snapshots (
    source,
    captured_at,
    window_hours,
    standby_total,
    standby_healthy,
    standby_strict_gate,
    active_total,
    active_sec_link,
    active_api_recent,
    active_ml_item_ok,
    open_affiliate_batches,
    trace_report_date,
    trace_total_mismatch,
    overall_status,
    checklist,
    created_at,
    updated_at
  )
  values (
    v_source,
    now(),
    v_window_hours,
    v_standby_total,
    v_standby_healthy,
    v_standby_strict_gate,
    v_active_total,
    v_active_sec_link,
    v_active_api_recent,
    v_active_ml_item_ok,
    v_open_affiliate_batches,
    v_trace_report_date,
    v_trace_total_mismatch,
    v_overall_status,
    v_checklist,
    now(),
    now()
  );

  insert into public.daily_run_reports (
    source,
    report_date,
    run_id,
    checklist,
    overall_status,
    critical_failures,
    created_at
  )
  values (
    'affiliate_reliability_monitor',
    (now() at time zone 'America/Sao_Paulo')::date,
    gen_random_uuid(),
    v_checklist,
    case when v_overall_status = 'FAIL' then 'FAIL' else 'PASS' end,
    v_critical_failures,
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'source', v_source,
    'window_hours', v_window_hours,
    'overall_status', v_overall_status,
    'critical_failures', v_critical_failures,
    'standby_total', v_standby_total,
    'standby_healthy', v_standby_healthy,
    'standby_strict_gate', v_standby_strict_gate,
    'active_total', v_active_total,
    'active_sec_link', v_active_sec_link,
    'active_api_recent', v_active_api_recent,
    'active_ml_item_ok', v_active_ml_item_ok,
    'open_affiliate_batches', v_open_affiliate_batches,
    'trace_report_date', v_trace_report_date,
    'trace_total_mismatch', v_trace_total_mismatch
  );
end;
$$;

grant execute on function public.capture_affiliate_reliability_snapshot(text, integer)
  to authenticated, service_role;

create or replace function private.invoke_affiliate_reliability_monitor()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.capture_affiliate_reliability_snapshot('cron', 48);
exception
  when others then
    raise notice 'invoke_affiliate_reliability_monitor failed: %', sqlerrm;
end;
$$;

revoke all on function private.invoke_affiliate_reliability_monitor() from public;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'affiliate-reliability-monitor'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'affiliate-reliability-monitor',
    '*/30 * * * *',
    $cron$select private.invoke_affiliate_reliability_monitor();$cron$
  );
end $$;

commit;
