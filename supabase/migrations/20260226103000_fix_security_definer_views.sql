begin;

alter view public.v_product_offer_destination_trace
  set (security_invoker = true);

alter view public.price_check_hourly_metrics
  set (security_invoker = true);

commit;
