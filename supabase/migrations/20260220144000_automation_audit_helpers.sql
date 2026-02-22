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
  where j.jobname in ('price-check-scheduler', 'catalog-ingest', 'price-sync-report', 'price-sync')
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
  where jobname in ('price-check-scheduler', 'catalog-ingest', 'price-sync-report', 'price-sync')
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
  'daily_checklist_last_run', (select last_run from last_daily_checklist)
);
$$;

revoke all on function public.get_automation_audit_summary() from public;
grant execute on function public.get_automation_audit_summary() to authenticated, service_role;
