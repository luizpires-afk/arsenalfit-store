begin;

create or replace function public.run_storefront_autopilot_now_service(
  p_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return public.run_storefront_autopilot_now(p_source);
end;
$$;

grant execute on function public.run_storefront_autopilot_now_service(text)
  to authenticated, service_role;

create or replace function private.invoke_storefront_autopilot()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.run_storefront_autopilot_now_service('cron');
exception
  when others then
    raise notice 'invoke_storefront_autopilot failed: %', sqlerrm;
end;
$$;

revoke all on function private.invoke_storefront_autopilot() from public;

commit;
