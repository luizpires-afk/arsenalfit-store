do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'price-sync'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end $$;
