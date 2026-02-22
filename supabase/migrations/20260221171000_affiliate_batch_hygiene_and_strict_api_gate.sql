begin;

create or replace function public.cleanup_expired_affiliate_validation_batches(
  p_item_limit integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_item_limit, 5000), 50000));
  v_batches_expired integer := 0;
  v_items_skipped integer := 0;
begin
  with expired_batches as (
    update public.affiliate_validation_batches b
      set status = 'EXPIRED'
    where b.status = 'OPEN'
      and b.expires_at < now()
    returning b.id
  )
  select count(*) into v_batches_expired
  from expired_batches;

  with pending_items as (
    select i.id
    from public.affiliate_validation_batch_items i
    join public.affiliate_validation_batches b on b.id = i.batch_id
    where b.status = 'EXPIRED'
      and i.apply_status = 'PENDING'
    order by i.id
    limit v_limit
  ),
  updated as (
    update public.affiliate_validation_batch_items i
      set apply_status = 'SKIPPED',
          error_message = coalesce(i.error_message, 'batch_expired_auto_cleanup')
    where i.id in (select id from pending_items)
    returning i.id
  )
  select count(*) into v_items_skipped
  from updated;

  return jsonb_build_object(
    'ok', true,
    'expired_batches', v_batches_expired,
    'items_skipped', v_items_skipped,
    'item_limit', v_limit,
    'ran_at', now()
  );
end;
$$;

grant execute on function public.cleanup_expired_affiliate_validation_batches(integer)
  to authenticated, service_role;

create or replace function private.invoke_affiliate_batch_hygiene()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.cleanup_expired_affiliate_validation_batches(5000);
exception
  when others then
    raise notice 'invoke_affiliate_batch_hygiene failed: %', sqlerrm;
end;
$$;

revoke all on function private.invoke_affiliate_batch_hygiene() from public;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'affiliate-validation-batch-hygiene'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'affiliate-validation-batch-hygiene',
    '*/20 * * * *',
    $cron$select private.invoke_affiliate_batch_hygiene();$cron$
  );
end $$;

create or replace function public.export_standby_affiliate_batch(
  p_limit integer default 30,
  p_source text default 'admin'
)
returns table(
  batch_id uuid,
  "position" integer,
  product_id uuid,
  product_name text,
  external_id text,
  source_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 30));
  v_batch_id uuid;
  v_inserted integer := 0;
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
begin
  if not v_is_service and (auth.uid() is null or not public.has_role(auth.uid(), 'admin')) then
    raise exception 'admin_required';
  end if;

  perform public.cleanup_expired_affiliate_validation_batches(5000);

  insert into public.affiliate_validation_batches (
    created_by,
    status,
    source,
    metadata
  )
  values (
    auth.uid(),
    'OPEN',
    coalesce(nullif(btrim(p_source), ''), 'admin'),
    jsonb_build_object(
      'limit', v_limit,
      'coherence_gate', true,
      'strict_api_trace_gate', true,
      'required_last_price_source', array['API_BASE', 'API_PIX'],
      'required_last_price_verified_max_age_hours', 48,
      'required_data_health_status', 'HEALTHY'
    )
  )
  returning id into v_batch_id;

  with pending_raw as (
    select
      p.id as product_id,
      p.name as product_name,
      p.status,
      p.is_active,
      p.affiliate_verified,
      p.external_id,
      p.last_sync,
      p.updated_at,
      p.created_at,
      p.ml_item_id,
      p.canonical_offer_url,
      coalesce(nullif(btrim(p.source_url), ''), nullif(btrim(p.affiliate_link), '')) as source_url,
      coalesce(
        public.normalize_ml_external_id(coalesce(nullif(btrim(p.source_url), ''), nullif(btrim(p.affiliate_link), ''))),
        public.normalize_ml_permalink(coalesce(nullif(btrim(p.source_url), ''), nullif(btrim(p.affiliate_link), ''))),
        public.normalize_ml_external_id(p.external_id),
        public.normalize_ml_external_id(p.source_url),
        public.normalize_ml_external_id(p.affiliate_link),
        public.normalize_ml_permalink(coalesce(p.source_url, p.affiliate_link)),
        p.id::text
      ) as canonical_key
    from public.products p
    where lower(coalesce(p.marketplace, '')) like 'mercado%'
      and coalesce(p.auto_disabled_reason, '') <> 'blocked'
      and coalesce(nullif(btrim(p.source_url), ''), nullif(btrim(p.affiliate_link), '')) is not null
      and coalesce(p.price, 0) > 0
      and coalesce(p.ml_item_id, '') <> ''
      and coalesce(p.data_health_status, 'HEALTHY') = 'HEALTHY'
      and coalesce(p.price_mismatch_status, 'NONE') <> 'OPEN'
      and coalesce(p.last_price_source, '') in ('API_BASE', 'API_PIX')
      and coalesce(p.last_price_verified_at, to_timestamp(0)) >= now() - interval '48 hours'
      and public.resolve_ml_canonical_offer_url(p.source_url, p.affiliate_link, p.ml_item_id) is not null
      and not exists (
        select 1
        from public.price_mismatch_cases c
        where c.product_id = p.id
          and c.status = 'OPEN'
      )
      and public.normalize_ml_external_id(p.ml_item_id) = public.resolve_product_ml_item_id(p.external_id, p.source_url, p.affiliate_link)
      and (
        p.canonical_offer_url is null
        or public.normalize_ml_permalink(p.canonical_offer_url) = public.resolve_ml_canonical_offer_url(p.source_url, p.affiliate_link, p.ml_item_id)
      )
      and (
        lower(coalesce(p.status, '')) in ('standby', 'pending', 'pending_validacao', 'pending_validation')
        or coalesce(p.is_active, false) = false
        or coalesce(p.affiliate_verified, false) = false
        or not public.is_mercadolivre_sec_link(p.affiliate_link)
      )
  ),
  active_validated as (
    select distinct
      av.canonical_key
    from (
      select
        p.id as product_id,
        coalesce(
          public.normalize_ml_external_id(coalesce(nullif(btrim(p.source_url), ''), nullif(btrim(p.affiliate_link), ''))),
          public.normalize_ml_permalink(coalesce(nullif(btrim(p.source_url), ''), nullif(btrim(p.affiliate_link), ''))),
          public.normalize_ml_external_id(p.external_id),
          public.normalize_ml_external_id(p.source_url),
          public.normalize_ml_external_id(p.affiliate_link),
          public.normalize_ml_permalink(coalesce(p.source_url, p.affiliate_link)),
          p.id::text
        ) as canonical_key
      from public.products p
      where lower(coalesce(p.marketplace, '')) like 'mercado%'
        and coalesce(p.auto_disabled_reason, '') <> 'blocked'
        and coalesce(p.is_active, false) = true
        and lower(coalesce(p.status, '')) = 'active'
        and public.is_mercadolivre_sec_link(p.affiliate_link)
    ) av
    where av.canonical_key is not null
  ),
  deduped as (
    select
      pr.*,
      row_number() over (
        partition by pr.canonical_key
        order by
          case when coalesce(pr.affiliate_verified, false) then 0 else 1 end,
          case when coalesce(pr.is_active, false) then 0 else 1 end,
          coalesce(pr.last_sync, pr.updated_at, pr.created_at) asc,
          pr.product_id
      ) as canon_rank
    from pending_raw pr
    left join active_validated av on av.canonical_key = pr.canonical_key
    where av.canonical_key is null
  ),
  ordered as (
    select
      d.product_id,
      d.product_name,
      d.external_id,
      d.source_url,
      row_number() over (
        order by
          case when lower(coalesce(d.status, '')) = 'standby' then 0 else 1 end,
          coalesce(d.last_sync, d.updated_at, d.created_at) asc,
          d.product_id
      ) as position
    from deduped d
    where d.canon_rank = 1
  )
  insert into public.affiliate_validation_batch_items (
    batch_id,
    position,
    product_id,
    source_url,
    external_id
  )
  select
    v_batch_id,
    o.position,
    o.product_id,
    o.source_url,
    public.normalize_ml_external_id(o.external_id)
  from ordered o
  where o.position <= v_limit;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    delete from public.affiliate_validation_batches where id = v_batch_id;
    return;
  end if;

  update public.affiliate_validation_batches
    set total_items = (
      select count(*)
      from public.affiliate_validation_batch_items i
      where i.batch_id = v_batch_id
    )
  where id = v_batch_id;

  return query
  select
    v_batch_id as batch_id,
    i.position,
    i.product_id,
    p.name as product_name,
    i.external_id,
    i.source_url
  from public.affiliate_validation_batch_items i
  join public.products p on p.id = i.product_id
  where i.batch_id = v_batch_id
  order by i.position;
end;
$$;

grant execute on function public.export_standby_affiliate_batch(integer, text)
  to authenticated, service_role;

commit;
