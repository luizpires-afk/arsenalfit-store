do $$
declare
  sync_schedule text;
  current_schedule text;
  schedule_to_use text;
  job_id int;
begin
  select schedule into sync_schedule
  from cron.job
  where jobname = 'price-sync'
  limit 1;

  select schedule into current_schedule
  from cron.job
  where jobname = 'price-drop-alerts'
  limit 1;

  if sync_schedule is not null then
    schedule_to_use := sync_schedule;
  elsif current_schedule is not null then
    schedule_to_use := current_schedule;
  else
    schedule_to_use := '0 */6 * * *';
  end if;

  if current_schedule is not null then
    select jobid into job_id from cron.job where jobname = 'price-drop-alerts';
    if job_id is not null then
      perform cron.unschedule(job_id);
    end if;
  end if;

  perform cron.schedule(
    'price-drop-alerts',
    schedule_to_use,
    $cron$select private.invoke_price_drop_alerts();$cron$
  );
end $$;
