-- Cleanup stale/invalid PIX values from legacy runs.
-- Rules:
-- 1) Always clear invalid PIX (<= 0 or >= standard price).
-- 2) For non-manual sources, clear noisy PIX with tiny discount.
-- 3) For non-manual sources, clear suspiciously low PIX (< 20% of standard).

update public.products
set
  pix_price = null,
  pix_price_source = null,
  pix_price_checked_at = now()
where pix_price is not null
  and price is not null
  and price > 0
  and (
    pix_price <= 0
    or pix_price >= price
    or (
      coalesce(pix_price_source, '') <> 'manual'
      and (
        ((price - pix_price) > 0 and (price - pix_price) < 0.5 and (price - pix_price) / nullif(price, 0) < 0.005)
        or pix_price < (price * 0.2)
      )
    )
  );
