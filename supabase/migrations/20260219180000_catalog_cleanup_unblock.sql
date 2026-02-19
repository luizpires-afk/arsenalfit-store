-- Catalog cleanup and unblock metadata.
alter table public.products
  add column if not exists data_health_status text not null default 'HEALTHY',
  add column if not exists deactivation_reason text,
  add column if not exists last_health_check_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_data_health_status_check'
  ) then
    alter table public.products
      add constraint products_data_health_status_check
      check (
        data_health_status in (
          'HEALTHY',
          'DUPLICATE',
          'INVALID_SOURCE',
          'API_MISSING',
          'SCRAPE_FAILED',
          'SUSPECT_PRICE',
          'NEEDS_REVIEW'
        )
      );
  end if;
end $$;

create index if not exists idx_products_health_status
  on public.products (data_health_status, is_active, marketplace);

create index if not exists idx_products_last_health_check
  on public.products (last_health_check_at desc);

create table if not exists public.catalog_cleanup_runs (
  id uuid primary key,
  source text not null default 'catalog_cleanup_and_unblock',
  dry_run boolean not null default true,
  status text not null default 'success',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  report jsonb,
  error text,
  created_at timestamptz not null default now(),
  check (status in ('success', 'failed'))
);

create table if not exists public.catalog_cleanup_actions (
  id bigserial primary key,
  run_id uuid not null references public.catalog_cleanup_runs(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  external_id text,
  action text not null,
  reason text,
  before_status text,
  before_is_active boolean,
  after_status text,
  after_is_active boolean,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_catalog_cleanup_actions_run
  on public.catalog_cleanup_actions (run_id, created_at desc);

create index if not exists idx_catalog_cleanup_actions_product
  on public.catalog_cleanup_actions (product_id, created_at desc);

alter table public.catalog_cleanup_runs enable row level security;
alter table public.catalog_cleanup_actions enable row level security;

drop policy if exists "catalog_cleanup_runs_service_manage" on public.catalog_cleanup_runs;
create policy "catalog_cleanup_runs_service_manage"
  on public.catalog_cleanup_runs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "catalog_cleanup_actions_service_manage" on public.catalog_cleanup_actions;
create policy "catalog_cleanup_actions_service_manage"
  on public.catalog_cleanup_actions
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "catalog_cleanup_runs_admin_read" on public.catalog_cleanup_runs;
create policy "catalog_cleanup_runs_admin_read"
  on public.catalog_cleanup_runs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

drop policy if exists "catalog_cleanup_actions_admin_read" on public.catalog_cleanup_actions;
create policy "catalog_cleanup_actions_admin_read"
  on public.catalog_cleanup_actions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );
