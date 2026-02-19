-- Keep affiliate validation audit fields consistent whenever affiliate is validated.

update public.products
set
  validated_at = coalesce(validated_at, affiliate_generated_at, updated_at, created_at, now()),
  affiliate_url_used = coalesce(affiliate_url_used, affiliate_link)
where coalesce(affiliate_verified, false) = true;

create or replace function public.trg_products_affiliate_validation_audit()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.affiliate_verified, false) = true then
    new.validated_at := coalesce(new.validated_at, now());
    new.affiliate_url_used := coalesce(new.affiliate_url_used, new.affiliate_link);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_products_affiliate_validation_audit on public.products;
create trigger trg_products_affiliate_validation_audit
before insert or update on public.products
for each row
execute function public.trg_products_affiliate_validation_audit();
