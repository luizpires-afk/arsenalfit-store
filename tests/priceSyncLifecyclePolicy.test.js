import test from "node:test";
import assert from "node:assert/strict";

import { resolveLifecycleState } from "../supabase/functions/price-sync/lifecycle_policy.js";

test("preserva paused sempre", () => {
  const out = resolveLifecycleState({
    existingStatus: "paused",
    existingIsActive: false,
    mappedStatus: "active",
    autoDisabledReason: "supervisao_automatica_incoerencia",
    isReliableSource: true,
  });

  assert.equal(out.resolvedStatus, "paused");
  assert.equal(out.isActive, false);
  assert.equal(out.shouldReactivate, false);
});

test("standby manual não reativa automaticamente", () => {
  const out = resolveLifecycleState({
    existingStatus: "standby",
    existingIsActive: false,
    mappedStatus: "active",
    autoDisabledReason: null,
    isReliableSource: true,
  });

  assert.equal(out.resolvedStatus, "standby");
  assert.equal(out.shouldReactivate, false);
});

test("reativa produto auto-desabilitado por coerência com fonte confiável", () => {
  const out = resolveLifecycleState({
    existingStatus: "standby",
    existingIsActive: false,
    mappedStatus: "active",
    autoDisabledReason: "supervisao_automatica_incoerencia",
    isReliableSource: true,
  });

  assert.equal(out.resolvedStatus, "active");
  assert.equal(out.shouldReactivate, true);
  assert.equal(out.isActive, true);
});

test("não reativa quando motivo é blocked", () => {
  const out = resolveLifecycleState({
    existingStatus: "standby",
    existingIsActive: false,
    mappedStatus: "active",
    autoDisabledReason: "blocked",
    isReliableSource: true,
  });

  assert.equal(out.shouldReactivate, false);
  assert.equal(out.isActive, false);
});
