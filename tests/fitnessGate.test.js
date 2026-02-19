import test from "node:test";
import assert from "node:assert/strict";

import {
  SITE_CATEGORIES,
  passesCategoryAllowlist,
  hasNegativeTerms,
  passesAmbiguousRules,
  computeFitnessRelevanceScore,
  evaluateFitnessGate,
} from "../supabase/functions/catalog-ingest/fitness_gate.js";

test("passesCategoryAllowlist respects explicit category ids", () => {
  assert.equal(
    passesCategoryAllowlist(SITE_CATEGORIES.SUPLEMENTOS, "MLB2239", ["MLB2239", "MLB1071"]),
    true,
  );
  assert.equal(
    passesCategoryAllowlist(SITE_CATEGORIES.SUPLEMENTOS, "MLB9999", ["MLB2239", "MLB1071"]),
    false,
  );
});

test("negative terms block accessories unrelated to fitness", () => {
  const result = hasNegativeTerms(
    SITE_CATEGORIES.ACESSORIOS,
    "garrafa térmica de café gourmet para cozinha",
  );
  assert.equal(result.blocked, true);
  assert.ok(result.matched.includes("cafe"));
});

test("ambiguous accessory rule blocks garrafa without gym context", () => {
  const blocked = passesAmbiguousRules(
    SITE_CATEGORIES.ACESSORIOS,
    "garrafa térmica premium inox para escritório",
  );
  assert.equal(blocked.passed, false);

  const allowed = passesAmbiguousRules(
    SITE_CATEGORIES.ACESSORIOS,
    "garrafa squeeze fitness academia 1 litro",
  );
  assert.equal(allowed.passed, true);
});

test("accessories block thermal bottles and coffee-style brands", () => {
  const thermalBlocked = evaluateFitnessGate(SITE_CATEGORIES.ACESSORIOS, {
    title: "Garrafa termica Stanley Quick Flip 710ml",
    brand: "Stanley",
    attributes: [{ name: "Uso", value_name: "hidratação" }],
    mlCategoryId: "MLB1000",
    mlCategoryAllowlist: ["MLB1000"],
  });
  assert.equal(thermalBlocked.decision, "reject");
  assert.equal(thermalBlocked.blockedByNegative, true);

  const squeezeAllowed = evaluateFitnessGate(SITE_CATEGORIES.ACESSORIOS, {
    title: "Garrafa squeeze termica fitness academia 1L",
    brand: "Genérica",
    attributes: [{ name: "Tipo", value_name: "squeeze" }],
    mlCategoryId: "MLB1000",
    mlCategoryAllowlist: ["MLB1000"],
  });
  assert.equal(squeezeAllowed.blockedByAmbiguous, false);
});

test("computeFitnessRelevanceScore gives high score for valid supplements", () => {
  const score = computeFitnessRelevanceScore(SITE_CATEGORIES.SUPLEMENTOS, {
    title: "Whey Protein Concentrado 1kg",
    brand: "Growth",
    attributes: [
      { name: "Marca", value_name: "Growth" },
      { name: "Tipo", value_name: "Suplemento" },
    ],
    mlCategoryId: "MLB2239",
    mlCategoryAllowlist: ["MLB2239"],
  });
  assert.ok(score.score >= 70, `expected score >= 70, got ${score.score}`);
  assert.equal(score.allowlistOk, true);
});

test("evaluateFitnessGate rejects accessories with coffee context", () => {
  const result = evaluateFitnessGate(SITE_CATEGORIES.ACESSORIOS, {
    title: "Garrafa térmica de café 1L",
    brand: "Marca X",
    attributes: [{ name: "Uso", value_name: "cozinha" }],
    mlCategoryId: "MLB1000",
    mlCategoryAllowlist: ["MLB1000"],
  });
  assert.equal(result.decision, "reject");
  assert.equal(result.blockedByNegative, true);
});
