-- Audit: exposed views that are not running with security_invoker = true
-- Safe to run in Supabase SQL Editor. This script does not alter objects by itself.

-- 1) List exposed views that are missing security_invoker=true.
with exposed_schemas as (
  -- Keep in sync with your API exposed schemas. For this project, public is the primary exposed schema.
  select unnest(array['public']::text[]) as schema_name
), view_flags as (
  select
    n.nspname as schema_name,
    c.relname as view_name,
    coalesce(
      exists (
        select 1
        from unnest(coalesce(c.reloptions, array[]::text[])) as opt
        where lower(opt) = 'security_invoker=true'
      ),
      false
    ) as has_security_invoker
  from pg_class c
  join pg_namespace n
    on n.oid = c.relnamespace
  join exposed_schemas es
    on es.schema_name = n.nspname
  where c.relkind = 'v'
)
select
  schema_name,
  view_name,
  has_security_invoker,
  format('%I.%I', schema_name, view_name) as qualified_view
from view_flags
where has_security_invoker = false
order by schema_name, view_name;

-- 2) Generate remediations for review (copy/paste result rows to run).
with exposed_schemas as (
  select unnest(array['public']::text[]) as schema_name
), view_flags as (
  select
    n.nspname as schema_name,
    c.relname as view_name,
    coalesce(
      exists (
        select 1
        from unnest(coalesce(c.reloptions, array[]::text[])) as opt
        where lower(opt) = 'security_invoker=true'
      ),
      false
    ) as has_security_invoker
  from pg_class c
  join pg_namespace n
    on n.oid = c.relnamespace
  join exposed_schemas es
    on es.schema_name = n.nspname
  where c.relkind = 'v'
)
select format(
  'alter view %I.%I set (security_invoker = true);',
  schema_name,
  view_name
) as remediation_sql
from view_flags
where has_security_invoker = false
order by schema_name, view_name;
