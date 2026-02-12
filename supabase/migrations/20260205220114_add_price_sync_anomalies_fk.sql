alter table public.price_sync_anomalies
  add constraint price_sync_anomalies_product_fk
  foreign key (product_id)
  references public.products (id)
  on delete cascade;
