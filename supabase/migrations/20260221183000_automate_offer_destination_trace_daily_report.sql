begin;

create table if not exists public.offer_destination_trace_reports (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'offer_destination_trace_daily',
  report_date date not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  total_clicks integer not null default 0,
  total_products_clicked integer not null default 0,
  total_destination_changes integer not null default 0,
  total_destination_mismatch integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offer_destination_trace_reports_source_check
    check (source in ('offer_destination_trace_daily', 'offer_destination_trace_manual')),
  constraint offer_destination_trace_reports_totals_check
    check (
      total_clicks >= 0
      and total_products_clicked >= 0
      and total_destination_changes >= 0
      and total_destination_mismatch >= 0
    )
);

create unique index if not exists idx_offer_destination_trace_reports_date
  on public.offer_destination_trace_reports (report_date);

create index if not exists idx_offer_destination_trace_reports_created
  on public.offer_destination_trace_reports (created_at desc);

alter table public.offer_destination_trace_reports enable row level security;

drop policy if exists "offer_destination_trace_reports_admin_read" on public.offer_destination_trace_reports;
create policy "offer_destination_trace_reports_admin_read"
  on public.offer_destination_trace_reports
  for select
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "offer_destination_trace_reports_service_manage" on public.offer_destination_trace_reports;
create policy "offer_destination_trace_reports_service_manage"
  on public.offer_destination_trace_reports
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.generate_offer_destination_trace_daily_report(
  p_report_date date default null,
  p_source text default 'offer_destination_trace_daily'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_date date := coalesce(p_report_date, ((now() at time zone 'America/Sao_Paulo')::date - 1));
  v_source text := case
    when lower(coalesce(p_source, '')) = 'manual' then 'offer_destination_trace_manual'
    when lower(coalesce(p_source, '')) = 'offer_destination_trace_manual' then 'offer_destination_trace_manual'
    else 'offer_destination_trace_daily'
  end;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_total_clicks integer := 0;
  v_total_products_clicked integer := 0;
  v_total_destination_changes integer := 0;
  v_total_destination_mismatch integer := 0;
  v_details jsonb := '{}'::jsonb;
begin
  v_window_start := ((v_report_date::text || ' 00:00:00 America/Sao_Paulo')::timestamptz);
  v_window_end := (((v_report_date + 1)::text || ' 00:00:00 America/Sao_Paulo')::timestamptz);

  with scoped as (
    select
      t.id,
      t.product_id,
      t.created_at,
      t.destination_url,
      t.resolution_reason,
      t.resolved_source,
      t.canonical_ml_item_id,
      t.destination_ml_item_id,
      lag(t.destination_ml_item_id) over (
        partition by t.product_id
        order by t.created_at, t.id
      ) as prev_destination_ml_item_id
    from public.product_offer_click_events t
    where t.created_at >= v_window_start
      and t.created_at < v_window_end
  ),
  totals as (
    select
      count(*)::int as total_clicks,
      count(distinct product_id)::int as total_products_clicked,
      count(*) filter (
        where destination_ml_item_id is not null
          and prev_destination_ml_item_id is not null
          and destination_ml_item_id is distinct from prev_destination_ml_item_id
      )::int as total_destination_changes,
      count(*) filter (
        where canonical_ml_item_id is not null
          and destination_ml_item_id is not null
          and canonical_ml_item_id is distinct from destination_ml_item_id
      )::int as total_destination_mismatch
    from scoped
  ),
  top_changed_products as (
    select
      s.product_id,
      max(p.name) as product_name,
      max(p.ml_item_id) as canonical_ml_item_id,
      count(*) filter (
        where s.destination_ml_item_id is not null
          and s.prev_destination_ml_item_id is not null
          and s.destination_ml_item_id is distinct from s.prev_destination_ml_item_id
      )::int as changes,
      max(s.created_at) as last_change_at
    from scoped s
    join public.products p on p.id = s.product_id
    group by s.product_id
    having count(*) filter (
      where s.destination_ml_item_id is not null
        and s.prev_destination_ml_item_id is not null
        and s.destination_ml_item_id is distinct from s.prev_destination_ml_item_id
    ) > 0
    order by changes desc, last_change_at desc
    limit 30
  ),
  mismatch_samples as (
    select
      s.product_id,
      p.name as product_name,
      s.created_at,
      s.canonical_ml_item_id,
      s.destination_ml_item_id,
      s.destination_url,
      s.resolution_reason,
      s.resolved_source
    from scoped s
    join public.products p on p.id = s.product_id
    where s.canonical_ml_item_id is not null
      and s.destination_ml_item_id is not null
      and s.canonical_ml_item_id is distinct from s.destination_ml_item_id
    order by s.created_at desc
    limit 50
  ),
  aggregate_json as (
    select jsonb_build_object(
      'top_changed_products', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'product_id', x.product_id,
            'product_name', x.product_name,
            'canonical_ml_item_id', x.canonical_ml_item_id,
            'changes', x.changes,
            'last_change_at', x.last_change_at
          )
        )
        from top_changed_products x
      ), '[]'::jsonb),
      'mismatch_samples', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'product_id', m.product_id,
            'product_name', m.product_name,
            'created_at', m.created_at,
            'canonical_ml_item_id', m.canonical_ml_item_id,
            'destination_ml_item_id', m.destination_ml_item_id,
            'destination_url', m.destination_url,
            'resolution_reason', m.resolution_reason,
            'resolved_source', m.resolved_source
          )
        )
        from mismatch_samples m
      ), '[]'::jsonb)
    ) as details
  )
  select
    coalesce(t.total_clicks, 0),
    coalesce(t.total_products_clicked, 0),
    coalesce(t.total_destination_changes, 0),
    coalesce(t.total_destination_mismatch, 0),
    coalesce(a.details, '{}'::jsonb)
  into
    v_total_clicks,
    v_total_products_clicked,
    v_total_destination_changes,
    v_total_destination_mismatch,
    v_details
  from totals t
  cross join aggregate_json a;

  insert into public.offer_destination_trace_reports (
    source,
    report_date,
    window_start,
    window_end,
    total_clicks,
    total_products_clicked,
    total_destination_changes,
    total_destination_mismatch,
    details,
    created_at,
    updated_at
  )
  values (
    v_source,
    v_report_date,
    v_window_start,
    v_window_end,
    v_total_clicks,
    v_total_products_clicked,
    v_total_destination_changes,
    v_total_destination_mismatch,
    v_details,
    now(),
    now()
  )
  on conflict (report_date)
  do update set
    source = excluded.source,
    window_start = excluded.window_start,
    window_end = excluded.window_end,
    total_clicks = excluded.total_clicks,
    total_products_clicked = excluded.total_products_clicked,
    total_destination_changes = excluded.total_destination_changes,
    total_destination_mismatch = excluded.total_destination_mismatch,
    details = excluded.details,
    updated_at = now();

  insert into public.daily_run_reports (
    source,
    report_date,
    run_id,
    checklist,
    overall_status,
    critical_failures,
    created_at
  )
  values (
    'offer_destination_trace',
    v_report_date,
    gen_random_uuid(),
    jsonb_build_object(
      'window_start', v_window_start,
      'window_end', v_window_end,
      'total_clicks', v_total_clicks,
      'total_products_clicked', v_total_products_clicked,
      'total_destination_changes', v_total_destination_changes,
      'total_destination_mismatch', v_total_destination_mismatch
    ),
    case
      when v_total_destination_mismatch > 0 then 'FAIL'
      else 'PASS'
    end,
    case
      when v_total_destination_mismatch > 0 then 1
      else 0
    end,
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'report_date', to_char(v_report_date, 'YYYY-MM-DD'),
    'window_start', v_window_start,
    'window_end', v_window_end,
    'total_clicks', v_total_clicks,
    'total_products_clicked', v_total_products_clicked,
    'total_destination_changes', v_total_destination_changes,
    'total_destination_mismatch', v_total_destination_mismatch
  );
end;
$$;

grant execute on function public.generate_offer_destination_trace_daily_report(date, text)
  to authenticated, service_role;

create or replace function private.invoke_offer_destination_trace_daily_report()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  perform public.generate_offer_destination_trace_daily_report(null, 'offer_destination_trace_daily');
exception
  when others then
    raise notice 'invoke_offer_destination_trace_daily_report failed: %', sqlerrm;
end;
$$;

revoke all on function private.invoke_offer_destination_trace_daily_report() from public;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'offer-destination-trace-report'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  -- 09:10 America/Sao_Paulo -> 12:10 UTC (gera resumo do dia anterior)
  perform cron.schedule(
    'offer-destination-trace-report',
    '10 12 * * *',
    $cron$select private.invoke_offer_destination_trace_daily_report();$cron$
  );
end $$;

commit;
