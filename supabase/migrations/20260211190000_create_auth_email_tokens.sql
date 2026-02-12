create extension if not exists "pgcrypto";

create table if not exists public.auth_email_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid null references auth.users(id) on delete set null,
  token_hash text not null unique,
  type text not null check (type in ('signup','recovery')),
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now(),
  created_ip text null,
  user_agent text null
);

create index if not exists auth_email_tokens_email_idx on public.auth_email_tokens (email);
create index if not exists auth_email_tokens_type_idx on public.auth_email_tokens (type);
create index if not exists auth_email_tokens_expires_idx on public.auth_email_tokens (expires_at);
create index if not exists auth_email_tokens_used_idx on public.auth_email_tokens (used_at);

alter table public.auth_email_tokens enable row level security;
create policy "deny_all_auth_email_tokens" on public.auth_email_tokens
  for all
  using (false)
  with check (false);

create table if not exists public.auth_email_rate_limits (
  id uuid primary key default gen_random_uuid(),
  email text,
  ip text,
  type text not null check (type in ('signup','recovery')),
  window_start timestamptz not null,
  count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists auth_email_rate_limits_window_idx
  on public.auth_email_rate_limits (email, ip, type, window_start);

alter table public.auth_email_rate_limits enable row level security;
create policy "deny_all_auth_email_rate_limits" on public.auth_email_rate_limits
  for all
  using (false)
  with check (false);

create table if not exists public.auth_email_logs (
  id uuid primary key default gen_random_uuid(),
  email text,
  user_id uuid null,
  type text not null,
  status text not null,
  message text null,
  ip text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create index if not exists auth_email_logs_email_idx on public.auth_email_logs (email);
create index if not exists auth_email_logs_type_idx on public.auth_email_logs (type);

alter table public.auth_email_logs enable row level security;
create policy "deny_all_auth_email_logs" on public.auth_email_logs
  for all
  using (false)
  with check (false);

