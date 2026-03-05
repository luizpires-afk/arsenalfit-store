begin;

create extension if not exists pgcrypto;

create table if not exists public.product_content_ai (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  seo_title text not null,
  meta_description text not null,
  long_description text not null,
  bullet_points jsonb not null default '[]'::jsonb,
  faq jsonb not null default '[]'::jsonb,
  schema_markup jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  constraint product_content_ai_product_unique unique (product_id)
);

create index if not exists idx_product_content_ai_product_id
  on public.product_content_ai (product_id);

create index if not exists idx_product_content_ai_generated_at
  on public.product_content_ai (generated_at desc);

create index if not exists idx_product_content_ai_schema_gin
  on public.product_content_ai using gin (schema_markup);

commit;
