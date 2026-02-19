-- Backfill curation metadata for existing Mercado Livre products.

update public.products
set image_url_original = image_url
where marketplace = 'mercadolivre'
  and image_url_original is null
  and image_url is not null
  and btrim(image_url) <> '';

update public.products
set affiliate_generated_at = coalesce(affiliate_generated_at, now())
where marketplace = 'mercadolivre'
  and affiliate_link is not null
  and btrim(affiliate_link) <> '';

update public.products
set affiliate_verified = true
where marketplace = 'mercadolivre'
  and affiliate_link is not null
  and btrim(affiliate_link) <> ''
  and affiliate_link ~* '^https?://';
