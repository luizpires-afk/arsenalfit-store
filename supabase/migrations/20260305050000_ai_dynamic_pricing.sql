begin;

create extension if not exists pgcrypto;

create table if not exists public.product_price_intelligence (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  market_avg_price numeric(12,2) not null default 0,
  competitor_min_price numeric(12,2) not null default 0,
  competitor_max_price numeric(12,2) not null default 0,
  demand_score numeric(12,6) not null default 0,
  elasticity_score numeric(12,6) not null default 0,
  optimal_price numeric(12,2) not null default 0,
  pricing_strategy text not null default 'competitive_price',
  updated_at timestamptz not null default now(),
  constraint product_price_intelligence_product_unique unique (product_id)
);

create index if not exists idx_product_price_intelligence_product_id
  on public.product_price_intelligence (product_id);

create index if not exists idx_product_price_intelligence_optimal_price
  on public.product_price_intelligence (optimal_price desc);

create index if not exists idx_product_price_intelligence_strategy
  on public.product_price_intelligence (pricing_strategy);

create index if not exists idx_products_rank_score_perf
  on public.products (rank_score desc)
  where removed_at is null;

create index if not exists idx_products_trend_score_perf
  on public.products (trend_score desc)
  where removed_at is null;

create index if not exists idx_products_conversion_score_perf
  on public.products (conversion_score desc)
  where removed_at is null;

commit;
