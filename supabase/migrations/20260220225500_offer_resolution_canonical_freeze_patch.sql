begin;

alter table public.price_check_config
  drop constraint if exists price_check_config_price_freecheck_minutes_check;

alter table public.price_check_config
  drop constraint if exists price_check_config_price_freeze_recheck_minutes_check;

alter table public.price_check_config
  add constraint price_check_config_price_freeze_recheck_minutes_check
  check (price_freeze_recheck_minutes between 5 and 60);

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
  v_ml_item_id text;
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
  v_ml_item_id := public.normalize_ml_external_id(coalesce(v_product.ml_item_id, v_product.external_id));
  v_source := nullif(
    btrim(
      coalesce(
        v_product.canonical_offer_url,
        v_product.source_url,
        case
          when v_ml_item_id is not null then lower('https://produto.mercadolivre.com.br/' || v_ml_item_id)
          else null
        end
      )
    ),
    ''
  );

  if lower(coalesce(v_product.auto_disabled_reason, '')) = 'blocked' then
    v_reason := 'blocked_by_policy';
  elsif v_is_mercado then
    if v_is_active and public.is_mercadolivre_sec_link(v_affiliate) then
      v_target := v_affiliate;
      v_target_source := 'affiliate';
      v_reason := 'affiliate_validated';
    elsif v_ml_item_id is null then
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

  begin
    insert into public.product_offer_click_events (
      product_id,
      click_source,
      resolved_source,
      resolution_reason,
      destination_url,
      metadata
    )
    values (
      v_product.id,
      coalesce(nullif(btrim(p_click_source), ''), 'offer_click'),
      v_target_source,
      v_reason,
      v_target,
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
    'canonical_offer_url', v_product.canonical_offer_url,
    'allow_redirect_while_standby', p_allow_redirect_while_standby
  );
end;
$$;

create or replace function public.apply_price_freeze_on_mismatch_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_hours integer := 4;
  v_freeze_until timestamptz;
begin
  if old.status is distinct from new.status and new.status = 'RESOLVED' then
    select least(greatest(coalesce(price_freeze_hours, 4), 2), 6)
    into v_hours
    from public.price_check_config
    where id = true
    limit 1;

    if v_hours is null then
      v_hours := 4;
    end if;

    v_freeze_until := v_now + make_interval(hours => v_hours);

    update public.products p
      set price_freeze_until = greatest(coalesce(p.price_freeze_until, '-infinity'::timestamptz), v_freeze_until),
          price_freeze_reason = 'mismatch_resolution',
          price_freeze_set_at = v_now,
          price_pending_candidate = null,
          price_pending_count = 0,
          price_pending_source = null,
          price_pending_seen_at = null,
          updated_at = v_now
    where p.id = new.product_id
      and p.removed_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_price_mismatch_apply_freeze on public.price_mismatch_cases;
create trigger trg_price_mismatch_apply_freeze
after update of status on public.price_mismatch_cases
for each row
execute function public.apply_price_freeze_on_mismatch_resolved();

grant execute on function public.resolve_product_offer_url(uuid, boolean, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.apply_price_freeze_on_mismatch_resolved() to authenticated, service_role;

commit;
