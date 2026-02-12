-- Add Pix price field for Mercado Livre payments
alter table public.products
add column if not exists pix_price numeric;

comment on column public.products.pix_price is 'Preco a vista / Pix quando disponivel';
