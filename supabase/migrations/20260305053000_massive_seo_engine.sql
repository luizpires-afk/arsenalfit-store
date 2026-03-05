begin;

create extension if not exists pgcrypto;

create table if not exists public.seo_keyword_universe (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  search_volume integer not null default 0,
  keyword_difficulty numeric(12,6) not null default 0,
  intent text not null,
  cluster text not null,
  created_at timestamptz not null default now(),
  constraint seo_keyword_universe_keyword_unique unique (keyword)
);

create index if not exists idx_seo_keyword_universe_keyword
  on public.seo_keyword_universe (keyword);

create index if not exists idx_seo_keyword_universe_intent
  on public.seo_keyword_universe (intent);

create index if not exists idx_seo_keyword_universe_cluster
  on public.seo_keyword_universe (cluster);

create index if not exists idx_seo_keyword_universe_volume
  on public.seo_keyword_universe (search_volume desc);

create index if not exists idx_seo_pages_keyword_perf
  on public.seo_pages (keyword);

create index if not exists idx_seo_page_products_product_id_perf
  on public.seo_page_products (product_id);

commit;
