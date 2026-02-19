import test from "node:test";
import assert from "node:assert/strict";

import { createPriceSyncLock } from "../src/lib/priceSyncLock.js";

test("priceSyncLock: acquire/release calls rpc with params", async () => {
  const calls = [];
  const fakeClient = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === "acquire_price_sync_lock") return { data: true, error: null };
      if (fn === "release_price_sync_lock") return { data: true, error: null };
      return { data: null, error: null };
    },
  };

  const lock = createPriceSyncLock(fakeClient, { lockKey: "price_sync_runner", ttlSeconds: 3600 });
  const acquired = await lock.acquire("00000000-0000-0000-0000-000000000001");
  const released = await lock.release("00000000-0000-0000-0000-000000000001");

  assert.equal(acquired, true);
  assert.equal(released, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].fn, "acquire_price_sync_lock");
  assert.equal(calls[0].args.lock_key, "price_sync_runner");
  assert.equal(calls[0].args.ttl_seconds, 3600);
  assert.equal(calls[1].fn, "release_price_sync_lock");
});

test("priceSyncLock: acquire throws on rpc error", async () => {
  const fakeClient = {
    rpc: async () => ({ data: null, error: new Error("rpc failed") }),
  };

  const lock = createPriceSyncLock(fakeClient, { lockKey: "price_sync_runner", ttlSeconds: 60 });
  await assert.rejects(() => lock.acquire("00000000-0000-0000-0000-000000000002"));
});
