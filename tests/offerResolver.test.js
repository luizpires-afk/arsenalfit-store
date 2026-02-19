import test from "node:test";
import assert from "node:assert/strict";

import { resolveOfferUrl } from "../src/lib/offer.js";

test("offer resolver: active Mercado Livre with sec affiliate redirects to affiliate", () => {
  const result = resolveOfferUrl({
    marketplace: "mercadolivre",
    status: "active",
    is_active: true,
    affiliate_link: "https://mercadolivre.com/sec/AbC123",
    source_url: "https://www.mercadolivre.com.br/p/MLB123456",
  });

  assert.equal(result.canRedirect, true);
  assert.equal(result.resolvedSource, "affiliate");
  assert.equal(result.reason, "affiliate_validated");
});

test("offer resolver: standby Mercado Livre blocks redirect when standby fallback disabled", () => {
  const result = resolveOfferUrl(
    {
      marketplace: "mercadolivre",
      status: "standby",
      is_active: false,
      affiliate_link: null,
      source_url: "https://www.mercadolivre.com.br/p/MLB123456",
    },
    { allowRedirectWhileStandby: false },
  );

  assert.equal(result.canRedirect, false);
  assert.equal(result.reason, "awaiting_affiliate_validation");
});

test("offer resolver: standby Mercado Livre can use source when standby fallback enabled", () => {
  const result = resolveOfferUrl(
    {
      marketplace: "mercadolivre",
      status: "standby",
      is_active: false,
      affiliate_link: null,
      source_url: "https://www.mercadolivre.com.br/p/MLB123456",
    },
    { allowRedirectWhileStandby: true },
  );

  assert.equal(result.canRedirect, true);
  assert.equal(result.resolvedSource, "source");
  assert.equal(result.reason, "standby_source_allowed");
});

test("offer resolver: active Mercado Livre without valid sec affiliate does not fallback to source", () => {
  const result = resolveOfferUrl(
    {
      marketplace: "mercadolivre",
      status: "active",
      is_active: true,
      affiliate_link: "https://www.mercadolivre.com.br/p/MLB123456?matt_tool=38524122",
      source_url: "https://www.mercadolivre.com.br/p/MLB123456",
    },
    { allowRedirectWhileStandby: true },
  );

  assert.equal(result.canRedirect, false);
  assert.equal(result.reason, "awaiting_affiliate_validation");
});
