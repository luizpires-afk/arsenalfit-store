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
  v_api_confirm_window interval := interval '24 hours';
  v_fallback_confirm_window interval := interval '24 hours';
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
    ),
    last_api_base as (
      select
        e.product_id,
        max(e.created_at) filter (
          where e.final_price_source in ('API_BASE', 'API_PIX')
            and e.event_status in ('updated', 'frozen')
        ) as last_api_base_at
      from public.price_check_events e
      where e.created_at >= (v_now - v_api_confirm_window)
      group by e.product_id
    ),
    last_fallback as (
      select
        e.product_id,
        max(e.created_at) filter (
          where lower(coalesce(e.final_price_source, '')) in ('catalog', 'scraper', 'catalog_ingest')
            and e.event_status in ('updated', 'frozen')
        ) as last_fallback_at
      from public.price_check_events e
      where e.created_at >= (v_now - v_fallback_confirm_window)
      group by e.product_id
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
      p.last_price_source,
      p.last_price_verified_at,
      l.last_api_base_at,
      f.last_fallback_at,
      public.extract_ml_item_id_from_url(p.affiliate_link) as affiliate_ml_item_id,
      case
        when coalesce(p.data_health_status, 'HEALTHY') <> 'HEALTHY' then 'data_health_not_healthy'
        when coalesce(p.price_mismatch_status, 'NONE') = 'OPEN' then 'price_mismatch_open'
        when om.product_id is not null then 'open_mismatch_case'
        when public.normalize_ml_external_id(p.ml_item_id) is null then 'missing_ml_item_id'
        when public.extract_ml_item_id_from_url(p.affiliate_link) is not null
          and public.extract_ml_item_id_from_url(p.affiliate_link) is distinct from public.normalize_ml_external_id(p.ml_item_id)
          then 'affiliate_ml_item_mismatch'
        when public.normalize_ml_external_id(p.ml_item_id) is distinct from public.resolve_product_ml_item_id(p.external_id, p.source_url, p.affiliate_link)
          then 'ml_item_binding_mismatch'
        when p.canonical_offer_url is not null
          and public.normalize_ml_permalink(p.canonical_offer_url) is distinct from public.resolve_ml_canonical_offer_url(p.source_url, p.affiliate_link, p.ml_item_id)
          then 'canonical_offer_mismatch'
        when l.last_api_base_at is null
          and not (
            public.is_mercadolivre_sec_link(p.affiliate_link)
            and (
              f.last_fallback_at is not null
              or (
                p.last_price_verified_at is not null
                and p.last_price_verified_at >= (v_now - v_fallback_confirm_window)
                and lower(coalesce(p.last_price_source, '')) in ('catalog', 'scraper', 'catalog_ingest', 'api_base', 'api_pix')
              )
            )
          )
          then 'no_recent_api_base_confirmation'
        else null
      end as fail_reason
    from public.products p
    left join open_mismatch om on om.product_id = p.id
    left join last_api_base l on l.product_id = p.id
    left join last_fallback f on f.product_id = p.id
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
          'affiliate_link', rec.affiliate_link,
          'affiliate_ml_item_id', rec.affiliate_ml_item_id,
          'fail_reason', rec.fail_reason,
          'last_api_base_at', rec.last_api_base_at,
          'last_fallback_at', rec.last_fallback_at,
          'last_price_source', rec.last_price_source,
          'last_price_verified_at', rec.last_price_verified_at,
          'at', v_now
        )
      );
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'seen', v_seen,
    'moved_to_standby', v_moved,
    'api_confirm_window_hours', 24,
    'fallback_confirm_window_hours', 24,
    'affiliate_check_mode', 'api_or_recent_fallback_with_product_timestamp'
  );
end;
$$;

commit;
