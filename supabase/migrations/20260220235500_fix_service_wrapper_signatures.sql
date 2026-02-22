begin;

drop function if exists public.auto_fix_open_price_mismatch_cases_service(integer, boolean);

create or replace function public.auto_fix_open_price_mismatch_cases_service(
  p_limit integer default 50,
  p_source_only_item boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return public.auto_fix_open_price_mismatch_cases(p_limit, p_source_only_item);
end;
$$;

grant execute on function public.auto_fix_open_price_mismatch_cases_service(
  integer, boolean
) to authenticated, service_role;

commit;
