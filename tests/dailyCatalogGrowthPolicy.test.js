import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveDailyQuotaRange,
  resolveDailyQuotaValue,
  dedupeCandidatesByExternalId,
  applyBrandDailyLimit,
} from "../supabase/functions/catalog-ingest/daily_growth_policy.js";

test("daily quota range supports min/max object", () => {
  const range = resolveDailyQuotaRange({ min: 3, max: 5 }, 1, 2);
  assert.equal(range.min, 3);
  assert.equal(range.max, 5);
});

test("daily quota value is deterministic by seed within bounds", () => {
  const range = { min: 3, max: 5 };
  const v1 = resolveDailyQuotaValue(range, 1001);
  const v2 = resolveDailyQuotaValue(range, 1001);
  assert.ok(v1 >= 3 && v1 <= 5);
  assert.equal(v1, v2);
});

test("dedupe by external id keeps first unique MLB", () => {
  const deduped = dedupeCandidatesByExternalId([
    { externalId: "MLB123" },
    { externalId: "MLB123" },
    { externalId: "MLB999" },
  ]);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].externalId, "MLB123");
  assert.equal(deduped[1].externalId, "MLB999");
});

test("brand limit enforces max per brand with fallback for daily minimum", () => {
  const candidates = [
    { id: 1, brandKey: "growth" },
    { id: 2, brandKey: "growth" },
    { id: 3, brandKey: "growth" },
    { id: 4, brandKey: "dux" },
  ];

  const strict = applyBrandDailyLimit(candidates, {
    maxPerBrand: 2,
    minTarget: 0,
    initialUsage: new Map(),
  });
  assert.equal(strict.selected.length, 3);
  assert.equal(strict.rejected.length, 1);

  const fallback = applyBrandDailyLimit(candidates, {
    maxPerBrand: 1,
    minTarget: 3,
    initialUsage: new Map(),
  });
  assert.equal(fallback.selected.length, 4);
  const growthSelected = fallback.selected.filter((item) => item.brandKey === "growth").length;
  assert.equal(growthSelected, 3);
});
