begin;

create or replace function public.recheck_suspect_prices_now(
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
  v_admin uuid := auth.uid();
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_queued integer := 0;
  v_scheduler_triggered boolean := false;
  rec record;
begin
  if not v_is_service and (v_admin is null or not public.has_role(v_admin, 'admin')) then
    raise exception 'admin_required';
  end if;

  for rec in
    select p.id
    from public.products p
    where lower(coalesce(p.marketplace, '')) like 'mercado%'
      and p.removed_at is null
      and p.data_health_status in ('SUSPECT_PRICE', 'PRICE_MISMATCH')
    order by coalesce(p.last_health_check_at, p.updated_at, p.created_at) asc
    limit v_limit
  loop
    if public.enqueue_price_check_refresh(rec.id, true, 'admin_recheck_suspect') then
      v_queued := v_queued + 1;
    end if;
  end loop;

  if v_queued > 0 then
    begin
      perform private.invoke_price_check_scheduler();
      v_scheduler_triggered := true;
    exception
      when others then
        v_scheduler_triggered := false;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'queued', v_queued,
    'scheduler_triggered', v_scheduler_triggered
  );
end;
$$;

grant execute on function public.recheck_suspect_prices_now(integer) to authenticated, service_role;

commit;
