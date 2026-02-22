begin;

create or replace function public.queue_price_audit_sample_service(
  p_limit integer default 60,
  p_include_suspect boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return public.queue_price_audit_sample(p_limit, p_include_suspect);
end;
$$;

grant execute on function public.queue_price_audit_sample_service(integer, boolean)
  to authenticated, service_role;

commit;
