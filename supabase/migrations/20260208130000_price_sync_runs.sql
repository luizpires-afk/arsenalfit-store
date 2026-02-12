create extension if not exists "pgcrypto";

create table if not exists public.price_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  total_produtos integer not null default 0,
  total_verificados integer not null default 0,
  total_skipped integer not null default 0,
  total_200 integer not null default 0,
  total_304 integer not null default 0,
  total_403 integer not null default 0,
  total_404 integer not null default 0,
  total_429 integer not null default 0,
  total_timeout integer not null default 0,
  total_erros_desconhecidos integer not null default 0,
  total_price_changes integer not null default 0,
  note text
);

create index if not exists price_sync_runs_started_at_idx
  on public.price_sync_runs (started_at desc);

alter table public.price_sync_runs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'price_sync_runs'
      and policyname = 'read price_sync_runs'
  ) then
    create policy "read price_sync_runs"
      on public.price_sync_runs
      for select
      to authenticated
      using (true);
  end if;
end $$;
