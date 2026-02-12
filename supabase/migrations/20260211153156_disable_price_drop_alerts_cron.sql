do $$
declare
  job_id int;
begin
  select jobid into job_id from cron.job where jobname = 'price-drop-alerts';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end $$;