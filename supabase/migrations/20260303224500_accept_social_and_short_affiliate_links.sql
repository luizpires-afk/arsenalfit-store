create or replace function public.is_mercadolivre_sec_link(p_url text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_url, '') ~* (
    '^https?://(www\.)?mercadolivre\.com/sec/[A-Za-z0-9]+([/?#].*)?$'
    || '|^https?://(www\.)?mercadolivre\.com\.br/sec/[A-Za-z0-9]+([/?#].*)?$'
    || '|^https?://(www\.)?mercadolivre\.com(\.br)?/social/pb[A-Za-z0-9]+([/?#].*)?$'
    || '|^https?://(www\.)?meli\.la/[A-Za-z0-9]+([/?#].*)?$'
  );
$$;
