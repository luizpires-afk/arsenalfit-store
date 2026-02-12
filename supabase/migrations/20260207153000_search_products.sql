create table if not exists public.search_events (
  id uuid primary key default gen_random_uuid(),
  term text,
  event_type text not null,
  product_id uuid references public.products(id) on delete set null,
  results_count integer,
  created_at timestamptz default now() not null
);

alter table public.search_events enable row level security;

drop policy if exists "Service role manage search events" on public.search_events;
create policy "Service role manage search events"
  on public.search_events
  for all
  to service_role
  using (true)
  with check (true);

create index if not exists idx_search_events_created_at on public.search_events (created_at desc);

create or replace function public.products_search_vector(
  name text,
  advantages text[],
  description text
)
returns tsvector
language sql
immutable
as $$
  select
    setweight(to_tsvector('portuguese', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(array_to_string(advantages, ' '), '')), 'B') ||
    setweight(to_tsvector('portuguese', coalesce(description, '')), 'D');
$$;

create or replace function public.search_products(q text, limit_count int default 7)
returns table (
  id uuid,
  name text,
  slug text,
  price numeric,
  original_price numeric,
  image_url text,
  affiliate_link text,
  is_on_sale boolean,
  clicks_count integer,
  category_id uuid
)
language sql
stable
as $$
  with base as (
    select
      p.id,
      p.name,
      p.slug,
      p.price,
      p.original_price,
      p.image_url,
      p.affiliate_link,
      p.is_on_sale,
      p.clicks_count,
      p.category_id,
      public.products_search_vector(p.name, p.advantages, p.description) as document
    from public.products p
    where (p.is_active is null or p.is_active = true)
  ),
  ranked as (
    select
      *,
      ts_rank_cd(document, plainto_tsquery('portuguese', q)) as rank
    from base
    where q is not null
      and length(trim(q)) > 0
      and (document @@ plainto_tsquery('portuguese', q)
           or name ilike '%' || q || '%')
  )
  select
    id,
    name,
    slug,
    price,
    original_price,
    image_url,
    affiliate_link,
    is_on_sale,
    clicks_count,
    category_id
  from ranked
  order by rank desc, is_on_sale desc, clicks_count desc nulls last
  limit limit_count;
$$;

create index if not exists products_search_idx on public.products using gin (
  public.products_search_vector(name, advantages, description)
);
