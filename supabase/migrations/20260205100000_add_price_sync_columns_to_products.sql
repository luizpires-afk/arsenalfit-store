-- Columns required by price sync/update pipeline

alter table public.products
  add column if not exists status text default 'active',
  add column if not exists next_check_at timestamptz default now(),
  add column if not exists detected_price numeric,
  add column if not exists detected_at timestamptz;

update public.products
  set status = 'active'
  where status is null;

update public.products
  set next_check_at = now()
  where next_check_at is null;

alter table public.products
  alter column status set not null,
  alter column next_check_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_status_check'
  ) then
    alter table public.products
      add constraint products_status_check
      check (status in ('active', 'out_of_stock', 'paused'));
  end if;
end $$;

create index if not exists idx_products_next_check_at
  on public.products (next_check_at);

create index if not exists idx_products_marketplace_status
  on public.products (marketplace, status);
