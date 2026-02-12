create extension if not exists pg_trgm;

create or replace function public.search_products(
  q text,
  limit_count int default 7,
  synonyms text[] default '{}'::text[]
)
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
  with terms as (
    select distinct trim(t) as term
    from unnest(array_cat(array[q], coalesce(synonyms, '{}'::text[]))) t
    where length(trim(t)) > 0
  ),
  tsq as (
    select case
      when count(*) = 0 then null
      else to_tsquery(
        'portuguese',
        string_agg(
          regexp_replace(lower(term), '[^a-z0-9áàãâéèêíïóôõöúç]+', ' ', 'g'),
          ' | '
        )
      )
    end as query
    from terms
  ),
  base as (
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
      p.description,
      c.name as category_name,
      public.products_search_vector(p.name, p.advantages, p.description) as document
    from public.products p
    left join public.categories c on c.id = p.category_id
    where (p.is_active is null or p.is_active = true)
  ),
  ranked as (
    select
      base.*,
      ts_rank_cd(base.document, tsq.query) as rank,
      (select max(similarity(base.name, term)) from terms) as name_sim,
      (select max(similarity(coalesce(base.description, ''), term)) from terms) as desc_sim,
      (select max(similarity(coalesce(base.category_name, ''), term)) from terms) as category_sim
    from base, tsq
    where tsq.query is not null
      and (
        base.document @@ tsq.query
        or exists (select 1 from terms t where similarity(base.name, t.term) > 0.2)
        or exists (select 1 from terms t where similarity(coalesce(base.description, ''), t.term) > 0.2)
        or exists (select 1 from terms t where similarity(coalesce(base.category_name, ''), t.term) > 0.2)
      )
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
  order by
    (rank * 2) +
    greatest(coalesce(name_sim, 0), coalesce(desc_sim, 0)) +
    coalesce(category_sim, 0) * 0.6 desc,
    is_on_sale desc,
    clicks_count desc nulls last
  limit limit_count;
$$;

create or replace function public.suggest_search_term(q text)
returns text
language sql
stable
as $$
  select name
  from public.products
  where q is not null
    and length(trim(q)) > 0
    and similarity(name, q) > 0.25
  order by similarity(name, q) desc
  limit 1;
$$;

create index if not exists products_name_trgm_idx on public.products using gin (name gin_trgm_ops);
create index if not exists products_description_trgm_idx on public.products using gin (description gin_trgm_ops);
create index if not exists categories_name_trgm_idx on public.categories using gin (name gin_trgm_ops);
