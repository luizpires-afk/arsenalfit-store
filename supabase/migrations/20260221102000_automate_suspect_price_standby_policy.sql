begin;

create or replace function public.apply_suspect_price_standby_policy(
  p_cycle_limit integer default 3,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle_limit integer := greatest(coalesce(p_cycle_limit, 3), 1);
  v_limit integer := greatest(least(coalesce(p_limit, 500), 2000), 1);
  v_now timestamptz := now();
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_admin uuid := auth.uid();
  v_seen integer := 0;
  v_cycle_updates integer := 0;
  v_moved integer := 0;
  v_resets integer := 0;
  rec record;
begin
  if not v_is_service and (v_admin is null or not public.has_role(v_admin, 'admin')) then
    raise exception 'admin_required';
  end if;

  for rec in
    select
      p.id,
      p.price_pending_count,
      p.price_pending_seen_at
    from public.products p
    where lower(coalesce(p.marketplace, '')) like 'mercado%'
      and p.removed_at is null
      and coalesce(p.is_active, false) = true
      and lower(coalesce(p.status, '')) = 'active'
      and p.data_health_status = 'SUSPECT_PRICE'
    order by coalesce(p.last_health_check_at, p.updated_at, p.created_at) asc
    limit v_limit
  loop
    v_seen := v_seen + 1;

    update public.products
      set price_pending_count = greatest(coalesce(rec.price_pending_count, 0), 0) + 1,
          price_pending_seen_at = coalesce(rec.price_pending_seen_at, v_now),
          last_health_check_at = v_now,
          updated_at = v_now
    where id = rec.id;

    v_cycle_updates := v_cycle_updates + 1;

    update public.products
      set status = 'standby',
          is_active = false,
          data_health_status = 'NEEDS_REVIEW',
          deactivation_reason = 'suspect_price_consecutive',
          auto_disabled_reason = 'suspect_price_consecutive',
          auto_disabled_at = v_now,
          last_health_check_at = v_now,
          updated_at = v_now
    where id = rec.id
      and greatest(coalesce(price_pending_count, 0), 0) >= v_cycle_limit;

    if found then
      v_moved := v_moved + 1;
    end if;
  end loop;

  update public.products
    set price_pending_count = 0,
        price_pending_seen_at = null,
        updated_at = v_now
  where lower(coalesce(marketplace, '')) like 'mercado%'
    and removed_at is null
    and greatest(coalesce(price_pending_count, 0), 0) > 0
    and coalesce(data_health_status, '') <> 'SUSPECT_PRICE';

  get diagnostics v_resets = row_count;

  return jsonb_build_object(
    'ok', true,
    'cycle_limit', v_cycle_limit,
    'seen', v_seen,
    'cycle_updates', v_cycle_updates,
    'moved_to_standby', v_moved,
    'resets', v_resets
  );
end;
$$;

create or replace function private.invoke_suspect_price_automation()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  perform public.recheck_suspect_prices_now_service(300);
  perform public.apply_suspect_price_standby_policy(3, 500);
exception
  when others then
    raise notice 'invoke_suspect_price_automation failed: %', sqlerrm;
end;
$$;

revoke all on function private.invoke_suspect_price_automation() from public;

grant execute on function public.apply_suspect_price_standby_policy(integer, integer)
  to authenticated, service_role;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'suspect-price-automation'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'suspect-price-automation',
    '5,25,45 * * * *',
    $cron$select private.invoke_suspect_price_automation();$cron$
  );
end $$;

commit;
