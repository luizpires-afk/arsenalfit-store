-- Enforce product identity uniqueness for marketplace imports.
-- This preserves current ingest logic while preventing duplicate records.

update public.products
set external_id = upper(btrim(external_id))
where external_id is not null
  and external_id <> upper(btrim(external_id));

create unique index if not exists products_marketplace_external_uidx
  on public.products (marketplace, external_id)
  where external_id is not null
    and btrim(external_id) <> '';
