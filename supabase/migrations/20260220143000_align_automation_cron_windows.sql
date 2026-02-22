-- Align automation schedules to operational windows (UTC):
-- price-check-scheduler: every 20 minutes
-- catalog-ingest: 11:30 UTC (08:30 America/Sao_Paulo)
-- price-sync-report: 12:00 UTC (09:00 America/Sao_Paulo)

do $$
declare
  v_job int;
begin
  -- price-sync queue scheduler
  select jobid into v_job
    from cron.job
   where jobname = 'price-check-scheduler';
  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;

  perform cron.schedule(
    'price-check-scheduler',
    '*/20 * * * *',
    $cron$select private.invoke_price_check_scheduler();$cron$
  );

  -- avoid duplicate legacy scheduler
  select jobid into v_job
    from cron.job
   where jobname = 'price-sync';
  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;

  -- daily catalog growth
  select jobid into v_job
    from cron.job
   where jobname = 'catalog-ingest';
  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;

  perform cron.schedule(
    'catalog-ingest',
    '30 11 * * *',
    $cron$select private.invoke_catalog_ingest();$cron$
  );

  -- daily price sync report
  select jobid into v_job
    from cron.job
   where jobname = 'price-sync-report';
  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;

  perform cron.schedule(
    'price-sync-report',
    '0 12 * * *',
    $cron$select private.invoke_price_sync_report();$cron$
  );
end $$;
