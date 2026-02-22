begin;

update public.products p
set canonical_offer_url = public.resolve_ml_canonical_offer_url(p.source_url, p.affiliate_link, p.ml_item_id),
    updated_at = now()
where p.marketplace ilike '%mercado%'
  and p.removed_at is null
  and p.ml_item_id is not null
  and public.resolve_ml_canonical_offer_url(p.source_url, p.affiliate_link, p.ml_item_id) is not null
  and public.normalize_ml_permalink(p.canonical_offer_url) is distinct from public.resolve_ml_canonical_offer_url(p.source_url, p.affiliate_link, p.ml_item_id);

update public.products p
set status = 'active',
    is_active = true,
    data_health_status = 'HEALTHY',
    deactivation_reason = null,
    auto_disabled_reason = null,
    auto_disabled_at = null,
    updated_at = now(),
    last_health_check_at = now()
where p.marketplace ilike '%mercado%'
  and p.removed_at is null
  and p.status = 'standby'
  and p.auto_disabled_reason = 'supervisao_automatica_incoerencia'
  and p.deactivation_reason = 'supervisao_automatica_incoerencia'
  and p.ml_item_id is not null
  and public.resolve_ml_canonical_offer_url(p.source_url, p.affiliate_link, p.ml_item_id) is not null
  and public.normalize_ml_permalink(p.canonical_offer_url) = public.resolve_ml_canonical_offer_url(p.source_url, p.affiliate_link, p.ml_item_id);

commit;
