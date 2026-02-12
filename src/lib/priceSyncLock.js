export const createPriceSyncLock = (supabase, { lockKey, ttlSeconds }) => {
  if (!supabase) throw new Error("supabase client required");
  if (!lockKey) throw new Error("lockKey required");

  return {
    acquire: async (holderId) => {
      const { data, error } = await supabase.rpc("acquire_price_sync_lock", {
        lock_key: lockKey,
        holder_id: holderId,
        ttl_seconds: ttlSeconds,
      });
      if (error) throw error;
      return data === true;
    },
    release: async (holderId) => {
      const { data, error } = await supabase.rpc("release_price_sync_lock", {
        lock_key: lockKey,
        holder_id: holderId,
      });
      if (error) throw error;
      return data === true;
    },
  };
};
