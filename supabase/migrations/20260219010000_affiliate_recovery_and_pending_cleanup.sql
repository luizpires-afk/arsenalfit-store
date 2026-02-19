-- Recover previously saved Mercado Livre short affiliate links (/sec/) and
-- move non-validated ML products to standby without deleting history.

with ranked_sec as (
  select
    p.external_id,
    p.affiliate_link,
    p.affiliate_generated_at,
    p.updated_at,
    row_number() over (
      partition by p.external_id
      order by coalesce(p.affiliate_generated_at, p.updated_at, p.created_at) desc, p.id
    ) as rn
  from public.products p
  where p.marketplace = 'mercadolivre'
    and p.external_id is not null
    and p.affiliate_link is not null
    and p.affiliate_link ~* '^https?://(www\.)?mercadolivre\.com/sec/'
),
best_sec as (
  select external_id, affiliate_link, affiliate_generated_at
  from ranked_sec
  where rn = 1
)
update public.products p
set
  affiliate_link = b.affiliate_link,
  affiliate_verified = true,
  affiliate_generated_at = coalesce(b.affiliate_generated_at, p.affiliate_generated_at, now())
from best_sec b
where p.marketplace = 'mercadolivre'
  and p.external_id = b.external_id
  and (
    p.affiliate_link is null
    or p.affiliate_link !~* '^https?://(www\.)?mercadolivre\.com/sec/'
  );

update public.products
set affiliate_verified = (
  affiliate_link is not null
  and affiliate_link ~* '^https?://(www\.)?mercadolivre\.com/sec/'
)
where marketplace = 'mercadolivre';

-- Products without short affiliate link stay in standby/inactive until validated.
update public.products
set
  is_active = false,
  status = 'standby',
  auto_disabled_reason = coalesce(auto_disabled_reason, 'affiliate_pending'),
  auto_disabled_at = coalesce(auto_disabled_at, now())
where marketplace = 'mercadolivre'
  and is_active is true
  and (
    affiliate_link is null
    or affiliate_link !~* '^https?://(www\.)?mercadolivre\.com/sec/'
  );

-- Remove obvious non-fitness coffee/kitchen products from storefront via standby.
update public.products
set
  is_active = false,
  status = 'standby',
  auto_disabled_reason = 'blocked',
  auto_disabled_at = now()
where marketplace = 'mercadolivre'
  and (
    lower(coalesce(name, '')) ~ '(cafeteira|garrafa de cafe|chimarrao|bule|coador|cuia|erva ?mate)'
    or lower(coalesce(short_description, '')) ~ '(cafeteira|garrafa de cafe|chimarrao|bule|coador|cuia|erva ?mate)'
  );

-- Keep ingest growth controlled per category.
update public.category_marketplace_map
set
  max_new_per_day = case site_category
    when 'roupas_masc' then 5
    when 'roupas_fem' then 5
    when 'acessorios' then 4
    when 'suplementos' then 5
    when 'equipamentos' then 3
    else coalesce(max_new_per_day, 4)
  end,
  min_delta_score_to_replace = coalesce(min_delta_score_to_replace, 8),
  enabled = true
where marketplace = 'mercadolivre';
