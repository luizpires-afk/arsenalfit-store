-- Ensure products_price_diffs is not public and only accessible to authenticated/service role
revoke all on public.products_price_diffs from anon;
revoke all on public.products_price_diffs from public;

grant select on public.products_price_diffs to authenticated;
grant select on public.products_price_diffs to service_role;
