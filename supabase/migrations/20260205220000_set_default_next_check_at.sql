-- Ensure next_check_at has a default for new inserts
alter table public.products
  alter column next_check_at set default now();

update public.products
  set next_check_at = now()
  where next_check_at is null;
