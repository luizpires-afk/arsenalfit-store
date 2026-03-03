begin;

create or replace view public.v_product_offer_destination_trace
with (security_invoker = true)
as
with events as (
  select
    e.*,
    lag(e.destination_ml_item_id) over (
      partition by e.product_id
      order by e.created_at, e.id
    ) as previous_destination_ml_item_id
  from public.product_offer_click_events e
)
select
  events.*,
  (
    events.destination_ml_item_id is not null
    and events.previous_destination_ml_item_id is not null
    and events.destination_ml_item_id is distinct from events.previous_destination_ml_item_id
  ) as destination_ml_item_changed
from events;

grant select on public.v_product_offer_destination_trace to authenticated, service_role;

create or replace view public.price_check_hourly_metrics
with (security_invoker = true)
as
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

grant select on public.price_check_hourly_metrics to authenticated, service_role;

commit;
