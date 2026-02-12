-- Normaliza external_id do Mercado Livre (extrai MLB... e remove hífen)
create or replace function public.normalize_mlb_external_id()
returns trigger
language plpgsql
as $$
begin
  if new.external_id is not null then
    new.external_id := upper(substring(new.external_id from '(MLB-?\d{6,12})'));
    if new.external_id is not null then
      new.external_id := replace(new.external_id, '-', '');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_mlb_external_id on public.products;
create trigger trg_normalize_mlb_external_id
before insert or update of external_id
on public.products
for each row
execute function public.normalize_mlb_external_id();
