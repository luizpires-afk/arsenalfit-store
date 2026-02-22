-- Read-only automation audit (GO/NO-GO)
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
  select
    max(started_at) as last_run
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
select
  (select json_agg(cron_jobs order by jobname) from cron_jobs) as cron_jobs,
  (select last_run from last_price_sync) as price_sync_last_run,
  (select runs_2h from last_price_sync) as price_sync_runs_last_2h,
  (select last_run from last_ingest) as catalog_ingest_last_run,
  (select last_run_any from last_report) as price_report_last_run_any,
  (select last_run_auto from last_report) as price_report_last_run_auto,
  (select last_run from last_daily_checklist) as daily_checklist_last_run;
