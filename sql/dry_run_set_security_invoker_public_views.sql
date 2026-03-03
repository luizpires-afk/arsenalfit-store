-- Dry-run: preview ALTER VIEW commands needed to enforce security_invoker=true on public views.
-- This script does NOT change objects.

-- 1) Structured list of impacted views.
with target_views as (
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
)
select
  schema_name,
  view_name,
  format('alter view %I.%I set (security_invoker = true);', schema_name, view_name) as planned_sql
from target_views
order by schema_name, view_name;

-- 2) Human-readable command preview in SQL Editor output.
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
    order by n.nspname, c.relname
  loop
    raise notice 'DRY-RUN: %', format(
      'alter view %I.%I set (security_invoker = true);',
      rec.schema_name,
      rec.view_name
    );
  end loop;

  if not found then
    raise notice 'DRY-RUN: no public views require security_invoker update.';
  end if;
end
$$;
