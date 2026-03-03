begin;

do $$
declare
  rec record;
begin
  for rec in
    select
      n.nspname as schema_name,
      c.relname as view_name
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where c.relkind = 'v'
      and n.nspname = 'public'
      and not exists (
        select 1
        from unnest(coalesce(c.reloptions, array[]::text[])) as opt
        where lower(opt) = 'security_invoker=true'
      )
  loop
    execute format(
      'alter view %I.%I set (security_invoker = true)',
      rec.schema_name,
      rec.view_name
    );
  end loop;
end
$$;

commit;
