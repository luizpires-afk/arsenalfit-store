alter table public.products
  add column if not exists is_blocked boolean not null default false;

update public.products
  set is_blocked = false
  where is_blocked is null;