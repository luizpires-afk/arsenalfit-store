do $$
declare
  v_job_id bigint;
begin
  -- Remove qualquer job legado para evitar execução duplicada.
  for v_job_id in
    select jobid
    from cron.job
    where jobname in ('price-check-scheduler', 'price-sync', 'catalog-ingest', 'price-sync-report')
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  -- Price checks contínuos via scheduler de fila.
  perform cron.schedule(
    'price-check-scheduler',
    '*/20 * * * *',
    $cron$select private.invoke_price_check_scheduler();$cron$
  );

  -- Import diário (08:30 America/Sao_Paulo = 11:30 UTC).
  perform cron.schedule(
    'catalog-ingest',
    '30 11 * * *',
    $cron$select private.invoke_catalog_ingest();$cron$
  );

  -- Relatório diário (09:00 America/Sao_Paulo = 12:00 UTC).
  perform cron.schedule(
    'price-sync-report',
    '0 12 * * *',
    $cron$select private.invoke_price_sync_report();$cron$
  );
end $$;
