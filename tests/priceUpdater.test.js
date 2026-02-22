import test from "node:test";
import assert from "node:assert/strict";

import { processProduct } from "../src/lib/priceUpdater.js";

const baseProduct = {
  id: "prod-1",
  marketplace: "mercadolivre",
  external_id: "MLB123",
  price: 100,
  etag: "etag-old",
  status: "active",
};

const hoursFrom = (now, hours) =>
  new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();

const runProcess = async ({ result, throws }) => {
  const now = new Date("2026-02-03T12:00:00Z");
  const provider = {
    fetchItem: async () => {
      if (throws) throw throws;
      return result;
    },
  };
  let updatePayload = null;

  const { action } = await processProduct({
    product: baseProduct,
    provider,
    now,
    accessToken: null,
    timeoutMs: 1000,
    onUpdate: async (_id, update) => {
      updatePayload = update;
    },
    log: null,
  });

  return { action, updatePayload, now };
};

test("processProduct: 304 agenda 6h e nao altera preco", async () => {
  const { action, updatePayload, now } = await runProcess({
    result: { statusCode: 304 },
  });

  assert.equal(action, "not_modified");
  assert.equal(updatePayload.last_sync, now.toISOString());
  assert.equal(updatePayload.next_check_at, hoursFrom(now, 6));
  assert.equal("price" in updatePayload, false);
});

test("processProduct: 304 limpa SUSPECT_PRICE para HEALTHY", async () => {
  const now = new Date("2026-02-03T12:00:00Z");
  const provider = {
    fetchItem: async () => ({ statusCode: 304 }),
  };
  let updatePayload = null;

  const { action } = await processProduct({
    product: { ...baseProduct, data_health_status: "SUSPECT_PRICE" },
    provider,
    now,
    accessToken: null,
    timeoutMs: 1000,
    onUpdate: async (_id, update) => {
      updatePayload = update;
    },
    log: null,
  });

  assert.equal(action, "not_modified");
  assert.equal(updatePayload.data_health_status, "HEALTHY");
});

test("processProduct: 200 atualiza preco e etag (active)", async () => {
  const { action, updatePayload, now } = await runProcess({
    result: { statusCode: 200, price: 150, etag: "etag-new", status: "active" },
  });

  assert.equal(action, "updated");
  assert.equal(updatePayload.previous_price, 100);
  assert.equal(updatePayload.original_price, 150);
  assert.equal(updatePayload.price, 150);
  assert.equal(updatePayload.discount_percentage, 0);
  assert.equal(updatePayload.etag, "etag-new");
  assert.equal(updatePayload.status, "active");
  assert.equal(updatePayload.next_check_at, hoursFrom(now, 6));
  assert.equal(updatePayload.detected_price, 150);
  assert.equal(updatePayload.detected_at, now.toISOString());
});

test("processProduct: 200 sem mudanca nao atualiza detected_*", async () => {
  const { updatePayload } = await runProcess({
    result: { statusCode: 200, price: 100, etag: "etag-new", status: "active" },
  });

  assert.equal("detected_price" in updatePayload, false);
  assert.equal("detected_at" in updatePayload, false);
});

test("processProduct: 200 mantem paused quando produto esta pausado", async () => {
  const now = new Date("2026-02-03T12:00:00Z");
  const productPaused = { ...baseProduct, status: "paused" };
  let updatePayload = null;

  const { action } = await processProduct({
    product: productPaused,
    provider: { fetchItem: async () => ({ statusCode: 200, price: 180, status: "active" }) },
    now,
    accessToken: null,
    timeoutMs: 1000,
    onUpdate: async (_id, update) => {
      updatePayload = update;
    },
    log: null,
  });

  assert.equal(action, "updated");
  assert.equal(updatePayload.status, "paused");
});

test("processProduct: 200 out_of_stock", async () => {
  const { action, updatePayload, now } = await runProcess({
    result: { statusCode: 200, price: 150, status: "out_of_stock" },
  });

  assert.equal(action, "updated");
  assert.equal(updatePayload.status, "out_of_stock");
  assert.equal(updatePayload.next_check_at, hoursFrom(now, 6));
});

test("processProduct: 404 marca paused e agenda 24h", async () => {
  const { action, updatePayload, now } = await runProcess({
    result: { statusCode: 404 },
  });

  assert.equal(action, "not_found");
  assert.equal(updatePayload.status, "paused");
  assert.equal(updatePayload.next_check_at, hoursFrom(now, 24));
});

test("processProduct: 403 aplica backoff 12h", async () => {
  const { action, updatePayload, now } = await runProcess({
    result: { statusCode: 403 },
  });

  assert.equal(action, "backoff");
  assert.equal(updatePayload.next_check_at, hoursFrom(now, 12));
});

test("processProduct: 429 aplica backoff 12h", async () => {
  const { action, updatePayload, now } = await runProcess({
    result: { statusCode: 429 },
  });

  assert.equal(action, "backoff");
  assert.equal(updatePayload.next_check_at, hoursFrom(now, 12));
});

test("processProduct: timeout aplica backoff 12h", async () => {
  const timeoutError = Object.assign(new Error("timeout"), { name: "AbortError" });
  const { action, updatePayload, now } = await runProcess({
    throws: timeoutError,
  });

  assert.equal(action, "backoff");
  assert.equal(updatePayload.next_check_at, hoursFrom(now, 12));
});
