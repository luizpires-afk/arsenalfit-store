-- Ensure matt_tool is always in query-string (before hash fragment),
-- preserving existing source_url fragments and sec short links.

with normalized as (
  select
    p.id,
    case
      when split_part(p.source_url, '#', 1) ~* '[?&]matt_tool=38524122([&#]|$)' then split_part(p.source_url, '#', 1)
      when position('?' in split_part(p.source_url, '#', 1)) > 0 then split_part(p.source_url, '#', 1) || '&matt_tool=38524122'
      else split_part(p.source_url, '#', 1) || '?matt_tool=38524122'
    end as normalized_head,
    nullif(split_part(p.source_url, '#', 2), '') as normalized_fragment
  from public.products p
  where p.marketplace = 'mercadolivre'
    and p.source_url is not null
    and btrim(p.source_url) <> ''
    and (
      p.affiliate_link is null
      or p.affiliate_link !~* '^https?://(www\\.)?mercadolivre\\.com/sec/'
    )
)
update public.products p
set
  affiliate_link = case
    when n.normalized_fragment is not null then n.normalized_head || '#' || n.normalized_fragment
    else n.normalized_head
  end,
  affiliate_verified = true,
  affiliate_generated_at = coalesce(p.affiliate_generated_at, now())
from normalized n
where p.id = n.id;
