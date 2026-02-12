create table if not exists public.price_sync_reports (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  recipients text[] not null,
  total integer not null default 0,
  drops integer not null default 0,
  increases integer not null default 0,
  promos integer not null default 0,
  status text not null default 'sent',
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_price_sync_reports_sent_at
  on public.price_sync_reports (sent_at desc);

alter table public.price_sync_reports enable row level security;

drop policy if exists "Admins can view price sync reports" on public.price_sync_reports;
create policy "Admins can view price sync reports"
  on public.price_sync_reports
  for select
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Service role manage price sync reports" on public.price_sync_reports;
create policy "Service role manage price sync reports"
  on public.price_sync_reports
  for all
  to service_role
  using (true)
  with check (true);
