begin;

alter table public.products
  add column if not exists ml_item_id text,
  add column if not exists canonical_offer_url text,
  add column if not exists price_freeze_until timestamptz,
  add column if not exists price_freeze_reason text,
  add column if not exists price_freeze_set_at timestamptz,
  add column if not exists price_pending_candidate numeric,
  add column if not exists price_pending_count integer not null default 0,
  add column if not exists price_pending_source text,
  add column if not exists price_pending_seen_at timestamptz;

alter table public.products
  drop constraint if exists products_price_pending_count_non_negative;
alter table public.products
  add constraint products_price_pending_count_non_negative
  check (price_pending_count >= 0);

create index if not exists idx_products_ml_item_id
  on public.products (marketplace, ml_item_id);

create index if not exists idx_products_price_freeze_until
  on public.products (price_freeze_until)
  where price_freeze_until is not null;

alter table public.price_check_config
  add column if not exists price_freeze_hours integer not null default 4,
  add column if not exists price_freeze_recheck_minutes integer not null default 10;

alter table public.price_check_config
  drop constraint if exists price_check_config_price_freeze_hours_check;
alter table public.price_check_config
  add constraint price_check_config_price_freeze_hours_check
  check (price_freeze_hours between 2 and 6);

alter table public.price_check_config
  drop constraint if exists price_check_config_price_freeze_recheck_minutes_check;
alter table public.price_check_config
  add constraint price_check_config_price_freecheck_minutes_check
  check (price_freeze_recheck_minutes between 5 and 60);

create or replace function public.extract_ml_item_id_from_url(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v_match text[];
  v_upper text;
begin
  if p_value is null then
    return null;
  end if;

  v_upper := upper(btrim(p_value));
  if v_upper = '' then
    return null;
  end if;

  v_match := regexp_match(v_upper, '(?:ITEM_ID(?:=|%3A|:)|WID(?:=|%3D))\s*(MLB[-_ ]?[0-9]{6,14})');
  if v_match is not null and v_match[1] is not null then
    return public.normalize_ml_external_id(v_match[1]);
  end if;

  if v_upper ~ '/P/MLB[0-9]{6,14}' then
    return null;
  end if;

  v_match := regexp_match(v_upper, '/(MLB[-_ ]?[0-9]{6,14})(?:[-_/]|$)');
  if v_match is not null and v_match[1] is not null then
    return public.normalize_ml_external_id(v_match[1]);
  end if;

  if v_upper ~ '^MLB[-_ ]?[0-9]{6,14}$' then
    return public.normalize_ml_external_id(v_upper);
  end if;

  return null;
end;
$$;

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
  v_source_upper text := upper(coalesce(p_source_url, ''));
  v_aff_upper text := upper(coalesce(p_affiliate_link, ''));
  v_source_is_catalog boolean := false;
  v_aff_is_catalog boolean := false;
begin
  v_source_item := public.extract_ml_item_id_from_url(p_source_url);
  if v_source_item is not null then
    return v_source_item;
  end if;

  v_aff_item := public.extract_ml_item_id_from_url(p_affiliate_link);
  if v_aff_item is not null then
    return v_aff_item;
  end if;

  v_source_is_catalog := v_source_upper ~ '/P/MLB[0-9]{6,14}';
  v_aff_is_catalog := v_aff_upper ~ '/P/MLB[0-9]{6,14}';

  v_external := public.normalize_ml_external_id(p_external_id);
  if v_external is not null and not v_source_is_catalog and not v_aff_is_catalog then
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
begin
  v_source := public.normalize_ml_permalink(p_source_url);
  if v_source is not null
    and public.is_allowed_offer_url(v_source, 'mercadolivre')
    and not public.is_mercadolivre_sec_link(v_source) then
    return v_source;
  end if;

  v_aff := public.normalize_ml_permalink(p_affiliate_link);
  if v_aff is not null
    and public.is_allowed_offer_url(v_aff, 'mercadolivre')
    and not public.is_mercadolivre_sec_link(v_aff) then
    return v_aff;
  end if;

  v_item := public.normalize_ml_external_id(p_ml_item_id);
  if v_item is not null then
    return lower('https://produto.mercadolivre.com.br/' || v_item);
  end if;

  return null;
end;
$$;

create or replace function public.apply_ml_canonical_identity_on_products()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market text;
  v_item text;
  v_offer text;
begin
  v_market := lower(coalesce(new.marketplace, ''));

  if v_market like 'mercado%' then
    v_item := public.resolve_product_ml_item_id(new.external_id, new.source_url, new.affiliate_link);
    new.ml_item_id := v_item;

    v_offer := public.resolve_ml_canonical_offer_url(new.source_url, new.affiliate_link, v_item);
    new.canonical_offer_url := v_offer;

    if coalesce(new.is_active, false) = true
      and lower(coalesce(new.status, '')) = 'active'
      and v_item is null then
      new.status := 'standby';
      new.is_active := false;
      new.deactivation_reason := coalesce(new.deactivation_reason, 'missing_ml_item_id');
      new.last_health_check_at := now();
    end if;
  end if;

  if new.price_pending_count is null then
    new.price_pending_count := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_products_apply_ml_canonical_identity on public.products;
create trigger trg_products_apply_ml_canonical_identity
before insert or update of marketplace, external_id, source_url, affiliate_link, status, is_active
on public.products
for each row
execute function public.apply_ml_canonical_identity_on_products();

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

grant execute on function public.extract_ml_item_id_from_url(text) to anon, authenticated, service_role;
grant execute on function public.resolve_product_ml_item_id(text, text, text) to anon, authenticated, service_role;
grant execute on function public.resolve_ml_canonical_offer_url(text, text, text) to anon, authenticated, service_role;

commit;
