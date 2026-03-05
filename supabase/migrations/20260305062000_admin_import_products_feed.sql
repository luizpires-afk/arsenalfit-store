begin;

create table if not exists public.product_catalog_data (
  id uuid primary key default gen_random_uuid(),
  product_id uuid null references public.products(id) on delete set null,
  ml_item_id text not null,
  source_url text null,
  affiliate_url text null,
  title text null,
  price numeric(12,2) null,
  image text null,
  seller text null,
  rating numeric(6,3) null,
  review_count integer null,
  stock integer null,
  category text null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_product_catalog_data_ml_item_id
  on public.product_catalog_data (ml_item_id);

create index if not exists idx_product_catalog_data_product_id
  on public.product_catalog_data (product_id);

alter table public.product_catalog_data enable row level security;

drop policy if exists product_catalog_data_admin_select on public.product_catalog_data;
create policy product_catalog_data_admin_select
on public.product_catalog_data
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists product_catalog_data_admin_insert on public.product_catalog_data;
create policy product_catalog_data_admin_insert
on public.product_catalog_data
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists product_catalog_data_admin_update on public.product_catalog_data;
create policy product_catalog_data_admin_update
on public.product_catalog_data
for update
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.set_product_catalog_data_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_product_catalog_data_updated_at on public.product_catalog_data;
create trigger trg_product_catalog_data_updated_at
before update on public.product_catalog_data
for each row execute function public.set_product_catalog_data_updated_at();

create or replace function public.notify_catalog_ingest_auto_from_products()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_notify(
    'catalog_ingest_auto',
    json_build_object(
      'source', 'admin_import',
      'product_id', new.id,
      'ml_item_id', new.ml_item_id,
      'source_url', new.source_url,
      'affiliate_url', new.affiliate_link,
      'triggered_at', now()
    )::text
  );
  return new;
end;
$$;

drop trigger if exists trg_catalog_ingest_auto_products_insert on public.products;
create trigger trg_catalog_ingest_auto_products_insert
after insert on public.products
for each row
when (
  new.marketplace = 'mercadolivre'
  and lower(coalesce(new.status, '')) in ('pending_validation', 'pending_validacao')
)
execute function public.notify_catalog_ingest_auto_from_products();

create or replace function public.trigger_catalog_ingest_auto()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;

  perform pg_notify(
    'catalog_ingest_auto',
    json_build_object(
      'source', 'admin_manual_trigger',
      'triggered_at', now()
    )::text
  );

  return jsonb_build_object('ok', true, 'triggered_at', now());
end;
$$;

grant execute on function public.trigger_catalog_ingest_auto() to authenticated;

commit;
