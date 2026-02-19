-- Professional price-check scheduler + queue + state for Mercado Livre sync
-- Adds per-product state, queue worker support, domain throttling/circuit state,
-- on-demand refresh hooks, and metrics/events for observability.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists private;

create table if not exists public.price_check_config (
  id boolean primary key default true,
  ttl_high_minutes integer not null default 90,
  ttl_med_minutes integer not null default 480,
  ttl_low_minutes integer not null default 1440,
  stale_threshold_minutes integer not null default 360,
  min_interval_seconds integer not null default 10,
  max_interval_seconds integer not null default 20,
  max_domain_concurrency integer not null default 2,
  outlier_percent_threshold numeric(6,4) not null default 0.3000,
  outlier_abs_threshold numeric(12,2) not null default 60.00,
  outlier_recheck_minutes integer not null default 10,
  circuit_error_threshold integer not null default 5,
  circuit_open_seconds integer not null default 900,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (ttl_high_minutes > 0),
  check (ttl_med_minutes > 0),
  check (ttl_low_minutes > 0),
  check (min_interval_seconds > 0),
  check (max_interval_seconds >= min_interval_seconds),
  check (max_domain_concurrency >= 1),
  check (outlier_percent_threshold >= 0),
  check (outlier_abs_threshold >= 0),
  check (outlier_recheck_minutes >= 1),
  check (circuit_error_threshold >= 1),
  check (circuit_open_seconds >= 30)
);

insert into public.price_check_config (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.price_check_state (
  product_id uuid primary key references public.products(id) on delete cascade,
  last_checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  last_final_price numeric,
  last_price_source text,
  priority text not null default 'MED',
  fail_count integer not null default 0,
  last_error_code text,
  backoff_until timestamptz,
  stale_ttl_minutes integer not null default 360,
  suspect_price numeric,
  suspect_reason text,
  suspect_detected_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (priority in ('HIGH', 'MED', 'LOW')),
  check (last_price_source is null or last_price_source in ('API_PIX', 'SCRAPER', 'API_BASE')),
  check (fail_count >= 0),
  check (stale_ttl_minutes > 0)
);

create index if not exists idx_price_check_state_due
  on public.price_check_state (next_check_at asc, backoff_until asc, priority asc);

create index if not exists idx_price_check_state_priority
  on public.price_check_state (priority, next_check_at asc);

create table if not exists public.price_check_jobs (
  id bigserial primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  domain text not null default 'mercadolivre.com.br',
  status text not null default 'queued',
  attempts integer not null default 0,
  worker_id uuid,
  queued_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (status in ('queued', 'running', 'done', 'failed')),
  check (attempts >= 0)
);

create unique index if not exists idx_price_check_jobs_product_open
  on public.price_check_jobs (product_id)
  where status in ('queued', 'running');

create index if not exists idx_price_check_jobs_queue
  on public.price_check_jobs (status, available_at asc, queued_at asc);

create index if not exists idx_price_check_jobs_domain
  on public.price_check_jobs (domain, status, available_at asc);

create table if not exists public.price_check_domain_state (
  domain text primary key,
  last_request_at timestamptz,
  consecutive_errors integer not null default 0,
  circuit_open_until timestamptz,
  last_status_code integer,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (consecutive_errors >= 0)
);

create table if not exists public.price_check_events (
  id bigserial primary key,
  run_id uuid,
  job_id bigint references public.price_check_jobs(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  domain text,
  status_code integer,
  raw_api_price numeric,
  raw_api_pix numeric,
  raw_scraped_price numeric,
  final_price numeric,
  final_price_source text,
  duration_ms integer,
  event_status text,
  error_code text,
  created_at timestamptz not null default now(),
  check (final_price_source is null or final_price_source in ('API_PIX', 'SCRAPER', 'API_BASE'))
);

create index if not exists idx_price_check_events_created
  on public.price_check_events (created_at desc);

create index if not exists idx_price_check_events_run
  on public.price_check_events (run_id, created_at desc);

create index if not exists idx_price_check_events_product
  on public.price_check_events (product_id, created_at desc);

create or replace function public.resolve_price_check_priority(
  p_name text,
  p_created_at timestamptz,
  p_is_featured boolean,
  p_clicks_count integer
)
returns text
language sql
stable
as $$
  select case
    when coalesce(p_is_featured, false) then 'HIGH'
    when p_created_at is not null and p_created_at >= (now() - interval '24 hours') then 'HIGH'
    when coalesce(p_clicks_count, 0) >= 80 then 'HIGH'
    when lower(coalesce(p_name, '')) ~ '(whey|creatina|pre treino|suplement)' then 'HIGH'
    when coalesce(p_clicks_count, 0) >= 25 then 'MED'
    else 'LOW'
  end;
$$;

create or replace function public.resolve_price_check_ttl_minutes(
  p_priority text
)
returns integer
language plpgsql
stable
as $$
declare
  cfg public.price_check_config%rowtype;
  normalized text := upper(coalesce(p_priority, 'MED'));
begin
  select * into cfg from public.price_check_config where id = true;

  if normalized = 'HIGH' then
    return greatest(coalesce(cfg.ttl_high_minutes, 90), 1);
  elsif normalized = 'LOW' then
    return greatest(coalesce(cfg.ttl_low_minutes, 1440), 1);
  end if;

  return greatest(coalesce(cfg.ttl_med_minutes, 480), 1);
end;
$$;

create or replace function public.sync_price_check_state_from_products(
  p_limit integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 1), 1);
  v_upserted integer := 0;
begin
  with base as (
    select
      p.id as product_id,
      coalesce(p.last_sync, p.updated_at, now()) as last_checked_at,
      coalesce(p.next_check_at, now()) as next_check_at,
      p.price as last_final_price,
      case
        when coalesce(p.pix_price, 0) > 0 and coalesce(p.pix_price, 0) <= coalesce(p.price, 0) then 'API_PIX'
        when lower(coalesce(p.last_price_source, '')) = 'scraper' then 'SCRAPER'
        else 'API_BASE'
      end as last_price_source,
      public.resolve_price_check_priority(p.name, p.created_at, p.is_featured, p.clicks_count) as priority
    from public.products p
    where lower(coalesce(p.marketplace, '')) = 'mercadolivre'
      and p.external_id is not null
    order by coalesce(p.next_check_at, p.updated_at, p.created_at, now()) asc
    limit v_limit
  ),
  upserted as (
    insert into public.price_check_state (
      product_id,
      last_checked_at,
      next_check_at,
      last_final_price,
      last_price_source,
      priority,
      stale_ttl_minutes,
      fail_count,
      updated_at
    )
    select
      b.product_id,
      b.last_checked_at,
      b.next_check_at,
      b.last_final_price,
      b.last_price_source,
      b.priority,
      public.resolve_price_check_ttl_minutes(b.priority),
      0,
      now()
    from base b
    on conflict (product_id) do update set
      last_checked_at = coalesce(public.price_check_state.last_checked_at, excluded.last_checked_at),
      next_check_at = least(coalesce(public.price_check_state.next_check_at, excluded.next_check_at), excluded.next_check_at),
      last_final_price = coalesce(public.price_check_state.last_final_price, excluded.last_final_price),
      last_price_source = coalesce(public.price_check_state.last_price_source, excluded.last_price_source),
      priority = excluded.priority,
      stale_ttl_minutes = excluded.stale_ttl_minutes,
      updated_at = now()
    returning 1
  )
  select count(*) into v_upserted from upserted;

  return coalesce(v_upserted, 0);
end;
$$;

create or replace function public.enqueue_due_price_check_jobs(
  p_limit integer default 120
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 1), 1);
  v_inserted integer := 0;
begin
  perform public.sync_price_check_state_from_products(greatest(v_limit * 2, 200));

  with due as (
    select
      pcs.product_id,
      case pcs.priority when 'HIGH' then 0 when 'MED' then 1 else 2 end as priority_rank
    from public.price_check_state pcs
    join public.products p on p.id = pcs.product_id
    where lower(coalesce(p.marketplace, '')) = 'mercadolivre'
      and p.external_id is not null
      and coalesce(p.is_blocked, false) = false
      and coalesce(p.status, 'active') <> 'archived'
      and pcs.next_check_at <= now()
      and coalesce(pcs.backoff_until, to_timestamp(0)) <= now()
      and not exists (
        select 1
        from public.price_check_jobs j
        where j.product_id = pcs.product_id
          and j.status in ('queued', 'running')
      )
    order by priority_rank asc, pcs.next_check_at asc
    limit v_limit
  ),
  inserted as (
    insert into public.price_check_jobs (
      product_id,
      domain,
      status,
      available_at,
      meta,
      updated_at
    )
    select
      d.product_id,
      'mercadolivre.com.br',
      'queued',
      now(),
      jsonb_build_object('reason', 'scheduled'),
      now()
    from due d
    returning 1
  )
  select count(*) into v_inserted from inserted;

  return coalesce(v_inserted, 0);
end;
$$;

create or replace function public.claim_price_check_jobs(
  p_worker_id uuid,
  p_limit integer default 40
)
returns table (
  job_id bigint,
  product_id uuid,
  domain text,
  attempts integer,
  queued_at timestamptz,
  available_at timestamptz,
  meta jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select j.id
    from public.price_check_jobs j
    where j.status = 'queued'
      and j.available_at <= now()
    order by j.available_at asc, j.queued_at asc
    limit greatest(coalesce(p_limit, 1), 1)
    for update skip locked
  )
  update public.price_check_jobs j
  set
    status = 'running',
    worker_id = p_worker_id,
    started_at = now(),
    attempts = j.attempts + 1,
    updated_at = now()
  from picked
  where j.id = picked.id
  returning
    j.id,
    j.product_id,
    j.domain,
    j.attempts,
    j.queued_at,
    j.available_at,
    j.meta;
end;
$$;

create or replace function public.complete_price_check_job(
  p_job_id bigint,
  p_worker_id uuid,
  p_status text,
  p_error_code text default null,
  p_retry_in_seconds integer default null,
  p_meta_patch jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(coalesce(p_status, 'done'));
  v_retry_seconds integer := greatest(coalesce(p_retry_in_seconds, 60), 5);
begin
  if v_status = 'retry' then
    update public.price_check_jobs
    set
      status = 'queued',
      available_at = now() + make_interval(secs => v_retry_seconds),
      error_code = p_error_code,
      meta = coalesce(meta, '{}'::jsonb) || coalesce(p_meta_patch, '{}'::jsonb),
      updated_at = now()
    where id = p_job_id
      and status = 'running'
      and (p_worker_id is null or worker_id = p_worker_id);
    return found;
  elsif v_status = 'failed' then
    update public.price_check_jobs
    set
      status = 'failed',
      error_code = p_error_code,
      finished_at = now(),
      meta = coalesce(meta, '{}'::jsonb) || coalesce(p_meta_patch, '{}'::jsonb),
      updated_at = now()
    where id = p_job_id
      and (p_worker_id is null or worker_id = p_worker_id);
    return found;
  else
    update public.price_check_jobs
    set
      status = 'done',
      error_code = p_error_code,
      finished_at = now(),
      meta = coalesce(meta, '{}'::jsonb) || coalesce(p_meta_patch, '{}'::jsonb),
      updated_at = now()
    where id = p_job_id
      and (p_worker_id is null or worker_id = p_worker_id);
    return found;
  end if;
end;
$$;

create or replace function public.enqueue_price_check_refresh(
  p_product_id uuid,
  p_force boolean default false,
  p_reason text default 'on_demand'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.price_check_state%rowtype;
  v_product public.products%rowtype;
  v_threshold integer;
  v_stale boolean := true;
  v_priority text;
begin
  select * into v_product from public.products where id = p_product_id;
  if not found then
    return false;
  end if;

  if lower(coalesce(v_product.marketplace, '')) <> 'mercadolivre' or v_product.external_id is null then
    return false;
  end if;

  select * into v_state from public.price_check_state where product_id = p_product_id;
  select stale_threshold_minutes into v_threshold from public.price_check_config where id = true;
  v_threshold := greatest(coalesce(v_threshold, 360), 1);

  if not p_force and v_state.last_checked_at is not null then
    v_stale := v_state.last_checked_at <= (now() - make_interval(mins => v_threshold));
  end if;

  if not p_force and not v_stale then
    return false;
  end if;

  v_priority := public.resolve_price_check_priority(v_product.name, v_product.created_at, v_product.is_featured, v_product.clicks_count);

  insert into public.price_check_state (
    product_id,
    last_checked_at,
    next_check_at,
    last_final_price,
    last_price_source,
    priority,
    fail_count,
    backoff_until,
    stale_ttl_minutes,
    updated_at
  ) values (
    v_product.id,
    coalesce(v_state.last_checked_at, v_product.last_sync),
    now(),
    v_product.price,
    coalesce(v_state.last_price_source, 'API_BASE'),
    'HIGH',
    coalesce(v_state.fail_count, 0),
    null,
    public.resolve_price_check_ttl_minutes('HIGH'),
    now()
  )
  on conflict (product_id) do update set
    next_check_at = now(),
    priority = 'HIGH',
    backoff_until = null,
    stale_ttl_minutes = public.resolve_price_check_ttl_minutes('HIGH'),
    updated_at = now();

  begin
    insert into public.price_check_jobs (
      product_id,
      domain,
      status,
      available_at,
      meta,
      updated_at
    )
    select
      p_product_id,
      'mercadolivre.com.br',
      'queued',
      now(),
      jsonb_build_object('reason', coalesce(nullif(trim(p_reason), ''), 'on_demand_refresh')),
      now()
    where not exists (
      select 1
      from public.price_check_jobs j
      where j.product_id = p_product_id
        and j.status in ('queued', 'running')
    );
  exception when unique_violation then
    -- already queued by concurrent request
    null;
  end;

  return true;
end;
$$;

create or replace function public.trg_products_activate_on_affiliate()
returns trigger
language plpgsql
as $$
begin
  if lower(coalesce(new.marketplace, '')) = 'mercadolivre'
     and new.external_id is not null
     and coalesce(new.affiliate_link, '') ~* 'mercadolivre\.com/sec/[A-Za-z0-9]+'
  then
    new.is_active := true;
    if lower(coalesce(new.status, '')) in ('standby', 'paused', 'archived', '') then
      new.status := 'active';
    end if;
    new.next_check_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_products_activate_on_affiliate on public.products;
create trigger trg_products_activate_on_affiliate
before insert or update of affiliate_link
on public.products
for each row
execute function public.trg_products_activate_on_affiliate();

create or replace function public.trg_products_sync_price_check_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_priority text;
begin
  if lower(coalesce(new.marketplace, '')) <> 'mercadolivre' or new.external_id is null then
    return new;
  end if;

  v_priority := public.resolve_price_check_priority(new.name, new.created_at, new.is_featured, new.clicks_count);

  insert into public.price_check_state (
    product_id,
    last_checked_at,
    next_check_at,
    last_final_price,
    last_price_source,
    priority,
    fail_count,
    stale_ttl_minutes,
    updated_at
  ) values (
    new.id,
    coalesce(new.last_sync, new.updated_at),
    coalesce(new.next_check_at, now()),
    new.price,
    case
      when coalesce(new.pix_price, 0) > 0 and coalesce(new.pix_price, 0) <= coalesce(new.price, 0) then 'API_PIX'
      when lower(coalesce(new.last_price_source, '')) = 'scraper' then 'SCRAPER'
      else 'API_BASE'
    end,
    v_priority,
    0,
    public.resolve_price_check_ttl_minutes(v_priority),
    now()
  )
  on conflict (product_id) do update set
    next_check_at = coalesce(excluded.next_check_at, public.price_check_state.next_check_at, now()),
    last_final_price = coalesce(excluded.last_final_price, public.price_check_state.last_final_price),
    last_price_source = coalesce(excluded.last_price_source, public.price_check_state.last_price_source),
    priority = excluded.priority,
    stale_ttl_minutes = excluded.stale_ttl_minutes,
    updated_at = now();

  if tg_op = 'INSERT' then
    if coalesce(new.affiliate_link, '') ~* 'mercadolivre\.com/sec/[A-Za-z0-9]+'
    then
      perform public.enqueue_price_check_refresh(new.id, true, 'affiliate_validated');
    end if;
  elsif new.affiliate_link is distinct from old.affiliate_link
     or (coalesce(old.is_active, false) = false and coalesce(new.is_active, false) = true)
  then
    if coalesce(new.affiliate_link, '') ~* 'mercadolivre\.com/sec/[A-Za-z0-9]+'
    then
      perform public.enqueue_price_check_refresh(new.id, true, 'affiliate_validated');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_products_sync_price_check_state on public.products;
create trigger trg_products_sync_price_check_state
after insert or update of
  marketplace,
  external_id,
  name,
  is_featured,
  clicks_count,
  next_check_at,
  price,
  last_sync,
  last_price_source,
  affiliate_link,
  is_active
on public.products
for each row
execute function public.trg_products_sync_price_check_state();

create or replace view public.price_check_hourly_metrics as
select
  date_trunc('hour', created_at) as hour_bucket,
  count(*) as total_checks,
  count(*) filter (where status_code between 200 and 299) as total_success,
  count(*) filter (where status_code in (403, 429)) as total_rate_limited,
  count(*) filter (where event_status = 'backoff') as total_backoff,
  count(*) filter (where event_status = 'error') as total_errors,
  round(avg(duration_ms)::numeric, 2) as avg_duration_ms
from public.price_check_events
group by 1
order by 1 desc;

create or replace function private.invoke_price_check_scheduler()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  queued_count integer := 0;
  inserted_count integer := 0;
  secret text;
  url text := 'https://pixqurduxqfcujfadkbw.supabase.co/functions/v1/price-sync';
  headers jsonb;
  body jsonb;
begin
  inserted_count := public.enqueue_due_price_check_jobs(120);

  select count(*)
    into queued_count
    from public.price_check_jobs j
   where j.status = 'queued'
     and j.available_at <= now();

  if queued_count <= 0 then
    return;
  end if;

  select value into secret from private.cron_secrets where key = 'price-sync';
  if secret is null then
    select value into secret from private.cron_secrets where key = 'price-drop-alerts';
  end if;

  if secret is null then
    raise exception 'cron secret missing';
  end if;

  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', secret
  );

  body := jsonb_build_object(
    'source', 'price-check-scheduler',
    'use_queue', true,
    'batch_size', 40,
    'allow_continuation', true,
    'scheduler_enqueued', inserted_count,
    'scheduler_queue_size', queued_count
  );

  perform net.http_post(
    url := url,
    headers := headers,
    body := body
  );
end;
$$;

revoke all on function private.invoke_price_check_scheduler() from public;

revoke all on function public.sync_price_check_state_from_products(integer) from public;
revoke all on function public.enqueue_due_price_check_jobs(integer) from public;
revoke all on function public.claim_price_check_jobs(uuid, integer) from public;
revoke all on function public.complete_price_check_job(bigint, uuid, text, text, integer, jsonb) from public;

grant execute on function public.sync_price_check_state_from_products(integer) to service_role;
grant execute on function public.enqueue_due_price_check_jobs(integer) to service_role;
grant execute on function public.claim_price_check_jobs(uuid, integer) to service_role;
grant execute on function public.complete_price_check_job(bigint, uuid, text, text, integer, jsonb) to service_role;
grant execute on function public.enqueue_price_check_refresh(uuid, boolean, text) to anon, authenticated, service_role;

do $$
declare
  scheduler_job_id int;
begin
  select jobid into scheduler_job_id
    from cron.job
   where jobname = 'price-check-scheduler';

  if scheduler_job_id is not null then
    perform cron.unschedule(scheduler_job_id);
  end if;

  perform cron.schedule(
    'price-check-scheduler',
    '* * * * *',
    $cron$select private.invoke_price_check_scheduler();$cron$
  );
end $$;

-- Backfill state for existing ML products.
select public.sync_price_check_state_from_products(100000);
