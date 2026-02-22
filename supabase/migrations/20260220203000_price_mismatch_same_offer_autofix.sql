begin;

create or replace function public.run_price_mismatch_audit(
  p_lookback_hours integer default 24,
  p_warn_pct numeric default 25,
  p_warn_abs numeric default 20,
  p_critical_pct numeric default 50,
  p_critical_abs numeric default 30,
  p_apply_critical_policy boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_admin uuid := auth.uid();
  v_processed integer := 0;
  v_opened integer := 0;
  v_critical integer := 0;
  v_lookback integer := greatest(coalesce(p_lookback_hours, 24), 1);
  v_warn_pct numeric := greatest(coalesce(p_warn_pct, 25), 0);
  v_warn_abs numeric := greatest(coalesce(p_warn_abs, 20), 0);
  v_critical_pct numeric := greatest(coalesce(p_critical_pct, 50), 0);
  v_critical_abs numeric := greatest(coalesce(p_critical_abs, 30), 0);
  v_expected numeric;
  v_source text;
  v_delta_abs numeric;
  v_delta_pct numeric;
  v_is_critical boolean;
  rec record;
begin
  if not v_is_service and (v_admin is null or not public.has_role(v_admin, 'admin')) then
    raise exception 'admin_required';
  end if;

  for rec in
    with latest_anomaly as (
      select distinct on (a.product_id)
        a.product_id,
        a.detected_at,
        a.note,
        a.price_from_catalog,
        a.price_from_item
      from public.price_sync_anomalies a
      where a.detected_at >= (v_now - make_interval(hours => v_lookback))
      order by a.product_id, a.detected_at desc
    )
    select
      la.product_id,
      la.detected_at,
      la.note,
      la.price_from_catalog,
      la.price_from_item,
      p.price as site_price
    from latest_anomaly la
    join public.products p on p.id = la.product_id
    where lower(coalesce(p.marketplace, '')) like 'mercado%'
      and p.removed_at is null
      and coalesce(p.price, 0) > 0
      and (
        coalesce(la.price_from_catalog, 0) > 0
        or coalesce(la.price_from_item, 0) > 0
      )
  loop
    v_processed := v_processed + 1;

    if coalesce(rec.price_from_item, 0) > 0 then
      v_expected := rec.price_from_item;
      v_source := 'item';
    elsif coalesce(rec.price_from_catalog, 0) > 0 then
      v_expected := rec.price_from_catalog;
      v_source := 'catalog';
    else
      continue;
    end if;

    v_delta_abs := abs(rec.site_price - v_expected);
    v_delta_pct := case
      when greatest(rec.site_price, v_expected) <= 0 then 0
      else (v_delta_abs / greatest(rec.site_price, v_expected)) * 100
    end;

    if v_delta_pct >= v_warn_pct or v_delta_abs >= v_warn_abs then
      v_is_critical := v_delta_pct >= v_critical_pct or v_delta_abs >= v_critical_abs;

      update public.price_mismatch_cases
        set site_price = rec.site_price,
            ml_price = v_expected,
            delta_abs = v_delta_abs,
            delta_pct = v_delta_pct,
            source = v_source,
            reason = coalesce(rec.note, 'price_mismatch'),
            last_audit_at = v_now,
            updated_at = v_now,
            metadata = jsonb_build_object(
              'price_from_catalog', rec.price_from_catalog,
              'price_from_item', rec.price_from_item,
              'detected_at', rec.detected_at,
              'critical', v_is_critical
            )
      where product_id = rec.product_id
        and status = 'OPEN';

      if not found then
        insert into public.price_mismatch_cases (
          product_id,
          site_price,
          ml_price,
          delta_abs,
          delta_pct,
          status,
          source,
          reason,
          last_audit_at,
          metadata
        )
        values (
          rec.product_id,
          rec.site_price,
          v_expected,
          v_delta_abs,
          v_delta_pct,
          'OPEN',
          v_source,
          coalesce(rec.note, 'price_mismatch'),
          v_now,
          jsonb_build_object(
            'price_from_catalog', rec.price_from_catalog,
            'price_from_item', rec.price_from_item,
            'detected_at', rec.detected_at,
            'critical', v_is_critical
          )
        );
        v_opened := v_opened + 1;
      end if;

      update public.products
        set data_health_status = 'PRICE_MISMATCH',
            price_mismatch_status = 'OPEN',
            expected_price = v_expected,
            site_price_snapshot = rec.site_price,
            last_price_audit_at = v_now,
            price_mismatch_reason = coalesce(rec.note, 'price_mismatch'),
            last_health_check_at = v_now,
            status = case
              when p_apply_critical_policy and v_is_critical then 'standby'
              else status
            end,
            is_active = case
              when p_apply_critical_policy and v_is_critical then false
              else is_active
            end,
            deactivation_reason = case
              when p_apply_critical_policy and v_is_critical then 'price_mismatch_critical'
              else deactivation_reason
            end,
            auto_disabled_reason = case
              when p_apply_critical_policy and v_is_critical then 'price_mismatch_critical'
              else auto_disabled_reason
            end,
            auto_disabled_at = case
              when p_apply_critical_policy and v_is_critical then v_now
              else auto_disabled_at
            end,
            updated_at = v_now
      where id = rec.product_id;

      if p_apply_critical_policy and v_is_critical then
        v_critical := v_critical + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'processed', v_processed,
    'opened', v_opened,
    'critical', v_critical
  );
end;
$$;

create or replace function public.auto_fix_open_price_mismatch_cases(
  p_limit integer default 50,
  p_source_only_item boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_admin uuid := auth.uid();
  v_limit integer := greatest(coalesce(p_limit, 50), 1);
  v_total integer := 0;
  v_resolved integer := 0;
  v_reactivated integer := 0;
  v_skipped integer := 0;
  v_reactivated_now boolean;
  rec record;
begin
  if not v_is_service and (v_admin is null or not public.has_role(v_admin, 'admin')) then
    raise exception 'admin_required';
  end if;

  for rec in
    select
      c.id as case_id,
      c.product_id,
      c.ml_price,
      c.source,
      p.status as product_status,
      p.is_active,
      p.price as current_price,
      p.affiliate_link,
      p.deactivation_reason,
      p.auto_disabled_reason
    from public.price_mismatch_cases c
    join public.products p on p.id = c.product_id
    where c.status = 'OPEN'
      and p.removed_at is null
      and coalesce(c.ml_price, 0) > 0
      and (not p_source_only_item or c.source = 'item')
    order by c.delta_pct desc nulls last, c.updated_at asc
    limit v_limit
  loop
    v_total := v_total + 1;
    v_reactivated_now := false;

    update public.products
      set previous_price = case
            when coalesce(price, 0) > rec.ml_price then price
            else previous_price
          end,
          previous_price_source = case
            when coalesce(price, 0) > rec.ml_price then 'HISTORY'
            else previous_price_source
          end,
          previous_price_expires_at = case
            when coalesce(price, 0) > rec.ml_price then (v_now + interval '48 hours')
            else previous_price_expires_at
          end,
          price = rec.ml_price,
          data_health_status = 'HEALTHY',
          price_mismatch_status = 'RESOLVED',
          expected_price = null,
          site_price_snapshot = null,
          last_price_audit_at = v_now,
          price_mismatch_reason = null,
          price_mismatch_resolved_at = v_now,
          status = case
            when coalesce(is_active, false) = false
              and lower(coalesce(status, '')) in ('standby', 'needs_review', 'pending', 'pending_validacao', 'pending_validation')
              and lower(coalesce(deactivation_reason, '')) in ('price_mismatch_critical', 'price_mismatch_review')
              and public.is_mercadolivre_sec_link(affiliate_link)
            then 'active'
            else status
          end,
          is_active = case
            when coalesce(is_active, false) = false
              and lower(coalesce(status, '')) in ('standby', 'needs_review', 'pending', 'pending_validacao', 'pending_validation')
              and lower(coalesce(deactivation_reason, '')) in ('price_mismatch_critical', 'price_mismatch_review')
              and public.is_mercadolivre_sec_link(affiliate_link)
            then true
            else is_active
          end,
          deactivation_reason = case
            when coalesce(is_active, false) = false
              and lower(coalesce(status, '')) in ('standby', 'needs_review', 'pending', 'pending_validacao', 'pending_validation')
              and lower(coalesce(deactivation_reason, '')) in ('price_mismatch_critical', 'price_mismatch_review')
              and public.is_mercadolivre_sec_link(affiliate_link)
            then null
            else deactivation_reason
          end,
          auto_disabled_reason = case
            when coalesce(is_active, false) = false
              and lower(coalesce(status, '')) in ('standby', 'needs_review', 'pending', 'pending_validacao', 'pending_validation')
              and lower(coalesce(auto_disabled_reason, '')) = 'price_mismatch_critical'
              and public.is_mercadolivre_sec_link(affiliate_link)
            then null
            else auto_disabled_reason
          end,
          auto_disabled_at = case
            when coalesce(is_active, false) = false
              and lower(coalesce(status, '')) in ('standby', 'needs_review', 'pending', 'pending_validacao', 'pending_validation')
              and lower(coalesce(auto_disabled_reason, '')) = 'price_mismatch_critical'
              and public.is_mercadolivre_sec_link(affiliate_link)
            then null
            else auto_disabled_at
          end,
          last_health_check_at = v_now,
          updated_at = v_now
    where id = rec.product_id;

    select coalesce(p.is_active, false) = true and lower(coalesce(p.status, '')) = 'active'
    into v_reactivated_now
    from public.products p
    where p.id = rec.product_id;

    update public.price_mismatch_cases
      set status = 'RESOLVED',
          resolved_at = v_now,
          resolved_by = coalesce(v_admin::text, 'service_role'),
          resolution_note = 'auto_apply_ml_price',
          updated_at = v_now
    where id = rec.case_id;

    insert into public.product_admin_actions (
      product_id,
      admin_user_id,
      action,
      reason,
      note,
      details
    )
    values (
      rec.product_id,
      v_admin,
      'price_mismatch_auto_fix',
      'auto_apply_ml_price',
      null,
      jsonb_build_object(
        'case_id', rec.case_id,
        'source', rec.source,
        'old_price', rec.current_price,
        'new_price', rec.ml_price,
        'reactivated', v_reactivated_now
      )
    );

    v_resolved := v_resolved + 1;
    if v_reactivated_now then
      v_reactivated := v_reactivated + 1;
    end if;
  end loop;

  v_skipped := greatest(v_total - v_resolved, 0);

  return jsonb_build_object(
    'ok', true,
    'processed', v_total,
    'resolved', v_resolved,
    'reactivated', v_reactivated,
    'skipped', v_skipped
  );
end;
$$;

create or replace function public.admin_resolve_price_mismatch_case(
  p_case_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.price_mismatch_cases%rowtype;
  v_product public.products%rowtype;
  v_action text := upper(coalesce(nullif(btrim(p_action), ''), ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_now timestamptz := now();
  v_admin uuid := auth.uid();
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_recheck boolean := false;
begin
  if not v_is_service and (v_admin is null or not public.has_role(v_admin, 'admin')) then
    raise exception 'admin_required';
  end if;

  if v_action not in ('RECHECK_NOW', 'APPLY_ML_PRICE', 'MARK_RESOLVED', 'MOVE_TO_STANDBY') then
    raise exception 'invalid_action';
  end if;

  select * into v_case
  from public.price_mismatch_cases
  where id = p_case_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'case_not_found');
  end if;

  select * into v_product
  from public.products
  where id = v_case.product_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'product_not_found');
  end if;

  if v_action = 'RECHECK_NOW' then
    v_recheck := public.enqueue_price_check_refresh(v_case.product_id, true, 'admin_mismatch_recheck');
  elsif v_action = 'APPLY_ML_PRICE' then
    update public.products
      set previous_price = case
            when coalesce(v_product.price, 0) > v_case.ml_price then v_product.price
            else previous_price
          end,
          previous_price_source = case
            when coalesce(v_product.price, 0) > v_case.ml_price then 'HISTORY'
            else previous_price_source
          end,
          previous_price_expires_at = case
            when coalesce(v_product.price, 0) > v_case.ml_price then (v_now + interval '48 hours')
            else previous_price_expires_at
          end,
          price = v_case.ml_price,
          data_health_status = 'HEALTHY',
          price_mismatch_status = 'RESOLVED',
          expected_price = null,
          site_price_snapshot = null,
          last_price_audit_at = v_now,
          price_mismatch_reason = null,
          price_mismatch_resolved_at = v_now,
          status = case
            when coalesce(v_product.is_active, false) = false
              and lower(coalesce(v_product.status, '')) in ('standby', 'needs_review', 'pending', 'pending_validacao', 'pending_validation')
              and lower(coalesce(v_product.deactivation_reason, '')) in ('price_mismatch_critical', 'price_mismatch_review')
              and public.is_mercadolivre_sec_link(v_product.affiliate_link)
            then 'active'
            else status
          end,
          is_active = case
            when coalesce(v_product.is_active, false) = false
              and lower(coalesce(v_product.status, '')) in ('standby', 'needs_review', 'pending', 'pending_validacao', 'pending_validation')
              and lower(coalesce(v_product.deactivation_reason, '')) in ('price_mismatch_critical', 'price_mismatch_review')
              and public.is_mercadolivre_sec_link(v_product.affiliate_link)
            then true
            else is_active
          end,
          deactivation_reason = case
            when coalesce(v_product.is_active, false) = false
              and lower(coalesce(v_product.status, '')) in ('standby', 'needs_review', 'pending', 'pending_validacao', 'pending_validation')
              and lower(coalesce(v_product.deactivation_reason, '')) in ('price_mismatch_critical', 'price_mismatch_review')
              and public.is_mercadolivre_sec_link(v_product.affiliate_link)
            then null
            else deactivation_reason
          end,
          auto_disabled_reason = case
            when coalesce(v_product.is_active, false) = false
              and lower(coalesce(v_product.status, '')) in ('standby', 'needs_review', 'pending', 'pending_validacao', 'pending_validation')
              and lower(coalesce(v_product.auto_disabled_reason, '')) = 'price_mismatch_critical'
              and public.is_mercadolivre_sec_link(v_product.affiliate_link)
            then null
            else auto_disabled_reason
          end,
          auto_disabled_at = case
            when coalesce(v_product.is_active, false) = false
              and lower(coalesce(v_product.status, '')) in ('standby', 'needs_review', 'pending', 'pending_validacao', 'pending_validation')
              and lower(coalesce(v_product.auto_disabled_reason, '')) = 'price_mismatch_critical'
              and public.is_mercadolivre_sec_link(v_product.affiliate_link)
            then null
            else auto_disabled_at
          end,
          last_health_check_at = v_now,
          updated_at = v_now
    where id = v_case.product_id;

    update public.price_mismatch_cases
      set status = 'RESOLVED',
          resolved_at = v_now,
          resolved_by = coalesce(v_admin::text, 'service_role'),
          resolution_note = coalesce(v_note, 'apply_ml_price'),
          updated_at = v_now
    where id = v_case.id;
  elsif v_action = 'MARK_RESOLVED' then
    update public.price_mismatch_cases
      set status = 'RESOLVED',
          resolved_at = v_now,
          resolved_by = coalesce(v_admin::text, 'service_role'),
          resolution_note = coalesce(v_note, 'mark_resolved'),
          updated_at = v_now
    where id = v_case.id;

    if not exists (
      select 1
      from public.price_mismatch_cases c
      where c.product_id = v_case.product_id
        and c.status = 'OPEN'
        and c.id <> v_case.id
    ) then
      update public.products
        set price_mismatch_status = 'RESOLVED',
            price_mismatch_resolved_at = v_now,
            expected_price = null,
            site_price_snapshot = null,
            last_price_audit_at = v_now,
            price_mismatch_reason = null,
            status = case
              when coalesce(v_product.is_active, false) = false
                and lower(coalesce(v_product.status, '')) in ('standby', 'needs_review', 'pending', 'pending_validacao', 'pending_validation')
                and lower(coalesce(v_product.deactivation_reason, '')) in ('price_mismatch_critical', 'price_mismatch_review')
                and public.is_mercadolivre_sec_link(v_product.affiliate_link)
              then 'active'
              else status
            end,
            is_active = case
              when coalesce(v_product.is_active, false) = false
                and lower(coalesce(v_product.status, '')) in ('standby', 'needs_review', 'pending', 'pending_validacao', 'pending_validation')
                and lower(coalesce(v_product.deactivation_reason, '')) in ('price_mismatch_critical', 'price_mismatch_review')
                and public.is_mercadolivre_sec_link(v_product.affiliate_link)
              then true
              else is_active
            end,
            deactivation_reason = case
              when coalesce(v_product.is_active, false) = false
                and lower(coalesce(v_product.status, '')) in ('standby', 'needs_review', 'pending', 'pending_validacao', 'pending_validation')
                and lower(coalesce(v_product.deactivation_reason, '')) in ('price_mismatch_critical', 'price_mismatch_review')
                and public.is_mercadolivre_sec_link(v_product.affiliate_link)
              then null
              else deactivation_reason
            end,
            auto_disabled_reason = case
              when coalesce(v_product.is_active, false) = false
                and lower(coalesce(v_product.status, '')) in ('standby', 'needs_review', 'pending', 'pending_validacao', 'pending_validation')
                and lower(coalesce(v_product.auto_disabled_reason, '')) = 'price_mismatch_critical'
                and public.is_mercadolivre_sec_link(v_product.affiliate_link)
              then null
              else auto_disabled_reason
            end,
            auto_disabled_at = case
              when coalesce(v_product.is_active, false) = false
                and lower(coalesce(v_product.status, '')) in ('standby', 'needs_review', 'pending', 'pending_validacao', 'pending_validation')
                and lower(coalesce(v_product.auto_disabled_reason, '')) = 'price_mismatch_critical'
                and public.is_mercadolivre_sec_link(v_product.affiliate_link)
              then null
              else auto_disabled_at
            end,
            data_health_status = case
              when data_health_status = 'PRICE_MISMATCH' then 'HEALTHY'
              else data_health_status
            end,
            last_health_check_at = v_now,
            updated_at = v_now
      where id = v_case.product_id;
    end if;
  elsif v_action = 'MOVE_TO_STANDBY' then
    update public.products
      set status = 'standby',
          is_active = false,
          data_health_status = 'NEEDS_REVIEW',
          price_mismatch_status = 'OPEN',
          expected_price = v_case.ml_price,
          site_price_snapshot = v_product.price,
          price_mismatch_reason = coalesce(v_note, 'manual_mismatch_standby'),
          deactivation_reason = 'price_mismatch_review',
          last_price_audit_at = v_now,
          last_health_check_at = v_now,
          updated_at = v_now
    where id = v_case.product_id;
  end if;

  insert into public.product_admin_actions (
    product_id,
    admin_user_id,
    action,
    reason,
    note,
    details
  )
  values (
    v_case.product_id,
    v_admin,
    'price_mismatch_case_action',
    lower(v_action),
    v_note,
    jsonb_build_object(
      'case_id', v_case.id,
      'site_price', v_case.site_price,
      'ml_price', v_case.ml_price,
      'recheck_enqueued', v_recheck
    )
  );

  return jsonb_build_object(
    'ok', true,
    'action', lower(v_action),
    'case_id', v_case.id,
    'product_id', v_case.product_id,
    'recheck_enqueued', v_recheck
  );
end;
$$;

create or replace function public.get_admin_health_dashboard(
  p_lookback_hours integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  v_now timestamptz := now();
  v_since timestamptz := now() - make_interval(hours => greatest(coalesce(p_lookback_hours, 24), 1));
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_admin uuid := auth.uid();
  v_cron jsonb := '[]'::jsonb;
  v_price_sync_last_run timestamptz;
  v_price_sync_runs_2h integer := 0;
  v_ingest_last_run timestamptz;
  v_ingest_last_inserted integer := 0;
  v_ingest_last_updated integer := 0;
  v_report_last_run timestamptz;
  v_report_delivery_status text;
  v_report_last_error text;
  v_standby_count integer := 0;
  v_active_count integer := 0;
  v_blocked_count integer := 0;
  v_active_without_affiliate integer := 0;
  v_invalid_affiliate_count integer := 0;
  v_invalid_not_permitted_count integer := 0;
  v_suspect_count integer := 0;
  v_mismatch_open_count integer := 0;
  v_mismatch_24h integer := 0;
  v_pix_count integer := 0;
  v_promo_count integer := 0;
  v_pix_present_count integer := 0;
  v_pix_missing_from_api_count integer := 0;
  v_pix_rejected_by_policy_count integer := 0;
  v_go_no_go text := 'OK';
  v_go_reason text := 'Automacao e catalogo dentro do esperado.';
  v_affiliate_errors jsonb := '[]'::jsonb;
  v_mismatch_top jsonb := '[]'::jsonb;
begin
  if not v_is_service and (v_admin is null or not public.has_role(v_admin, 'admin')) then
    raise exception 'admin_required';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'jobname', j.jobname,
        'schedule', j.schedule,
        'active', j.active
      )
      order by j.jobname
    ),
    '[]'::jsonb
  )
  into v_cron
  from cron.job j
  where j.jobname in ('price-check-scheduler', 'catalog-ingest', 'price-sync-report');

  select max(started_at),
         count(*) filter (where started_at >= (v_now - interval '2 hours'))
  into v_price_sync_last_run, v_price_sync_runs_2h
  from public.price_sync_runs;

  select started_at, inserted_products, updated_products
  into v_ingest_last_run, v_ingest_last_inserted, v_ingest_last_updated
  from public.catalog_ingest_runs
  order by started_at desc
  limit 1;

  select coalesce(sent_at, created_at), delivery_status, last_error
  into v_report_last_run, v_report_delivery_status, v_report_last_error
  from public.price_sync_reports
  where source = 'price_sync_report'
  order by coalesce(sent_at, created_at) desc
  limit 1;

  select
    count(*) filter (
      where lower(coalesce(marketplace, '')) like 'mercado%'
        and removed_at is null
        and (
          lower(coalesce(status, '')) in ('standby', 'pending', 'pending_validacao', 'pending_validation')
          or coalesce(is_active, false) = false
        )
    ),
    count(*) filter (
      where lower(coalesce(marketplace, '')) like 'mercado%'
        and removed_at is null
        and coalesce(is_active, false) = true
        and lower(coalesce(status, '')) = 'active'
    ),
    count(*) filter (
      where lower(coalesce(marketplace, '')) like 'mercado%'
        and removed_at is null
        and lower(coalesce(auto_disabled_reason, '')) = 'blocked'
    ),
    count(*) filter (
      where lower(coalesce(marketplace, '')) like 'mercado%'
        and removed_at is null
        and coalesce(is_active, false) = true
        and lower(coalesce(status, '')) = 'active'
        and not public.is_mercadolivre_sec_link(affiliate_link)
    ),
    count(*) filter (
      where lower(coalesce(marketplace, '')) like 'mercado%'
        and removed_at is null
        and affiliate_validation_status like 'INVALID_%'
    ),
    count(*) filter (
      where lower(coalesce(marketplace, '')) like 'mercado%'
        and removed_at is null
        and affiliate_validation_status = 'INVALID_NOT_PERMITTED'
    ),
    count(*) filter (
      where lower(coalesce(marketplace, '')) like 'mercado%'
        and removed_at is null
        and data_health_status = 'SUSPECT_PRICE'
    ),
    count(*) filter (
      where lower(coalesce(marketplace, '')) like 'mercado%'
        and removed_at is null
        and coalesce(pix_price, 0) > 0
    ),
    count(*) filter (
      where lower(coalesce(marketplace, '')) like 'mercado%'
        and removed_at is null
        and (
          (
            coalesce(previous_price, 0) > coalesce(price, 0)
            and (previous_price_expires_at is null or previous_price_expires_at > v_now)
          )
          or (
            coalesce(original_price, 0) > coalesce(price, 0)
            and coalesce(discount_percentage, 0) > 0
          )
        )
    )
  into v_standby_count, v_active_count, v_blocked_count, v_active_without_affiliate,
       v_invalid_affiliate_count, v_invalid_not_permitted_count, v_suspect_count,
       v_pix_count, v_promo_count
  from public.products;

  select count(*),
         count(*) filter (where created_at >= v_since)
  into v_mismatch_open_count, v_mismatch_24h
  from public.price_mismatch_cases
  where status = 'OPEN';

  select
    count(*) filter (where coalesce(e.raw_api_pix, 0) > 0),
    count(*) filter (
      where e.event_status = 'updated'
        and coalesce(e.raw_api_price, 0) > 0
        and coalesce(e.raw_api_pix, 0) <= 0
    ),
    count(*) filter (
      where e.event_status = 'updated'
        and coalesce(e.raw_api_pix, 0) > 0
        and coalesce(e.final_price_source, '') <> 'API_PIX'
    )
  into v_pix_present_count, v_pix_missing_from_api_count, v_pix_rejected_by_policy_count
  from public.price_check_events e
  where e.created_at >= v_since
    and e.created_at <= v_now;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'status', p.status,
        'external_id', p.external_id,
        'affiliate_validation_status', p.affiliate_validation_status,
        'affiliate_validation_error', p.affiliate_validation_error,
        'updated_at', p.updated_at
      )
      order by p.updated_at desc
    ),
    '[]'::jsonb
  )
  into v_affiliate_errors
  from (
    select p.id, p.name, p.status, p.external_id, p.affiliate_validation_status, p.affiliate_validation_error, p.updated_at
    from public.products p
    where lower(coalesce(p.marketplace, '')) like 'mercado%'
      and p.removed_at is null
      and p.affiliate_validation_status like 'INVALID_%'
    order by p.updated_at desc
    limit 10
  ) p;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'product_id', c.product_id,
        'product_name', p.name,
        'site_price', c.site_price,
        'ml_price', c.ml_price,
        'delta_abs', c.delta_abs,
        'delta_pct', c.delta_pct,
        'source', c.source,
        'reason', c.reason,
        'last_audit_at', c.last_audit_at
      )
      order by c.delta_pct desc, c.updated_at desc
    ),
    '[]'::jsonb
  )
  into v_mismatch_top
  from (
    select c.*
    from public.price_mismatch_cases c
    where c.status = 'OPEN'
    order by c.delta_pct desc, c.updated_at desc
    limit 10
  ) c
  join public.products p on p.id = c.product_id;

  if (
    (select count(*) from cron.job j where j.jobname in ('price-check-scheduler', 'catalog-ingest', 'price-sync-report') and j.active = true) < 3
  ) then
    v_go_no_go := 'PROBLEMA';
    v_go_reason := 'Cron job obrigatorio inativo ou ausente.';
  elsif v_active_without_affiliate > 0 then
    v_go_no_go := 'ATENCAO';
    v_go_reason := 'Existem produtos ativos sem link de afiliado valido.';
  elsif v_invalid_not_permitted_count > 0 or v_mismatch_open_count > 0 or v_suspect_count > 0 then
    v_go_no_go := 'ATENCAO';
    v_go_reason := 'Existem itens com falha de afiliado, mismatch de preco ou preco suspeito.';
  end if;

  return jsonb_build_object(
    'generated_at', v_now,
    'go_no_go', jsonb_build_object('state', v_go_no_go, 'reason', v_go_reason),
    'automation', jsonb_build_object(
      'cron_jobs', v_cron,
      'price_check_scheduler', jsonb_build_object(
        'last_run', v_price_sync_last_run,
        'runs_last_2h', coalesce(v_price_sync_runs_2h, 0)
      ),
      'catalog_ingest', jsonb_build_object(
        'last_run', v_ingest_last_run,
        'last_inserted', coalesce(v_ingest_last_inserted, 0),
        'last_updated', coalesce(v_ingest_last_updated, 0)
      ),
      'price_sync_report', jsonb_build_object(
        'last_run', v_report_last_run,
        'delivery_status', v_report_delivery_status,
        'last_error', v_report_last_error
      )
    ),
    'catalog', jsonb_build_object(
      'standby', coalesce(v_standby_count, 0),
      'active_ok', coalesce(v_active_count, 0),
      'blocked', coalesce(v_blocked_count, 0),
      'active_without_affiliate', coalesce(v_active_without_affiliate, 0),
      'affiliate_errors_total', coalesce(v_invalid_affiliate_count, 0),
      'affiliate_not_permitted', coalesce(v_invalid_not_permitted_count, 0)
    ),
    'prices', jsonb_build_object(
      'suspect_price', coalesce(v_suspect_count, 0),
      'mismatch_open', coalesce(v_mismatch_open_count, 0),
      'mismatch_last_24h', coalesce(v_mismatch_24h, 0),
      'pix_price', coalesce(v_pix_count, 0),
      'promotion_ready', coalesce(v_promo_count, 0),
      'pix_present_count', coalesce(v_pix_present_count, 0),
      'pix_missing_from_api_count', coalesce(v_pix_missing_from_api_count, 0),
      'pix_rejected_by_policy_count', coalesce(v_pix_rejected_by_policy_count, 0)
    ),
    'lists', jsonb_build_object(
      'affiliate_errors', v_affiliate_errors,
      'price_mismatch_top', v_mismatch_top
    )
  );
end;
$$;

grant execute on function public.run_price_mismatch_audit(integer, numeric, numeric, numeric, numeric, boolean) to authenticated, service_role;
grant execute on function public.auto_fix_open_price_mismatch_cases(integer, boolean) to authenticated, service_role;
grant execute on function public.admin_resolve_price_mismatch_case(uuid, text, text) to authenticated, service_role;
grant execute on function public.get_admin_health_dashboard(integer) to authenticated, service_role;

commit;
