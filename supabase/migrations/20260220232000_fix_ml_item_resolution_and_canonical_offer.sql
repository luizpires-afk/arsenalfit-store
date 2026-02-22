begin;

create or replace function public.resolve_product_ml_item_id(
  p_external_id text,
  p_source_url text,
  p_affiliate_link text
)
returns text
language plpgsql
immutable
as $$
declare
  v_source_item text;
  v_aff_item text;
  v_external text;
begin
  v_source_item := public.extract_ml_item_id_from_url(p_source_url);
  if v_source_item is not null then
    return v_source_item;
  end if;

  v_aff_item := public.extract_ml_item_id_from_url(p_affiliate_link);
  if v_aff_item is not null then
    return v_aff_item;
  end if;

  v_external := public.normalize_ml_external_id(p_external_id);
  if v_external is not null then
    return v_external;
  end if;

  return null;
end;
$$;

create or replace function public.resolve_ml_canonical_offer_url(
  p_source_url text,
  p_affiliate_link text,
  p_ml_item_id text
)
returns text
language plpgsql
immutable
as $$
declare
  v_source text;
  v_aff text;
  v_item text;
  v_source_is_catalog boolean := false;
  v_aff_is_catalog boolean := false;
begin
  v_source := public.normalize_ml_permalink(p_source_url);
  v_aff := public.normalize_ml_permalink(p_affiliate_link);
  v_item := public.normalize_ml_external_id(p_ml_item_id);

  if v_source is not null then
    v_source_is_catalog := upper(v_source) ~ '/P/MLB[0-9]{6,14}';
  end if;
  if v_aff is not null then
    v_aff_is_catalog := upper(v_aff) ~ '/P/MLB[0-9]{6,14}';
  end if;

  if v_item is not null then
    return lower('https://produto.mercadolivre.com.br/' || v_item);
  end if;

  if v_source is not null
    and public.is_allowed_offer_url(v_source, 'mercadolivre')
    and not public.is_mercadolivre_sec_link(v_source)
    and not v_source_is_catalog then
    return v_source;
  end if;

  if v_aff is not null
    and public.is_allowed_offer_url(v_aff, 'mercadolivre')
    and not public.is_mercadolivre_sec_link(v_aff)
    and not v_aff_is_catalog then
    return v_aff;
  end if;

  if v_source is not null
    and public.is_allowed_offer_url(v_source, 'mercadolivre')
    and not public.is_mercadolivre_sec_link(v_source) then
    return v_source;
  end if;

  if v_aff is not null
    and public.is_allowed_offer_url(v_aff, 'mercadolivre')
    and not public.is_mercadolivre_sec_link(v_aff) then
    return v_aff;
  end if;

  return null;
end;
$$;

update public.products p
set ml_item_id = public.resolve_product_ml_item_id(p.external_id, p.source_url, p.affiliate_link),
    canonical_offer_url = public.resolve_ml_canonical_offer_url(
      p.source_url,
      p.affiliate_link,
      public.resolve_product_ml_item_id(p.external_id, p.source_url, p.affiliate_link)
    ),
    updated_at = now()
where lower(coalesce(p.marketplace, '')) like 'mercado%'
  and p.removed_at is null;

update public.products p
set status = 'standby',
    is_active = false,
    deactivation_reason = coalesce(p.deactivation_reason, 'missing_ml_item_id'),
    last_health_check_at = now(),
    updated_at = now()
where lower(coalesce(p.marketplace, '')) like 'mercado%'
  and p.removed_at is null
  and coalesce(p.is_active, false) = true
  and lower(coalesce(p.status, '')) = 'active'
  and p.ml_item_id is null;

grant execute on function public.resolve_product_ml_item_id(text, text, text) to anon, authenticated, service_role;
grant execute on function public.resolve_ml_canonical_offer_url(text, text, text) to anon, authenticated, service_role;

commit;
