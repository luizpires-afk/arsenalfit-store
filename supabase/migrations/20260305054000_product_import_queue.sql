begin;

create extension if not exists pgcrypto;

create table if not exists public.product_import_queue (
  id uuid primary key default gen_random_uuid(),
  product_url text not null,
  affiliate_url text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists idx_product_import_queue_status_created
  on public.product_import_queue (status, created_at desc);

create or replace function public.notify_catalog_ingest_auto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_notify(
    'catalog_ingest_auto',
    json_build_object(
      'queue_id', new.id,
      'product_url', new.product_url,
      'affiliate_url', new.affiliate_url,
      'status', new.status,
      'created_at', new.created_at
    )::text
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_catalog_ingest_auto on public.product_import_queue;
create trigger trg_notify_catalog_ingest_auto
after insert on public.product_import_queue
for each row execute function public.notify_catalog_ingest_auto();

alter table public.product_import_queue enable row level security;

drop policy if exists product_import_queue_admin_select on public.product_import_queue;
create policy product_import_queue_admin_select
on public.product_import_queue
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists product_import_queue_admin_insert on public.product_import_queue;
create policy product_import_queue_admin_insert
on public.product_import_queue
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'));

commit;
