begin;

create table if not exists public.discovery_products (
  id uuid primary key default gen_random_uuid(),
  marketplace text not null default 'mercadolivre',
  external_product_id text not null,
  title text not null,
  category text null,
  seller text null,
  seller_reputation text null,
  affiliate_link text null,
  product_url text null,
  current_price numeric(12,2) null,
  original_price numeric(12,2) null,
  discount_percent numeric(6,2) null,
  sold_quantity integer null,
  reviews_count integer null,
  rating numeric(4,2) null,
  stock integer null,
  favorites_count integer null,
  source_terms text[] not null default '{}',
  matched_terms_count integer not null default 0,
  last_collected_at timestamptz not null default now(),
  opportunity_score integer not null default 0,
  viral_score integer not null default 0,
  score_components jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_products_unique_marketplace_external
    unique (marketplace, external_product_id)
);

create index if not exists idx_discovery_products_scores_updated
  on public.discovery_products (opportunity_score desc, viral_score desc, updated_at desc);

create index if not exists idx_discovery_products_collected
  on public.discovery_products (last_collected_at desc);

create table if not exists public.discovery_product_metrics (
  id bigserial primary key,
  discovery_product_id uuid not null references public.discovery_products(id) on delete cascade,
  marketplace text not null default 'mercadolivre',
  external_product_id text not null,
  captured_at timestamptz not null default now(),
  current_price numeric(12,2) null,
  original_price numeric(12,2) null,
  discount_percent numeric(6,2) null,
  sold_quantity integer null,
  reviews_count integer null,
  rating numeric(4,2) null,
  stock integer null,
  favorites_count integer null,
  opportunity_score integer not null default 0,
  viral_score integer not null default 0,
  opportunity_components jsonb not null default '{}'::jsonb,
  viral_components jsonb not null default '{}'::jsonb,
  raw_signal jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_discovery_product_metrics_product_time
  on public.discovery_product_metrics (discovery_product_id, captured_at desc);

create index if not exists idx_discovery_product_metrics_external_time
  on public.discovery_product_metrics (marketplace, external_product_id, captured_at desc);

create table if not exists public.discovery_price_history (
  id bigserial primary key,
  marketplace text not null default 'mercadolivre',
  external_product_id text not null,
  discovery_product_id uuid null references public.discovery_products(id) on delete set null,
  captured_at timestamptz not null default now(),
  price numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_discovery_price_history_product_time
  on public.discovery_price_history (marketplace, external_product_id, captured_at desc);

create table if not exists public.discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  marketplace text not null default 'mercadolivre',
  external_product_id text not null,
  discovery_product_id uuid null references public.discovery_products(id) on delete set null,
  title text not null,
  category text null,
  seller text null,
  seller_reputation text null,
  affiliate_link text null,
  product_url text null,
  current_price numeric(12,2) null,
  original_price numeric(12,2) null,
  discount_percent numeric(6,2) null,
  sold_quantity integer null,
  reviews_count integer null,
  rating numeric(4,2) null,
  stock integer null,
  favorites_count integer null,
  opportunity_score integer not null default 0,
  viral_score integer not null default 0,
  signal_origin text not null default 'collector',
  score_components jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  confidence numeric(6,3) not null default 0,
  notes text null,
  first_detected_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_candidates_status_check
    check (status in ('new', 'reviewing', 'approved', 'rejected', 'saved')),
  constraint discovery_candidates_unique_marketplace_external
    unique (marketplace, external_product_id)
);

create index if not exists idx_discovery_candidates_status_scores
  on public.discovery_candidates (status, opportunity_score desc, viral_score desc, updated_at desc);

create table if not exists public.discovery_candidate_events (
  id bigserial primary key,
  candidate_id uuid not null references public.discovery_candidates(id) on delete cascade,
  event_type text not null,
  previous_status text null,
  next_status text null,
  event_payload jsonb not null default '{}'::jsonb,
  actor text null,
  created_at timestamptz not null default now(),
  constraint discovery_candidate_events_type_check
    check (event_type in ('reviewing', 'approved', 'rejected', 'saved', 'auto_filtered'))
);

create index if not exists idx_discovery_candidate_events_candidate_time
  on public.discovery_candidate_events (candidate_id, created_at desc);

create table if not exists public.seo_generated_pages (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid null references public.discovery_candidates(id) on delete set null,
  marketplace text not null default 'mercadolivre',
  external_product_id text not null,
  slug text not null,
  title text not null,
  meta_description text not null,
  seo_description text not null,
  faq_json jsonb not null default '[]'::jsonb,
  schema_json jsonb not null default '{}'::jsonb,
  affiliate_link text null,
  publication_status text not null default 'draft',
  published_product_id uuid null references public.products(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seo_generated_pages_status_check
    check (publication_status in ('draft', 'published', 'archived')),
  constraint seo_generated_pages_slug_unique unique (slug)
);

create index if not exists idx_seo_generated_pages_candidate
  on public.seo_generated_pages (candidate_id, created_at desc);

create table if not exists public.discovery_alerts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid null references public.discovery_candidates(id) on delete set null,
  marketplace text not null default 'mercadolivre',
  external_product_id text not null,
  alert_type text not null,
  severity text not null default 'info',
  status text not null default 'new',
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_alerts_type_check
    check (alert_type in ('absurd_discount', 'high_viral_score', 'pipeline_issue')),
  constraint discovery_alerts_severity_check
    check (severity in ('info', 'warning', 'critical')),
  constraint discovery_alerts_status_check
    check (status in ('new', 'acknowledged', 'resolved'))
);

create index if not exists idx_discovery_alerts_status_created
  on public.discovery_alerts (status, created_at desc);

create table if not exists public.discovery_job_locks (
  job_name text primary key,
  locked_until timestamptz not null,
  locked_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_discovery_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_discovery_products_updated_at on public.discovery_products;
create trigger trg_discovery_products_updated_at
before update on public.discovery_products
for each row execute function public.set_discovery_updated_at();

drop trigger if exists trg_discovery_candidates_updated_at on public.discovery_candidates;
create trigger trg_discovery_candidates_updated_at
before update on public.discovery_candidates
for each row execute function public.set_discovery_updated_at();

drop trigger if exists trg_seo_generated_pages_updated_at on public.seo_generated_pages;
create trigger trg_seo_generated_pages_updated_at
before update on public.seo_generated_pages
for each row execute function public.set_discovery_updated_at();

drop trigger if exists trg_discovery_alerts_updated_at on public.discovery_alerts;
create trigger trg_discovery_alerts_updated_at
before update on public.discovery_alerts
for each row execute function public.set_discovery_updated_at();

drop trigger if exists trg_discovery_job_locks_updated_at on public.discovery_job_locks;
create trigger trg_discovery_job_locks_updated_at
before update on public.discovery_job_locks
for each row execute function public.set_discovery_updated_at();

alter table public.discovery_products enable row level security;
alter table public.discovery_product_metrics enable row level security;
alter table public.discovery_price_history enable row level security;
alter table public.discovery_candidates enable row level security;
alter table public.discovery_candidate_events enable row level security;
alter table public.seo_generated_pages enable row level security;
alter table public.discovery_alerts enable row level security;

create policy discovery_products_admin_select on public.discovery_products
for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy discovery_products_admin_write on public.discovery_products
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy discovery_product_metrics_admin_select on public.discovery_product_metrics
for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy discovery_price_history_admin_select on public.discovery_price_history
for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy discovery_candidates_admin_all on public.discovery_candidates
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy discovery_candidate_events_admin_all on public.discovery_candidate_events
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy seo_generated_pages_admin_all on public.seo_generated_pages
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy discovery_alerts_admin_all on public.discovery_alerts
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

commit;
