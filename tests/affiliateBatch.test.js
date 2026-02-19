import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_AFFILIATE_BATCH_SIZE,
  buildOrderedBatchAssignments,
  parseAffiliateLinksInput,
} from "../src/lib/affiliateBatch.js";

test("affiliate batch parser keeps only non-empty trimmed lines", () => {
  const parsed = parseAffiliateLinksInput(`
    https://mercadolivre.com/sec/abc123

    https://mercadolivre.com/sec/def456  
  `);

  assert.deepEqual(parsed, [
    "https://mercadolivre.com/sec/abc123",
    "https://mercadolivre.com/sec/def456",
  ]);
});

test("affiliate batch assignments preserve order and keep pending product ids", () => {
  const result = buildOrderedBatchAssignments({
    orderedProductIds: ["p1", "p2", "p3"],
    affiliateLinks: ["https://mercadolivre.com/sec/a1", "", "https://mercadolivre.com/sec/a3"],
  });

  assert.deepEqual(
    result.assignments.map((item) => [item.productId, item.affiliateLink]),
    [
      ["p1", "https://mercadolivre.com/sec/a1"],
      ["p3", "https://mercadolivre.com/sec/a3"],
    ],
  );
  assert.deepEqual(result.pendingProductIds, ["p2"]);
  assert.deepEqual(result.ignoredExtraLinks, []);
});

test("affiliate batch assignments detect extra links beyond ordered products", () => {
  const result = buildOrderedBatchAssignments({
    orderedProductIds: ["p1", "p2"],
    affiliateLinks: [
      "https://mercadolivre.com/sec/a1",
      "https://mercadolivre.com/sec/a2",
      "https://mercadolivre.com/sec/a3",
    ],
  });

  assert.equal(MAX_AFFILIATE_BATCH_SIZE, 30);
  assert.deepEqual(result.pendingProductIds, []);
  assert.deepEqual(result.ignoredExtraLinks, ["https://mercadolivre.com/sec/a3"]);
});
