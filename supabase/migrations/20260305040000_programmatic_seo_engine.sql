begin;

create table if not exists public.seo_pages (
  id bigserial primary key,
  slug text not null,
  title text not null,
  description text not null,
  keyword text not null,
  search_intent text not null,
  meta_title text,
  meta_description text,
  seo_keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_active boolean not null default true,
  constraint seo_pages_slug_unique unique (slug)
);

create table if not exists public.seo_page_products (
  page_id bigint not null references public.seo_pages(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  position integer not null,
  created_at timestamptz not null default now(),
  primary key (page_id, product_id)
);

create table if not exists public.seo_page_metrics (
  page_id bigint primary key references public.seo_pages(id) on delete cascade,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  ctr numeric(12,6) not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_seo_pages_slug on public.seo_pages (slug);
create index if not exists idx_seo_pages_keyword on public.seo_pages (keyword);
create index if not exists idx_seo_pages_search_intent on public.seo_pages (search_intent);

create index if not exists idx_seo_page_products_product_id on public.seo_page_products (product_id);
create index if not exists idx_seo_page_products_page_position on public.seo_page_products (page_id, position);

create index if not exists idx_products_rank_score on public.products (rank_score desc) where removed_at is null;
create index if not exists idx_products_profit_score on public.products (profit_score desc) where removed_at is null;
create index if not exists idx_products_visible on public.products (visible) where removed_at is null;

commit;
