import test from "node:test";
import assert from "node:assert/strict";

import {
  shouldUseFallbackFromPending,
  pickFallbackRows,
  buildFallbackBatchSource,
} from "../src/lib/affiliateFallbackBatch.js";

test("export vazio + pendentes => fallback acionado", () => {
  const use = shouldUseFallbackFromPending({
    exportRows: [],
    pendingRows: [{ product_id: "p1" }],
    fallbackEnabled: true,
  });
  assert.equal(use, true);
});

test("fallback respeita ordem estável e limite", () => {
  const selected = pickFallbackRows({
    pendingRows: [
      { product_id: "b", categoria: "Suplementos", updated_at: "2026-03-03T10:00:00Z" },
      { product_id: "a", categoria: "Suplementos", updated_at: "2026-03-03T09:00:00Z" },
      { product_id: "c", categoria: "Suplementos", updated_at: "2026-03-03T11:00:00Z" },
    ],
    category: "suplementos",
    maxItems: 2,
  });

  assert.deepEqual(selected.map((row) => row.product_id), ["a", "b"]);
});

test("source fallback é determinístico por categoria", () => {
  const source = buildFallbackBatchSource({
    baseSource: "ops_affiliate_daily",
    category: "acessorios",
  });
  assert.equal(source, "ops_affiliate_daily__fallback_pending__acessorios");
});
