create table if not exists public.meli_tokens (
  id integer primary key,
  access_token text,
  refresh_token text,
  updated_at timestamp with time zone default now(),
  expires_at timestamp with time zone
);
