begin;

create table if not exists public.viral_signals (
  id bigserial primary key,
  round_id text not null,
  marketplace text not null default 'mercadolivre',
  external_product_id text not null,
  discovery_product_id uuid null references public.discovery_products(id) on delete set null,
  candidate_id uuid null references public.discovery_candidates(id) on delete set null,
  signal_window text not null default '1d',
  signal_payload jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint viral_signals_window_check
    check (signal_window in ('1d', '3d', '7d', '30d')),
  constraint viral_signals_round_product_window_unique
    unique (round_id, marketplace, external_product_id, signal_window)
);

create index if not exists idx_viral_signals_product_collected
  on public.viral_signals (marketplace, external_product_id, collected_at desc);

create index if not exists idx_viral_signals_candidate_collected
  on public.viral_signals (candidate_id, collected_at desc);

create table if not exists public.trend_keywords (
  id bigserial primary key,
  keyword text not null,
  normalized_keyword text not null,
  source text not null default 'internal',
  marketplace text not null default 'mercadolivre',
  category text null,
  trend_score numeric(8,3) not null default 0,
  growth_1d numeric(8,3) not null default 0,
  growth_3d numeric(8,3) not null default 0,
  growth_7d numeric(8,3) not null default 0,
  growth_30d numeric(8,3) not null default 0,
  serp_signal_score numeric(8,3) not null default 0,
  emerging boolean not null default false,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trend_keywords_source_check
    check (source in ('internal', 'google_trends', 'tiktok', 'instagram', 'youtube', 'reddit', 'merged')),
  constraint trend_keywords_growth_range_check
    check (
      growth_1d >= -100 and growth_1d <= 10000 and
      growth_3d >= -100 and growth_3d <= 10000 and
      growth_7d >= -100 and growth_7d <= 10000 and
      growth_30d >= -100 and growth_30d <= 10000
    )
);

create index if not exists idx_trend_keywords_normalized_observed
  on public.trend_keywords (normalized_keyword, observed_at desc);

create index if not exists idx_trend_keywords_emerging_score
  on public.trend_keywords (emerging desc, trend_score desc, observed_at desc);

create table if not exists public.product_trend_history (
  id bigserial primary key,
  marketplace text not null default 'mercadolivre',
  external_product_id text not null,
  discovery_product_id uuid null references public.discovery_products(id) on delete set null,
  captured_at timestamptz not null default now(),
  sales_count integer null,
  reviews_count integer null,
  questions_count integer null,
  favorites_count integer null,
  stock integer null,
  category_rank integer null,
  search_trend_score numeric(8,3) null,
  social_mentions integer null,
  engagement_score numeric(8,3) null,
  signal_confidence numeric(6,3) not null default 0,
  raw_signal jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_trend_history_product_time
  on public.product_trend_history (marketplace, external_product_id, captured_at desc);

create index if not exists idx_product_trend_history_discovery_time
  on public.product_trend_history (discovery_product_id, captured_at desc);

create table if not exists public.viral_scores (
  id bigserial primary key,
  round_id text not null,
  marketplace text not null default 'mercadolivre',
  external_product_id text not null,
  discovery_product_id uuid null references public.discovery_products(id) on delete set null,
  candidate_id uuid null references public.discovery_candidates(id) on delete set null,
  score_version text not null,
  score numeric(8,3) not null,
  reliability_penalty numeric(8,3) not null default 0,
  score_components jsonb not null default '{}'::jsonb,
  decision_reason text not null default '',
  windows jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint viral_scores_round_product_unique
    unique (round_id, marketplace, external_product_id),
  constraint viral_scores_score_check
    check (score >= 0 and score <= 100)
);

create index if not exists idx_viral_scores_score_updated
  on public.viral_scores (score desc, updated_at desc);

create index if not exists idx_viral_scores_candidate_updated
  on public.viral_scores (candidate_id, updated_at desc);

alter table public.discovery_product_metrics
  add column if not exists viral_momentum_score numeric(8,3) null,
  add column if not exists score_version text null;

alter table public.discovery_candidates
  add column if not exists viral_momentum_score numeric(8,3) null,
  add column if not exists score_version text null,
  add column if not exists score_decision_reason text null;

create index if not exists idx_discovery_candidates_viral_momentum
  on public.discovery_candidates (status, viral_momentum_score desc, updated_at desc);

create or replace function public.set_viral_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_viral_signals_updated_at on public.viral_signals;
create trigger trg_viral_signals_updated_at
before update on public.viral_signals
for each row execute function public.set_viral_updated_at();

drop trigger if exists trg_trend_keywords_updated_at on public.trend_keywords;
create trigger trg_trend_keywords_updated_at
before update on public.trend_keywords
for each row execute function public.set_viral_updated_at();

drop trigger if exists trg_viral_scores_updated_at on public.viral_scores;
create trigger trg_viral_scores_updated_at
before update on public.viral_scores
for each row execute function public.set_viral_updated_at();

alter table public.viral_signals enable row level security;
alter table public.trend_keywords enable row level security;
alter table public.product_trend_history enable row level security;
alter table public.viral_scores enable row level security;

create policy viral_signals_admin_all on public.viral_signals
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy trend_keywords_admin_all on public.trend_keywords
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy product_trend_history_admin_all on public.product_trend_history
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy viral_scores_admin_all on public.viral_scores
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

commit;
