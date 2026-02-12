-- Fix RPC visibility/signature for price-sync lock acquisition via PostgREST.
create table if not exists public.price_sync_locks (
  lock_key text primary key,
  holder_id uuid not null,
  locked_until timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_price_sync_locks_until
  on public.price_sync_locks (locked_until);

create or replace function public.acquire_price_sync_lock(
  lock_key text,
  holder_id uuid,
  ttl_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_locked_until timestamptz;
begin
  select locked_until
    into v_locked_until
    from public.price_sync_locks
   where price_sync_locks.lock_key = acquire_price_sync_lock.lock_key
   for update;

  if found then
    if v_locked_until <= v_now then
      update public.price_sync_locks
         set holder_id = acquire_price_sync_lock.holder_id,
             locked_until = v_now + make_interval(secs => greatest(ttl_seconds, 1)),
             updated_at = v_now
       where price_sync_locks.lock_key = acquire_price_sync_lock.lock_key;
      return true;
    end if;
    return false;
  end if;

  begin
    insert into public.price_sync_locks (lock_key, holder_id, locked_until, updated_at)
    values (
      acquire_price_sync_lock.lock_key,
      acquire_price_sync_lock.holder_id,
      v_now + make_interval(secs => greatest(ttl_seconds, 1)),
      v_now
    );
    return true;
  exception when unique_violation then
    return false;
  end;
end;
$$;

create or replace function public.release_price_sync_lock(
  lock_key text,
  holder_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.price_sync_locks
   where price_sync_locks.lock_key = release_price_sync_lock.lock_key
     and price_sync_locks.holder_id = release_price_sync_lock.holder_id;
  return found;
end;
$$;

revoke all on function public.acquire_price_sync_lock(text, uuid, integer) from public;
revoke all on function public.release_price_sync_lock(text, uuid) from public;

grant execute on function public.acquire_price_sync_lock(text, uuid, integer) to service_role;
grant execute on function public.release_price_sync_lock(text, uuid) to service_role;

-- Force PostgREST schema refresh so RPC calls see the function immediately.
select pg_notify('pgrst', 'reload schema');
