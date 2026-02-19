-- Backfill Mercado Livre affiliate links with official matt_tool parameter
-- when affiliate_link is missing or untracked.

update public.products
set
  affiliate_link = case
    when source_url ~* '[?&]matt_tool=38524122([&#]|$)' then source_url
    when position('?' in source_url) > 0 then source_url || '&matt_tool=38524122'
    else source_url || '?matt_tool=38524122'
  end,
  affiliate_verified = true,
  affiliate_generated_at = coalesce(affiliate_generated_at, now())
where marketplace = 'mercadolivre'
  and source_url is not null
  and btrim(source_url) <> ''
  and (
    affiliate_link is null
    or btrim(affiliate_link) = ''
    or affiliate_link = source_url
    or (
      affiliate_link !~* '^https?://mercadolivre\\.com/sec/'
      and affiliate_link !~* '[?&]matt_tool=38524122([&#]|$)'
    )
  );
