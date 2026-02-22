begin;

create or replace function public.apply_active_coherence_guard(
  p_limit integer default 2000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 2000), 10000));
  v_now timestamptz := now();
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_admin uuid := auth.uid();
  v_seen integer := 0;
  v_moved integer := 0;
  rec record;
begin
  if not v_is_service and (v_admin is null or not public.has_role(v_admin, 'admin')) then
    raise exception 'admin_required';
  end if;

  for rec in
    with open_mismatch as (
      select distinct c.product_id
      from public.price_mismatch_cases c
      where c.status = 'OPEN'
    )
    select
      p.id,
      p.name,
      p.status,
      p.is_active,
      p.data_health_status,
      p.deactivation_reason,
      p.ml_item_id,
      p.external_id,
      p.source_url,
      p.affiliate_link,
      p.price_mismatch_status,
      case
        when coalesce(p.data_health_status, 'HEALTHY') <> 'HEALTHY' then 'data_health_not_healthy'
        when coalesce(p.price_mismatch_status, 'NONE') = 'OPEN' then 'price_mismatch_open'
        when om.product_id is not null then 'open_mismatch_case'
        when public.normalize_ml_external_id(p.ml_item_id) is null then 'missing_ml_item_id'
        when public.normalize_ml_external_id(p.ml_item_id) is distinct from public.resolve_product_ml_item_id(p.external_id, p.source_url, p.affiliate_link)
          then 'ml_item_binding_mismatch'
        when p.canonical_offer_url is not null
          and public.normalize_ml_permalink(p.canonical_offer_url) is distinct from public.resolve_ml_canonical_offer_url(p.source_url, p.affiliate_link, p.ml_item_id)
          then 'canonical_offer_mismatch'
        else null
      end as fail_reason
    from public.products p
    left join open_mismatch om on om.product_id = p.id
    where lower(coalesce(p.marketplace, '')) like 'mercado%'
      and p.removed_at is null
      and coalesce(p.is_active, false) = true
      and lower(coalesce(p.status, '')) = 'active'
    order by coalesce(p.last_health_check_at, p.updated_at, p.created_at) asc
    limit v_limit
  loop
    v_seen := v_seen + 1;

    if rec.fail_reason is null then
      continue;
    end if;

    update public.products
      set status = 'standby',
          is_active = false,
          data_health_status = 'NEEDS_REVIEW',
          deactivation_reason = 'supervisao_automatica_incoerencia',
          auto_disabled_reason = 'supervisao_automatica_incoerencia',
          auto_disabled_at = v_now,
          last_health_check_at = v_now,
          updated_at = v_now
    where id = rec.id;

    if found then
      v_moved := v_moved + 1;

      insert into public.product_admin_actions (
        product_id,
        admin_user_id,
        action,
        reason,
        note,
        details
      )
      values (
        rec.id,
        v_admin,
        'auto_coherence_guard_move_to_standby',
        'supervisao_automatica_incoerencia',
        rec.fail_reason,
        jsonb_build_object(
          'from_status', rec.status,
          'from_is_active', rec.is_active,
          'from_health', rec.data_health_status,
          'fail_reason', rec.fail_reason,
          'at', v_now
        )
      );
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'seen', v_seen,
    'moved_to_standby', v_moved
  );
end;
$$;

create or replace function public.apply_active_coherence_guard_service(
  p_limit integer default 2000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return public.apply_active_coherence_guard(p_limit);
end;
$$;

create or replace function private.invoke_active_coherence_guard()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  perform public.run_price_mismatch_audit_service(
    24,
    25,
    20,
    50,
    30,
    false
  );

  perform public.apply_active_coherence_guard_service(2000);
exception
  when others then
    raise notice 'invoke_active_coherence_guard failed: %', sqlerrm;
end;
$$;

revoke all on function private.invoke_active_coherence_guard() from public;

grant execute on function public.apply_active_coherence_guard(integer)
  to authenticated, service_role;
grant execute on function public.apply_active_coherence_guard_service(integer)
  to authenticated, service_role;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'active-coherence-guard'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'active-coherence-guard',
    '12,32,52 * * * *',
    $cron$select private.invoke_active_coherence_guard();$cron$
  );
end $$;

commit;
