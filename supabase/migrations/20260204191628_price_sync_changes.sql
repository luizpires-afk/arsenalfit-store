-- Tabela para registrar mudanças de preço (relatório diário)
create table if not exists public.price_sync_changes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  product_id uuid not null references public.products(id) on delete cascade,
  marketplace text,
  external_id text,
  old_price numeric,
  new_price numeric not null,
  discount_percentage integer,
  is_on_sale boolean,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists idx_price_sync_changes_created_at on public.price_sync_changes (created_at);
create index if not exists idx_price_sync_changes_product_id on public.price_sync_changes (product_id);
create index if not exists idx_price_sync_changes_run_id on public.price_sync_changes (run_id);

alter table public.price_sync_changes enable row level security;

drop policy if exists "Admins can view price sync changes" on public.price_sync_changes;
create policy "Admins can view price sync changes"
  on public.price_sync_changes
  for select
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Service role manage price sync changes" on public.price_sync_changes;
create policy "Service role manage price sync changes"
  on public.price_sync_changes
  for all
  to service_role
  using (true)
  with check (true);
