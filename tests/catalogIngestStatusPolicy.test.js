import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveExistingProductActivation,
  resolveNewProductActivation,
} from "../supabase/functions/catalog-ingest/status_policy.js";

test("existing active product stays active even when candidate is standby", () => {
  const result = resolveExistingProductActivation({
    existingStatus: "active",
    existingIsActive: true,
    affiliateVerified: false,
    qualityPublishable: true,
    forceStandby: true,
    isPinned: false,
    preserveExistingActive: true,
  });

  assert.equal(result.status, "active");
  assert.equal(result.isActive, true);
  assert.equal(result.reason, "preserve_existing_active");
});

test("existing paused product remains paused", () => {
  const result = resolveExistingProductActivation({
    existingStatus: "paused",
    existingIsActive: false,
    affiliateVerified: true,
    qualityPublishable: true,
    forceStandby: false,
    isPinned: false,
    preserveExistingActive: true,
  });

  assert.equal(result.status, "paused");
  assert.equal(result.isActive, false);
});

test("existing standby product activates after affiliate validation", () => {
  const result = resolveExistingProductActivation({
    existingStatus: "standby",
    existingIsActive: false,
    affiliateVerified: true,
    qualityPublishable: true,
    forceStandby: false,
    isPinned: false,
    preserveExistingActive: true,
  });

  assert.equal(result.status, "active");
  assert.equal(result.isActive, true);
});

test("new products stay pending until affiliate validation", () => {
  const pending = resolveNewProductActivation({
    affiliateVerified: false,
    qualityPublishable: true,
    forceStandby: false,
  });
  assert.equal(pending.status, "standby");
  assert.equal(pending.isActive, false);

  const activated = resolveNewProductActivation({
    affiliateVerified: true,
    qualityPublishable: true,
    forceStandby: false,
  });
  assert.equal(activated.status, "active");
  assert.equal(activated.isActive, true);
});
