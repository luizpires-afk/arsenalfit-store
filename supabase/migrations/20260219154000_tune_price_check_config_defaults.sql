-- Tune price-check defaults for safer Mercado Livre polling cadence.

alter table public.price_check_config
  alter column ttl_high_minutes set default 120,
  alter column ttl_med_minutes set default 720,
  alter column ttl_low_minutes set default 2160,
  alter column min_interval_seconds set default 12,
  alter column max_interval_seconds set default 20,
  alter column stale_threshold_minutes set default 360;

update public.price_check_config
set
  ttl_high_minutes = 120,
  ttl_med_minutes = 720,
  ttl_low_minutes = 2160,
  min_interval_seconds = 12,
  max_interval_seconds = 20,
  stale_threshold_minutes = 360,
  updated_at = now()
where id = true;
