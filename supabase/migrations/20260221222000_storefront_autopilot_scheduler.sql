begin;

create or replace function public.run_storefront_autopilot_now(
  p_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_source text := coalesce(nullif(btrim(p_source), ''), 'manual');
  v_now timestamptz := now();
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_is_service boolean := v_role = 'service_role';
  v_admin uuid := auth.uid();
  v_cleanup jsonb := '{}'::jsonb;
  v_audit jsonb := '{}'::jsonb;
  v_fix jsonb := '{}'::jsonb;
  v_guard jsonb := '{}'::jsonb;
  v_reliability jsonb := '{}'::jsonb;
  v_open_mismatch integer := 0;
  v_active_issues integer := 0;
  v_overall text := 'PASS';
  v_critical_failures integer := 0;
  v_checklist jsonb := '{}'::jsonb;
begin
  if not v_is_service and (v_admin is null or not public.has_role(v_admin, 'admin')) then
    raise exception 'admin_required';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);

  v_cleanup := coalesce(public.cleanup_expired_affiliate_validation_batches(5000), '{}'::jsonb);

  v_audit := coalesce(
    public.run_price_mismatch_audit_service(
      24,
      25,
      20,
      50,
      30,
      false
    ),
    '{}'::jsonb
  );

  v_fix := coalesce(
    public.auto_fix_open_price_mismatch_cases_service(
      500,
      false
    ),
    '{}'::jsonb
  );

  v_guard := coalesce(public.apply_active_coherence_guard_service(3000), '{}'::jsonb);

  v_reliability := coalesce(
    public.capture_affiliate_reliability_snapshot(
      case when v_source = 'cron' then 'cron' else 'on_demand' end,
      48
    ),
    '{}'::jsonb
  );

  select count(*)
    into v_open_mismatch
  from public.price_mismatch_cases c
  where c.status = 'OPEN';

  select count(*)
    into v_active_issues
  from public.products p
  where lower(coalesce(p.marketplace, '')) like 'mercado%'
    and p.removed_at is null
    and lower(coalesce(p.status, '')) = 'active'
    and coalesce(p.is_active, false) = true
    and (
      coalesce(p.data_health_status, 'HEALTHY') <> 'HEALTHY'
      or coalesce(p.price_mismatch_status, 'NONE') = 'OPEN'
      or not public.is_mercadolivre_sec_link(p.affiliate_link)
    );

  if v_open_mismatch > 0 or v_active_issues > 0 then
    v_overall := 'FAIL';
    v_critical_failures := 1;
  end if;

  v_checklist := jsonb_build_object(
    'source', v_source,
    'ran_at', v_now,
    'cleanup', v_cleanup,
    'mismatch_audit', v_audit,
    'mismatch_fix', v_fix,
    'active_guard', v_guard,
    'reliability_snapshot', v_reliability,
    'open_mismatch_after', v_open_mismatch,
    'active_issues_after', v_active_issues
  );

  insert into public.daily_run_reports (
    run_id,
    source,
    report_date,
    checklist,
    overall_status,
    critical_failures,
    created_at
  )
  values (
    gen_random_uuid(),
    'storefront_autopilot',
    (now() at time zone 'America/Sao_Paulo')::date,
    v_checklist,
    v_overall,
    v_critical_failures,
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'source', v_source,
    'overall_status', v_overall,
    'open_mismatch_after', v_open_mismatch,
    'active_issues_after', v_active_issues,
    'cleanup', v_cleanup,
    'mismatch_audit', v_audit,
    'mismatch_fix', v_fix,
    'active_guard', v_guard,
    'reliability_snapshot', v_reliability
  );
end;
$$;

grant execute on function public.run_storefront_autopilot_now(text)
  to authenticated, service_role;

create or replace function private.invoke_storefront_autopilot()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.run_storefront_autopilot_now('cron');
exception
  when others then
    raise notice 'invoke_storefront_autopilot failed: %', sqlerrm;
end;
$$;

revoke all on function private.invoke_storefront_autopilot() from public;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'storefront-autopilot'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'storefront-autopilot',
    '7,27,47 * * * *',
    $cron$select private.invoke_storefront_autopilot();$cron$
  );
end $$;

create or replace function public.get_automation_cron_jobs()
returns table (
  jobid bigint,
  jobname text,
  schedule text,
  active boolean
)
language sql
security definer
set search_path = public, cron
as $$
  select
    j.jobid::bigint,
    j.jobname::text,
    j.schedule::text,
    j.active::boolean
  from cron.job j
  where j.jobname in (
    'price-check-scheduler',
    'catalog-ingest',
    'price-sync-report',
    'affiliate-reliability-monitor',
    'affiliate-validation-batch-hygiene',
    'storefront-autopilot'
  )
  order by j.jobname;
$$;

revoke all on function public.get_automation_cron_jobs() from public;
grant execute on function public.get_automation_cron_jobs() to authenticated, service_role;

create or replace function public.get_automation_audit_summary()
returns jsonb
language sql
security definer
set search_path = public, cron
as $$
with cron_jobs as (
  select jobname, schedule, active
  from cron.job
  where jobname in (
    'price-check-scheduler',
    'catalog-ingest',
    'price-sync-report',
    'affiliate-reliability-monitor',
    'affiliate-validation-batch-hygiene',
    'storefront-autopilot'
  )
),
last_price_sync as (
  select
    max(started_at) as last_run,
    count(*) filter (where started_at > now() - interval '2 hours') as runs_2h
  from public.price_sync_runs
),
last_ingest as (
  select max(started_at) as last_run
  from public.catalog_ingest_runs
  where source in ('daily_catalog_growth', 'daily_import')
),
last_report as (
  select
    max(sent_at) as last_run_any,
    max(sent_at) filter (where source = 'price_sync_report') as last_run_auto
  from public.price_sync_reports
),
last_reliability as (
  select max(captured_at) as last_run
  from public.affiliate_reliability_snapshots
),
last_autopilot as (
  select max(created_at) as last_run
  from public.daily_run_reports
  where source = 'storefront_autopilot'
),
last_daily_checklist as (
  select max(created_at) as last_run
  from public.daily_run_reports
)
select jsonb_build_object(
  'cron', coalesce((select jsonb_agg(to_jsonb(cron_jobs) order by cron_jobs.jobname) from cron_jobs), '[]'::jsonb),
  'price_sync_last_run', (select last_run from last_price_sync),
  'price_sync_runs_last_2h', (select runs_2h from last_price_sync),
  'catalog_ingest_last_run', (select last_run from last_ingest),
  'price_report_last_run_any', (select last_run_any from last_report),
  'price_report_last_run_auto', (select last_run_auto from last_report),
  'affiliate_reliability_last_run', (select last_run from last_reliability),
  'storefront_autopilot_last_run', (select last_run from last_autopilot),
  'daily_checklist_last_run', (select last_run from last_daily_checklist)
);
$$;

revoke all on function public.get_automation_audit_summary() from public;
grant execute on function public.get_automation_audit_summary() to authenticated, service_role;

commit;
