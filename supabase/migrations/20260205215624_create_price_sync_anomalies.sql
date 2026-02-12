create table if not exists public.price_sync_anomalies (
  id uuid primary key default gen_random_uuid(),
  run_id uuid null,
  product_id uuid not null,
  marketplace text null,
  external_id text null,
  catalog_id text null,
  preferred_item_id text null,
  source_url text null,
  affiliate_link text null,
  price_from_catalog numeric null,
  price_from_item numeric null,
  note text null,
  detected_at timestamptz not null default now()
);

alter table public.price_sync_anomalies
  add constraint price_sync_anomalies_product_fk
  foreign key (product_id)
  references public.products (id)
  on delete cascade;

create index if not exists idx_price_sync_anomalies_detected_at
  on public.price_sync_anomalies (detected_at desc);
create index if not exists idx_price_sync_anomalies_product_id
  on public.price_sync_anomalies (product_id);
create index if not exists idx_price_sync_anomalies_run_id
  on public.price_sync_anomalies (run_id);

alter table public.price_sync_anomalies enable row level security;

create policy "Admins can view price sync anomalies"
  on public.price_sync_anomalies
  for select
  using (
    exists (
      select 1
      from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

create policy "Service role manage price sync anomalies"
  on public.price_sync_anomalies
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
