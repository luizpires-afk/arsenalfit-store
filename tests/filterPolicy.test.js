import test from "node:test";
import assert from "node:assert/strict";

import {
  SITE_CATEGORIES,
  loadFilterConfig,
  shouldAcceptCandidate,
} from "../supabase/functions/catalog-ingest/filter_policy.js";

test("filter policy rejects coffee bottle in accessories", () => {
  const { config } = loadFilterConfig(null);
  const result = shouldAcceptCandidate(
    {
      title: "Garrafa termica para cafe premium 1L",
      description: "Ideal para cozinha e escritorio",
      brand: "Stanley",
      attributes: [{ name: "Uso", value_name: "Cafe" }],
      mlCategoryId: "MLB1000",
      mlCategoryAllowlist: ["MLB1000"],
    },
    SITE_CATEGORIES.ACESSORIOS,
    {
      query: "squeeze academia garrafa esportiva",
      includeTerms: [],
      excludeTerms: [],
    },
    config,
  );

  assert.equal(result.decision, "reject");
  assert.equal(result.accepted, false);
  assert.match(result.reason, /negative_terms|regex_rule|ambiguous_rule/);
});

test("filter policy accepts squeeze/shaker in accessories", () => {
  const { config } = loadFilterConfig(null);
  const result = shouldAcceptCandidate(
    {
      title: "Garrafa squeeze esportiva academia 1L",
      description: "Shaker para treino e musculacao",
      brand: "Genérica",
      attributes: [{ name: "Tipo", value_name: "Shaker" }],
      mlCategoryId: "MLB1000",
      mlCategoryAllowlist: ["MLB1000"],
    },
    SITE_CATEGORIES.ACESSORIOS,
    {
      query: "squeeze academia garrafa esportiva",
      includeTerms: [],
      excludeTerms: [],
    },
    config,
  );

  assert.equal(result.accepted, true);
  assert.ok(["allow", "standby"].includes(result.decision));
  assert.equal(result.blockedByNegative, false);
});

test("filter policy respects category context and avoids accessory false positive in supplements", () => {
  const { config } = loadFilterConfig(null);
  const result = shouldAcceptCandidate(
    {
      title: "Creatina monohidratada 300g",
      description: "Suplemento alimentar para treino",
      brand: "Growth",
      attributes: [{ name: "Tipo", value_name: "Creatina" }],
      mlCategoryId: "MLB2239",
      mlCategoryAllowlist: ["MLB2239"],
    },
    SITE_CATEGORIES.SUPLEMENTOS,
    {
      query: "creatina monohidratada",
      includeTerms: ["creatina"],
      excludeTerms: ["cafeteira"],
    },
    config,
  );

  assert.equal(result.accepted, true);
  assert.equal(result.blockedByAllowlist, false);
  assert.equal(result.blockedByNegative, false);
});

test("filter policy uses mapping include/exclude terms from query context", () => {
  const { config } = loadFilterConfig(null);
  const blockedByInclude = shouldAcceptCandidate(
    {
      title: "Luva de ciclismo urbana",
      description: "Acessorio para pedal",
      brand: "Marca X",
      attributes: [],
      mlCategoryId: "MLB1000",
      mlCategoryAllowlist: ["MLB1000"],
    },
    SITE_CATEGORIES.ACESSORIOS,
    {
      query: "strap musculacao",
      includeTerms: ["musculacao", "academia"],
      excludeTerms: [],
    },
    config,
  );
  assert.equal(blockedByInclude.accepted, false);
  assert.match(blockedByInclude.reason, /mapping_include_terms_miss|low_relevance_score/);

  const blockedByExclude = shouldAcceptCandidate(
    {
      title: "Shaker para treino de cafe",
      description: "Com tampa resistente",
      brand: "Marca X",
      attributes: [],
      mlCategoryId: "MLB1000",
      mlCategoryAllowlist: ["MLB1000"],
    },
    SITE_CATEGORIES.ACESSORIOS,
    {
      query: "shaker academia",
      includeTerms: [],
      excludeTerms: ["cafe"],
    },
    config,
  );
  assert.equal(blockedByExclude.accepted, false);
  assert.match(blockedByExclude.reason, /mapping_exclude_terms_match|negative_terms|regex_rule/);
});

test("filter policy fail-safe falls back to default config on invalid payload", () => {
  const loaded = loadFilterConfig("invalid", { warnOnMissing: true });
  assert.equal(Boolean(loaded.config?.__runtime), true);
  assert.equal(loaded.fallbackUsed, true);
  assert.ok(Array.isArray(loaded.warnings));
  assert.ok(loaded.warnings.length >= 1);
});

test("category overrides keep default positive terms (deep merge)", () => {
  const override = {
    categories: {
      [SITE_CATEGORIES.SUPLEMENTOS]: {
        blocklist_terms: ["esteroide"],
      },
    },
  };
  const { config } = loadFilterConfig(override);
  const result = shouldAcceptCandidate(
    {
      title: "Whey Protein Concentrado 900g",
      description: "Suplemento para treino e ganho de massa",
      brand: "Growth",
      attributes: [{ name: "Tipo", value_name: "Whey" }],
      mlCategoryId: "MLB2239",
      mlCategoryAllowlist: ["MLB2239"],
    },
    SITE_CATEGORIES.SUPLEMENTOS,
    {
      query: "whey protein concentrado",
      includeTerms: [],
      excludeTerms: [],
    },
    config,
  );

  assert.ok(["allow", "standby"].includes(result.decision));
  assert.equal(result.accepted, true);
});
