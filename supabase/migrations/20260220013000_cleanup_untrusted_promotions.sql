-- Prevent stale promotion artifacts when last price source is non-trusted.
-- For Mercado Livre rows resolved via scraper/catalog, keep only the final price.

update public.products
set
  original_price = null,
  discount_percentage = 0,
  is_on_sale = false,
  updated_at = now()
where marketplace = 'mercadolivre'
  and lower(coalesce(last_price_source, '')) in ('scraper', 'catalog')
  and (
    original_price is not null
    or coalesce(discount_percentage, 0) <> 0
    or coalesce(is_on_sale, false) = true
  );

