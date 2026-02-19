-- Restore curated affiliate product and dedupe active Mercado Livre catalog entries.
-- Keeps exactly one active row per canonical product key, preferring:
-- featured > tracked affiliate > best effective price > most recent.

update public.products
set
  affiliate_link = 'https://mercadolivre.com/sec/1XMgbNn',
  affiliate_verified = true,
  affiliate_generated_at = now(),
  is_featured = true,
  is_active = true,
  status = 'active'
where marketplace = 'mercadolivre'
  and external_id = 'MLB5314342870';

with base as (
  select
    p.id,
    p.name,
    p.external_id,
    p.source_url,
    p.affiliate_link,
    p.is_active,
    p.status,
    p.is_featured,
    p.description_manual_override,
    p.price,
    p.pix_price,
    p.updated_at,
    p.created_at,
    regexp_match(p.source_url, '/p/(MLB[0-9]{6,12})', 'i') as catalog_match,
    regexp_match(p.source_url, '/MLB-([0-9]{6,12})', 'i') as item_match,
    case
      when p.affiliate_link ~* '^https?://(www\.)?mercadolivre\.com/sec/' then 1
      when p.affiliate_link ~* '[?&]matt_tool=38524122([&#]|$)' then 1
      when p.source_url ~* '[?&]matt_tool=38524122([&#]|$)' then 1
      else 0
    end as has_affiliate_tracking,
    case
      when p.is_featured is true then 1
      when coalesce(p.description_manual_override, false) is true then 1
      when p.affiliate_link ~* '^https?://(www\.)?mercadolivre\.com/sec/' then 1
      when coalesce(p.source_url, '') ~* '(origin=share|sid=share|origin%3dshare|sid%3dshare)' then 1
      when coalesce(p.affiliate_link, '') ~* '(origin=share|sid=share|origin%3dshare|sid%3dshare)' then 1
      else 0
    end as is_curated_pinned
  from public.products p
  where p.marketplace = 'mercadolivre'
    and (
      p.is_active is true
      or p.is_featured is true
      or coalesce(p.description_manual_override, false) is true
      or p.affiliate_link ~* '^https?://(www\.)?mercadolivre\.com/sec/'
      or coalesce(p.source_url, '') ~* '(origin=share|sid=share|origin%3dshare|sid%3dshare)'
      or coalesce(p.affiliate_link, '') ~* '(origin=share|sid=share|origin%3dshare|sid%3dshare)'
    )
),
pre_rank as (
  select
    b.*,
    coalesce(
      upper((b.catalog_match)[1]),
      case when (b.item_match)[1] is not null then 'MLB' || (b.item_match)[1] end,
      upper(nullif(b.external_id, '')),
      md5(lower(coalesce(b.name, '')))
    ) as canonical_key
  from base b
),
ranked as (
  select
    pr.*,
    row_number() over (
      partition by pr.canonical_key
      order by
        pr.is_curated_pinned desc,
        pr.is_featured desc,
        pr.has_affiliate_tracking desc,
        coalesce(nullif(pr.pix_price, 0), pr.price) asc nulls last,
        pr.updated_at desc nulls last,
        pr.created_at desc nulls last,
        pr.id
    ) as rn
  from pre_rank pr
),
to_pause as (
  select r.id
  from ranked r
  where r.rn > 1
    and r.is_active is true
),
to_activate as (
  select r.id
  from ranked r
  where r.rn = 1
)
update public.products p
set
  is_active = false,
  status = 'paused'
from to_pause d
where p.id = d.id;

with base as (
  select
    p.id,
    p.name,
    p.external_id,
    p.source_url,
    p.affiliate_link,
    p.is_active,
    p.status,
    p.is_featured,
    p.description_manual_override,
    p.price,
    p.pix_price,
    p.updated_at,
    p.created_at,
    regexp_match(p.source_url, '/p/(MLB[0-9]{6,12})', 'i') as catalog_match,
    regexp_match(p.source_url, '/MLB-([0-9]{6,12})', 'i') as item_match,
    case
      when p.affiliate_link ~* '^https?://(www\.)?mercadolivre\.com/sec/' then 1
      when p.affiliate_link ~* '[?&]matt_tool=38524122([&#]|$)' then 1
      when p.source_url ~* '[?&]matt_tool=38524122([&#]|$)' then 1
      else 0
    end as has_affiliate_tracking,
    case
      when p.is_featured is true then 1
      when coalesce(p.description_manual_override, false) is true then 1
      when p.affiliate_link ~* '^https?://(www\.)?mercadolivre\.com/sec/' then 1
      when coalesce(p.source_url, '') ~* '(origin=share|sid=share|origin%3dshare|sid%3dshare)' then 1
      when coalesce(p.affiliate_link, '') ~* '(origin=share|sid=share|origin%3dshare|sid%3dshare)' then 1
      else 0
    end as is_curated_pinned
  from public.products p
  where p.marketplace = 'mercadolivre'
    and (
      p.is_active is true
      or p.is_featured is true
      or coalesce(p.description_manual_override, false) is true
      or p.affiliate_link ~* '^https?://(www\.)?mercadolivre\.com/sec/'
      or coalesce(p.source_url, '') ~* '(origin=share|sid=share|origin%3dshare|sid%3dshare)'
      or coalesce(p.affiliate_link, '') ~* '(origin=share|sid=share|origin%3dshare|sid%3dshare)'
    )
),
pre_rank as (
  select
    b.*,
    coalesce(
      upper((b.catalog_match)[1]),
      case when (b.item_match)[1] is not null then 'MLB' || (b.item_match)[1] end,
      upper(nullif(b.external_id, '')),
      md5(lower(coalesce(b.name, '')))
    ) as canonical_key
  from base b
),
ranked as (
  select
    pr.*,
    row_number() over (
      partition by pr.canonical_key
      order by
        pr.is_curated_pinned desc,
        pr.is_featured desc,
        pr.has_affiliate_tracking desc,
        coalesce(nullif(pr.pix_price, 0), pr.price) asc nulls last,
        pr.updated_at desc nulls last,
        pr.created_at desc nulls last,
        pr.id
    ) as rn
  from pre_rank pr
)
update public.products p
set
  is_active = true,
  status = 'active'
from ranked r
where p.id = r.id
  and r.rn = 1
  and (p.is_active is distinct from true or p.status <> 'active');
