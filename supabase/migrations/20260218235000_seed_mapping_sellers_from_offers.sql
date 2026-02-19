-- Seed category_marketplace_map.seller_ids from observed offer sellers.
-- Strategy:
-- 1) Prefer top sellers per category using existing product_offers.
-- 2) If a mapping has no seller_ids and category has no observed sellers,
--    fallback to the seller id inferred from the latest ML access token.
-- 3) Keep existing non-empty seller_ids when no better source exists.

with fallback as (
  select (
    select nullif((regexp_match(mt.access_token, '([0-9]{6,})$'))[1], '')::bigint
    from public.meli_tokens mt
    where mt.access_token is not null
      and btrim(mt.access_token) <> ''
    order by mt.updated_at desc nulls last, mt.id desc
    limit 1
  ) as seller_id
),
seller_rank as (
  select
    po.category_id,
    po.seller_id,
    count(*) as offers_count,
    max(po.last_seen_at) as last_seen_at,
    row_number() over (
      partition by po.category_id
      order by count(*) desc, max(po.last_seen_at) desc, po.seller_id
    ) as rn
  from public.product_offers po
  where po.marketplace = 'mercadolivre'
    and po.category_id is not null
    and po.seller_id is not null
    and po.seller_id > 0
  group by po.category_id, po.seller_id
),
top_sellers as (
  select
    sr.category_id,
    array_agg(sr.seller_id order by sr.offers_count desc, sr.last_seen_at desc, sr.seller_id) as seller_ids
  from seller_rank sr
  where sr.rn <= 12
  group by sr.category_id
),
prepared as (
  select
    m.id,
    m.seller_ids as current_ids,
    ts.seller_ids as category_seller_ids,
    fb.seller_id as fallback_seller_id
  from public.category_marketplace_map m
  left join top_sellers ts
    on ts.category_id = m.category_id
  cross join fallback fb
  where m.marketplace = 'mercadolivre'
)
update public.category_marketplace_map m
set
  seller_ids = case
    when coalesce(array_length(p.category_seller_ids, 1), 0) > 0 then p.category_seller_ids
    when coalesce(array_length(m.seller_ids, 1), 0) > 0 then m.seller_ids
    when p.fallback_seller_id is not null then array[p.fallback_seller_id]::bigint[]
    else m.seller_ids
  end,
  updated_at = now()
from prepared p
where p.id = m.id
  and (
    (
      coalesce(array_length(p.category_seller_ids, 1), 0) > 0
      and m.seller_ids is distinct from p.category_seller_ids
    )
    or (
      coalesce(array_length(m.seller_ids, 1), 0) = 0
      and p.fallback_seller_id is not null
    )
  );

with normalized as (
  select
    m.id,
    coalesce(array_agg(distinct sid order by sid), '{}'::bigint[]) as seller_ids
  from public.category_marketplace_map m
  left join lateral unnest(coalesce(m.seller_ids, '{}'::bigint[])) as sid on true
  where m.marketplace = 'mercadolivre'
    and sid is not null
    and sid > 0
  group by m.id
)
update public.category_marketplace_map m
set
  seller_ids = n.seller_ids,
  updated_at = now()
from normalized n
where n.id = m.id
  and m.seller_ids is distinct from n.seller_ids;
