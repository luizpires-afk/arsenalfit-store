do $$
declare
  v_job_id bigint;
begin
  select jobid
    into v_job_id
    from cron.job
   where jobname = 'price-sync'
   limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end $$;
