-- Normalize ML inactive status and force next ingest to refresh full descriptions.

update public.products
set status = 'standby'
where marketplace = 'mercadolivre'
  and coalesce(is_active, false) = false
  and coalesce(status, '') in ('', 'active', 'paused', 'out_of_stock');

update public.products
set
  last_ml_description_hash = null,
  description_last_synced_at = null
where marketplace = 'mercadolivre';
