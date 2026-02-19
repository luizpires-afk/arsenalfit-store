-- Product curation metadata for catalog-ingest v2 hardening.

alter table public.products
  add column if not exists image_url_original text,
  add column if not exists image_url_cached text,
  add column if not exists affiliate_verified boolean not null default false,
  add column if not exists affiliate_generated_at timestamptz,
  add column if not exists last_ml_description_hash text,
  add column if not exists description_last_synced_at timestamptz,
  add column if not exists description_manual_override boolean not null default false,
  add column if not exists quality_issues text[] not null default '{}'::text[],
  add column if not exists curation_badges text[] not null default '{}'::text[];

comment on column public.products.image_url_original is 'Primary official image from marketplace API.';
comment on column public.products.image_url_cached is 'Optional cached CDN image URL.';
comment on column public.products.affiliate_verified is 'True when affiliate link parameters were validated.';
comment on column public.products.affiliate_generated_at is 'Timestamp when affiliate link was generated/updated.';
comment on column public.products.last_ml_description_hash is 'Hash of the last cleaned marketplace description saved by ingest.';
comment on column public.products.description_last_synced_at is 'Timestamp of last automatic description sync.';
comment on column public.products.description_manual_override is 'Set true when description is manually edited outside service_role.';
comment on column public.products.quality_issues is 'Quality checklist issues; empty array means publishable.';
comment on column public.products.curation_badges is 'Computed curation badges for UI ordering/highlights.';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'products_status_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products drop constraint products_status_check;
  end if;

  alter table public.products
    add constraint products_status_check
    check (status in ('active', 'out_of_stock', 'paused', 'standby'));
exception
  when duplicate_object then null;
end $$;

create or replace function public.mark_product_description_manual_override()
returns trigger
language plpgsql
as $$
declare
  claim_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if new.description is distinct from old.description
    or new.short_description is distinct from old.short_description then
    if claim_role <> 'service_role' then
      new.description_manual_override := true;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_products_description_manual_override on public.products;
create trigger trg_products_description_manual_override
before update on public.products
for each row execute function public.mark_product_description_manual_override();

create index if not exists products_affiliate_verified_idx
  on public.products (affiliate_verified);

create index if not exists products_description_manual_override_idx
  on public.products (description_manual_override);
