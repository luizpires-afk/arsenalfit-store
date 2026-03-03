import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveAffiliateBatchApplyMode,
  validateAffiliateLinksForBatch,
  summarizeErrorReasons,
} from "../src/lib/affiliateValidationRules.js";

test("idempotency: batch not open returns noop reason", () => {
  const mode = resolveAffiliateBatchApplyMode({ status: "APPLIED" });
  assert.equal(mode.ok, true);
  assert.equal(mode.noop, true);
  assert.equal(mode.reason, "batch_not_open:APPLIED");
});

test("idempotency: open batch can proceed", () => {
  const mode = resolveAffiliateBatchApplyMode({ status: "OPEN" });
  assert.equal(mode.ok, true);
  assert.equal(mode.noop, false);
  assert.equal(mode.reason, null);
});

test("validation: detects duplicate sec links", () => {
  const result = validateAffiliateLinksForBatch({
    links: ["https://mercadolivre.com/sec/abc", "https://mercadolivre.com/sec/abc"],
    expectedCount: 2,
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.includes("Link duplicado")), true);
});

test("validation: detects count mismatch", () => {
  const result = validateAffiliateLinksForBatch({
    links: ["https://mercadolivre.com/sec/abc"],
    expectedCount: 2,
    strictCount: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.includes("Quantidade de links")), true);
});

test("reapply summary buckets errors consistently", () => {
  const rows = [
    { error_message: "already_validated" },
    { error_message: "already_validated" },
    { error_message: "affiliate_link_already_used" },
  ];
  const summary = summarizeErrorReasons(rows);
  assert.deepEqual(summary, {
    affiliate_link_already_used: 1,
    already_validated: 2,
  });
});
