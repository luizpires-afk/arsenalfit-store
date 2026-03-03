import test from "node:test";
import assert from "node:assert/strict";

import {
  parseAffiliateLinksInput,
  isUuid,
  isMercadoLivreSecLink,
  getUnvalidatedReasonCode,
  validateAffiliateLinksForBatch,
} from "../src/lib/affiliateValidationRules.js";

test("parseAffiliateLinksInput trims and removes empty lines", () => {
  const parsed = parseAffiliateLinksInput("\n  https://meli.la/abc123  \n\nhttps://mercadolivre.com.br/sec/xyz\n");
  assert.deepEqual(parsed, ["https://meli.la/abc123", "https://mercadolivre.com.br/sec/xyz"]);
});

test("isUuid validates UUID format", () => {
  assert.equal(isUuid("4a7da0de-bf4b-45c0-9ee4-45e7b961f887"), true);
  assert.equal(isUuid("not-a-uuid"), false);
});

test("isMercadoLivreSecLink accepts SEC/short links and rejects others", () => {
  assert.equal(isMercadoLivreSecLink("https://mercadolivre.com.br/sec/abc123"), true);
  assert.equal(isMercadoLivreSecLink("https://meli.la/abc123"), true);
  assert.equal(isMercadoLivreSecLink("https://example.com/sec/abc123"), false);
});

test("getUnvalidatedReasonCode centralizes selection rules", () => {
  const missingAffiliate = {
    marketplace: "mercadolivre",
    removed_at: null,
    auto_disabled_reason: null,
    source_url: "https://mercadolivre.com.br/p/MLB123",
    ml_item_id: "MLB123",
    affiliate_link: "",
    affiliate_verified: false,
    is_active: false,
    status: "standby",
  };
  assert.equal(getUnvalidatedReasonCode(missingAffiliate), "missing_affiliate_link");

  const inactive = {
    marketplace: "mercadolivre",
    removed_at: null,
    auto_disabled_reason: null,
    source_url: "https://mercadolivre.com.br/p/MLB123",
    ml_item_id: "MLB123",
    affiliate_link: "https://mercadolivre.com.br/sec/abc",
    affiliate_verified: true,
    is_active: false,
    status: "standby",
  };
  assert.equal(getUnvalidatedReasonCode(inactive), "inactive_or_pending");

  const valid = {
    marketplace: "mercadolivre",
    removed_at: null,
    auto_disabled_reason: null,
    source_url: "https://mercadolivre.com.br/p/MLB123",
    ml_item_id: "MLB123",
    affiliate_link: "https://mercadolivre.com.br/sec/abc",
    affiliate_verified: true,
    is_active: true,
    status: "active",
    affiliate_validation_status: "VALIDATED",
    affiliate_validation_error: null,
  };
  assert.equal(getUnvalidatedReasonCode(valid), null);
});

test("validateAffiliateLinksForBatch reports count and duplicate issues", () => {
  const result = validateAffiliateLinksForBatch({
    links: [
      "https://meli.la/dup",
      "https://meli.la/dup",
    ],
    expectedCount: 1,
    strictCount: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.includes("Quantidade de links")), true);
  assert.equal(result.errors.some((item) => item.includes("Link duplicado")), true);
});
