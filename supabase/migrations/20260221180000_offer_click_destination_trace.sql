begin;

alter table public.product_offer_click_events
  add column if not exists canonical_ml_item_id text,
  add column if not exists destination_ml_item_id text,
  add column if not exists product_price_snapshot numeric,
  add column if not exists product_previous_price_snapshot numeric,
  add column if not exists product_last_price_source text,
  add column if not exists last_verified_price numeric,
  add column if not exists last_verified_price_source text,
  add column if not exists last_verified_at timestamptz;

create index if not exists idx_product_offer_click_events_destination_ml
  on public.product_offer_click_events(destination_ml_item_id, created_at desc);

create or replace function public.resolve_product_offer_url(
  p_product_id uuid,
  p_allow_redirect_while_standby boolean default false,
  p_click_source text default 'offer_click',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_marketplace text;
  v_status text;
  v_is_active boolean;
  v_is_mercado boolean;
  v_affiliate text;
  v_source text;
  v_target text := null;
  v_target_source text := null;
  v_reason text := null;
  v_canonical_ml_item_id text;
  v_destination_ml_item_id text;
  v_last_verified_price numeric;
  v_last_verified_price_source text;
  v_last_verified_at timestamptz;
begin
  select *
  into v_product
  from public.products
  where id = p_product_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'can_redirect', false,
      'reason', 'not_found',
      'url', null
    );
  end if;

  v_marketplace := lower(coalesce(v_product.marketplace, ''));
  v_status := lower(coalesce(v_product.status, ''));
  v_is_active := coalesce(v_product.is_active, false) or v_status = 'active';
  v_is_mercado := v_marketplace like '%mercado%';
  v_affiliate := nullif(btrim(coalesce(v_product.affiliate_link, '')), '');
  v_canonical_ml_item_id := coalesce(
    public.normalize_ml_external_id(v_product.ml_item_id),
    public.resolve_product_ml_item_id(v_product.external_id, v_product.source_url, v_product.affiliate_link)
  );
  v_source := nullif(
    btrim(
      coalesce(
        v_product.canonical_offer_url,
        v_product.source_url,
        case
          when v_canonical_ml_item_id is not null then lower('https://produto.mercadolivre.com.br/' || v_canonical_ml_item_id)
          else null
        end
      )
    ),
    ''
  );

  if lower(coalesce(v_product.auto_disabled_reason, '')) = 'blocked' then
    v_reason := 'blocked_by_policy';
  elsif v_is_mercado then
    if v_is_active and public.is_mercadolivre_sec_link(v_affiliate) and v_source is not null then
      v_target := v_source;
      v_target_source := case
        when v_product.canonical_offer_url is not null then 'canonical_source'
        else 'source'
      end;
      v_reason := 'canonical_preferred_for_consistency';
    elsif v_is_active and public.is_mercadolivre_sec_link(v_affiliate) then
      v_target := v_affiliate;
      v_target_source := 'affiliate';
      v_reason := 'affiliate_validated';
    elsif v_canonical_ml_item_id is null then
      v_reason := 'missing_ml_item_id';
    elsif p_allow_redirect_while_standby and v_source is not null then
      v_target := v_source;
      v_target_source := case
        when v_product.canonical_offer_url is not null then 'canonical_source'
        else 'source'
      end;
      v_reason := 'standby_source_allowed';
    else
      v_reason := 'awaiting_affiliate_validation';
    end if;
  else
    if v_is_active and v_affiliate is not null then
      v_target := v_affiliate;
      v_target_source := 'affiliate';
      v_reason := 'affiliate_active';
    elsif (v_is_active or p_allow_redirect_while_standby) and v_source is not null then
      v_target := v_source;
      v_target_source := case
        when v_product.canonical_offer_url is not null then 'canonical_source'
        else 'source'
      end;
      v_reason := 'source_fallback';
    else
      v_reason := 'missing_offer_url';
    end if;
  end if;

  if v_target is not null and not public.is_allowed_offer_url(v_target, v_product.marketplace) then
    v_target := null;
    v_target_source := null;
    v_reason := 'invalid_target_domain';
  end if;

  v_destination_ml_item_id := coalesce(
    public.extract_ml_item_id_from_url(v_target),
    case
      when v_target is not null and v_target_source in ('canonical_source', 'source') then v_canonical_ml_item_id
      else null
    end
  );

  select e.final_price, e.final_price_source, e.created_at
    into v_last_verified_price, v_last_verified_price_source, v_last_verified_at
  from public.price_check_events e
  where e.product_id = v_product.id
    and e.final_price is not null
  order by e.created_at desc
  limit 1;

  begin
    insert into public.product_offer_click_events (
      product_id,
      click_source,
      resolved_source,
      resolution_reason,
      destination_url,
      canonical_ml_item_id,
      destination_ml_item_id,
      product_price_snapshot,
      product_previous_price_snapshot,
      product_last_price_source,
      last_verified_price,
      last_verified_price_source,
      last_verified_at,
      metadata
    )
    values (
      v_product.id,
      coalesce(nullif(btrim(p_click_source), ''), 'offer_click'),
      v_target_source,
      v_reason,
      v_target,
      v_canonical_ml_item_id,
      v_destination_ml_item_id,
      v_product.price,
      v_product.previous_price,
      v_product.last_price_source,
      v_last_verified_price,
      v_last_verified_price_source,
      v_last_verified_at,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'allow_redirect_while_standby', p_allow_redirect_while_standby,
        'status', v_product.status,
        'is_active', v_product.is_active,
        'marketplace', v_product.marketplace,
        'ml_item_id', v_product.ml_item_id,
        'canonical_offer_url', v_product.canonical_offer_url
      )
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', v_target is not null,
    'can_redirect', v_target is not null,
    'url', v_target,
    'resolved_source', v_target_source,
    'reason', v_reason,
    'product_id', v_product.id,
    'status', v_product.status,
    'is_active', v_product.is_active,
    'ml_item_id', v_product.ml_item_id,
    'canonical_ml_item_id', v_canonical_ml_item_id,
    'destination_ml_item_id', v_destination_ml_item_id,
    'canonical_offer_url', v_product.canonical_offer_url,
    'product_price_snapshot', v_product.price,
    'last_verified_price', v_last_verified_price,
    'last_verified_price_source', v_last_verified_price_source,
    'last_verified_at', v_last_verified_at,
    'allow_redirect_while_standby', p_allow_redirect_while_standby
  );
end;
$$;

grant execute on function public.resolve_product_offer_url(uuid, boolean, text, jsonb) to anon, authenticated, service_role;

create or replace view public.v_product_offer_destination_trace as
with events as (
  select
    e.*,
    lag(e.destination_ml_item_id) over (
      partition by e.product_id
      order by e.created_at, e.id
    ) as previous_destination_ml_item_id
  from public.product_offer_click_events e
)
select
  events.*,
  (
    events.destination_ml_item_id is not null
    and events.previous_destination_ml_item_id is not null
    and events.destination_ml_item_id is distinct from events.previous_destination_ml_item_id
  ) as destination_ml_item_changed
from events;

grant select on public.v_product_offer_destination_trace to authenticated, service_role;

commit;
