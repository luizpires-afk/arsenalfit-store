begin;

create extension if not exists pgcrypto;

create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  platform text not null,
  campaign_name text not null,
  ad_copy text not null,
  target_keywords text[] not null default '{}',
  daily_budget numeric(12,2) not null default 0,
  campaign_score numeric(12,6) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_ad_campaigns_product_id
  on public.ad_campaigns (product_id);

create index if not exists idx_ad_campaigns_platform
  on public.ad_campaigns (platform);

create index if not exists idx_ad_campaigns_campaign_score
  on public.ad_campaigns (campaign_score desc);

create index if not exists idx_products_ads_selection
  on public.products (trend_score desc, profit_score desc, conversion_score desc)
  where removed_at is null;

commit;
