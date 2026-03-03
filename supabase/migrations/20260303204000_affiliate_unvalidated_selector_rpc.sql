begin;

create or replace function public.list_unvalidated_affiliate_products(
  p_limit integer default 800
)
returns table(
  id uuid,
  name text,
  status text,
  is_active boolean,
  affiliate_verified boolean,
  reason_code text,
  deactivation_reason text,
  auto_disabled_reason text,
  affiliate_validation_status text,
  affiliate_validation_error text,
  source_url text,
  affiliate_link text,
  ml_item_id text,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with base as (
    select
      p.id,
      p.name,
      p.status,
      p.is_active,
      p.affiliate_verified,
      p.deactivation_reason,
      p.auto_disabled_reason,
      p.affiliate_validation_status,
      p.affiliate_validation_error,
      p.source_url,
      p.affiliate_link,
      p.ml_item_id,
      p.updated_at,
      case
        when coalesce(p.auto_disabled_reason, '') = 'blocked' then 'blocked'
        when coalesce(nullif(btrim(p.source_url), ''), nullif(btrim(p.affiliate_link), '')) is null then 'missing_source_or_affiliate_url'
        when coalesce(btrim(p.ml_item_id), '') = '' then 'missing_ml_item_id'
        when coalesce(nullif(btrim(p.affiliate_link), ''), '') = '' then 'missing_affiliate_link'
        when not public.is_mercadolivre_sec_link(p.affiliate_link) then 'affiliate_not_sec'
        when coalesce(p.affiliate_verified, false) = false then 'affiliate_not_verified'
        when coalesce(p.is_active, false) = false
          or lower(coalesce(p.status, '')) in ('standby', 'inactive', 'pending', 'pending_validacao', 'pending_validation')
          then 'inactive_or_pending'
        when upper(coalesce(p.affiliate_validation_status, '')) in ('INVALID_LINK', 'INVALID_DUPLICATE', 'INVALID_NOT_PERMITTED')
          then 'affiliate_validation_status_' || lower(p.affiliate_validation_status)
        when coalesce(nullif(btrim(p.affiliate_validation_error), ''), '') <> ''
          then 'affiliate_validation_error_present'
        else null
      end as reason_code
    from public.products p
    where lower(coalesce(p.marketplace, '')) like 'mercado%'
      and p.removed_at is null
  )
  select
    b.id,
    b.name,
    b.status,
    b.is_active,
    b.affiliate_verified,
    b.reason_code,
    b.deactivation_reason,
    b.auto_disabled_reason,
    b.affiliate_validation_status,
    b.affiliate_validation_error,
    b.source_url,
    b.affiliate_link,
    b.ml_item_id,
    b.updated_at
  from base b
  where b.reason_code is not null
  order by b.updated_at desc, b.id
  limit greatest(1, least(coalesce(p_limit, 800), 5000));
$$;

grant execute on function public.list_unvalidated_affiliate_products(integer) to authenticated, service_role;

commit;
