-- Lock com TTL para evitar execucoes concorrentes
CREATE TABLE IF NOT EXISTS public.price_sync_locks (
  lock_key TEXT PRIMARY KEY,
  holder_id UUID NOT NULL,
  locked_until TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_sync_locks_until
  ON public.price_sync_locks (locked_until);

CREATE OR REPLACE FUNCTION public.acquire_price_sync_lock(
  lock_key TEXT,
  holder_id UUID,
  ttl_seconds INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_locked_until TIMESTAMPTZ;
BEGIN
  -- tenta lock existente
  SELECT locked_until
    INTO v_locked_until
    FROM public.price_sync_locks
   WHERE price_sync_locks.lock_key = acquire_price_sync_lock.lock_key
   FOR UPDATE;

  IF FOUND THEN
    IF v_locked_until <= v_now THEN
      UPDATE public.price_sync_locks
         SET holder_id = acquire_price_sync_lock.holder_id,
             locked_until = v_now + make_interval(secs => ttl_seconds),
             updated_at = v_now
       WHERE price_sync_locks.lock_key = acquire_price_sync_lock.lock_key;
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  BEGIN
    INSERT INTO public.price_sync_locks (lock_key, holder_id, locked_until, updated_at)
    VALUES (
      acquire_price_sync_lock.lock_key,
      acquire_price_sync_lock.holder_id,
      v_now + make_interval(secs => ttl_seconds),
      v_now
    );
    RETURN TRUE;
  EXCEPTION WHEN unique_violation THEN
    -- corrida: outro processo criou o lock
    RETURN FALSE;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_price_sync_lock(
  lock_key TEXT,
  holder_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.price_sync_locks
   WHERE price_sync_locks.lock_key = release_price_sync_lock.lock_key
     AND price_sync_locks.holder_id = release_price_sync_lock.holder_id;
  RETURN FOUND;
END;
$$;
