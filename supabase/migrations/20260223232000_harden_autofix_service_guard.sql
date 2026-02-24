begin;

create or replace function public.auto_fix_open_price_mismatch_cases_service(
  p_limit integer default 50,
  p_source_only_item boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_limit integer := greatest(coalesce(p_limit, 50), 1);
  v_guarded integer := 0;
  v_result jsonb := '{}'::jsonb;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  update public.price_mismatch_cases c
     set status = 'RESOLVED',
         resolved_at = v_now,
         resolved_by = 'service_role',
         resolution_note = 'guard_trusted_sticky_source_no_auto_apply',
         updated_at = v_now
   where c.id in (
     select c2.id
     from public.price_mismatch_cases c2
     join public.products p on p.id = c2.product_id
     where c2.status = 'OPEN'
       and p.removed_at is null
       and coalesce(c2.ml_price, 0) > 0
       and (not p_source_only_item or c2.source = 'item')
       and coalesce(coalesce(c2.site_price, p.price), 0) > 0
       and lower(coalesce(p.last_price_source, '')) in (
         'manual',
         'auth',
         'public',
         'api_base',
         'api_pix',
         'api',
         'api_auth'
       )
       and (
         abs(coalesce(c2.site_price, p.price) - c2.ml_price) >= 25
         or abs(coalesce(c2.site_price, p.price) - c2.ml_price)
            / nullif(coalesce(c2.site_price, p.price), 0) >= 0.20
       )
     order by c2.updated_at asc
     limit v_limit
   );

  get diagnostics v_guarded = row_count;

  v_result := public.auto_fix_open_price_mismatch_cases(p_limit, p_source_only_item);

  return coalesce(v_result, '{}'::jsonb)
         || jsonb_build_object('guarded_pre_resolve', v_guarded);
end;
$$;

grant execute on function public.auto_fix_open_price_mismatch_cases_service(
  integer, boolean
) to authenticated, service_role;

commit;
