begin;

create or replace function public.export_standby_affiliate_batch_service(
  p_limit integer default 30,
  p_source text default 'service'
)
returns table(
  batch_id uuid,
  "position" integer,
  product_id uuid,
  product_name text,
  external_id text,
  source_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  return query
  select *
  from public.export_standby_affiliate_batch(
    greatest(1, least(coalesce(p_limit, 30), 30)),
    coalesce(nullif(btrim(p_source), ''), 'service')
  );
end;
$$;

grant execute on function public.export_standby_affiliate_batch_service(integer, text)
  to authenticated, service_role;

commit;
