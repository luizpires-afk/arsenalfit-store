import test from "node:test";
import assert from "node:assert/strict";

import {
  canSoftRemoveStandbyProduct,
  detectAffiliateNotPermittedSignal,
  evaluatePriceMismatch,
  isStandbyLikeState,
} from "../src/lib/adminHealth.js";

test("affiliate validation: detects 'nao permitido' signal", () => {
  assert.equal(
    detectAffiliateNotPermittedSignal("Este URL nao e permitido pelo Programa."),
    true,
  );
  assert.equal(
    detectAffiliateNotPermittedSignal("URL NOT PERMITTED by program"),
    true,
  );
});

test("affiliate validation: ignores normal sec link", () => {
  assert.equal(
    detectAffiliateNotPermittedSignal("https://mercadolivre.com/sec/1abc23"),
    false,
  );
});

test("standby removal policy: active validated product cannot be removed", () => {
  assert.equal(
    canSoftRemoveStandbyProduct({
      status: "active",
      isActive: true,
      affiliateLink: "https://mercadolivre.com/sec/abc123",
    }),
    false,
  );
});

test("standby removal policy: standby product can be removed", () => {
  assert.equal(
    canSoftRemoveStandbyProduct({
      status: "standby",
      isActive: false,
      affiliateLink: null,
    }),
    true,
  );
  assert.equal(
    isStandbyLikeState({
      status: "pending_validacao",
      isActive: false,
    }),
    true,
  );
});

test("price mismatch detector: flags warning and critical thresholds", () => {
  const warning = evaluatePriceMismatch({
    sitePrice: 205,
    mlPrice: 171.9,
    warnPct: 10,
    warnAbs: 20,
    criticalPct: 50,
    criticalAbs: 80,
  });
  assert.equal(warning.hasMismatch, true);
  assert.equal(warning.isCritical, false);

  const critical = evaluatePriceMismatch({
    sitePrice: 125.93,
    mlPrice: 53,
    warnPct: 25,
    warnAbs: 20,
    criticalPct: 50,
    criticalAbs: 30,
  });
  assert.equal(critical.hasMismatch, true);
  assert.equal(critical.isCritical, true);
});

