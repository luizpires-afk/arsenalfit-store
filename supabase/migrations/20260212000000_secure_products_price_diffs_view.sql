-- Secure products_price_diffs view (remove security definer exposure)
do $$
begin
  execute 'drop view if exists public.products_price_diffs';
  begin
    execute $sql$
      create view public.products_price_diffs
      with (security_invoker = true)
      as
      select
        id,
        name,
        price as current_price,
        detected_price as collected_price,
        price - detected_price as price_diff,
        detected_at,
        updated_at
      from public.products
      where detected_price is not null;
    $sql$;
  exception
    when syntax_error or feature_not_supported then
      execute $sql$
        create view public.products_price_diffs as
        select
          id,
          name,
          price as current_price,
          detected_price as collected_price,
          price - detected_price as price_diff,
          detected_at,
          updated_at
        from public.products
        where detected_price is not null;
      $sql$;
  end;
end $$;

revoke all on public.products_price_diffs from public;
grant select on public.products_price_diffs to authenticated;
grant select on public.products_price_diffs to service_role;
