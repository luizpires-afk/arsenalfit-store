-- Exclude pending duplicates from affiliate batch export when a canonical
-- Mercado Livre product is already active and validated with /sec/ link.

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

  if auth.uid() is not null then
    update public.affiliate_validation_batches
      set status = 'EXPIRED'
    where status = 'OPEN'
      and created_by = auth.uid()
      and expires_at < now();
  else
    update public.affiliate_validation_batches
      set status = 'EXPIRED'
    where status = 'OPEN'
      and created_by is null
      and expires_at < now();
  end if;

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
    jsonb_build_object('limit', v_limit)
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
