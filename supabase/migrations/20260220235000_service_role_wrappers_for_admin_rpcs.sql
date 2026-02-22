begin;

create or replace function public.run_price_mismatch_audit_service(
  p_lookback_hours integer default 24,
  p_warn_pct numeric default 25,
  p_warn_abs numeric default 20,
  p_critical_pct numeric default 50,
  p_critical_abs numeric default 30,
  p_apply_critical_policy boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return public.run_price_mismatch_audit(
    p_lookback_hours,
    p_warn_pct,
    p_warn_abs,
    p_critical_pct,
    p_critical_abs,
    p_apply_critical_policy
  );
end;
$$;

create or replace function public.auto_fix_open_price_mismatch_cases_service(
  p_limit integer default 50,
  p_apply_freeze boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return public.auto_fix_open_price_mismatch_cases(p_limit, p_apply_freeze);
end;
$$;

create or replace function public.recheck_suspect_prices_now_service(
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return public.recheck_suspect_prices_now(p_limit);
end;
$$;

grant execute on function public.run_price_mismatch_audit_service(
  integer, numeric, numeric, numeric, numeric, boolean
) to authenticated, service_role;
grant execute on function public.auto_fix_open_price_mismatch_cases_service(
  integer, boolean
) to authenticated, service_role;
grant execute on function public.recheck_suspect_prices_now_service(integer)
  to authenticated, service_role;

commit;
