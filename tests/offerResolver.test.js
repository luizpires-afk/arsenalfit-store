import test from "node:test";
import assert from "node:assert/strict";

import { resolveOfferUrl } from "../src/lib/offer.js";

test("offer resolver: active Mercado Livre with sec affiliate uses affiliate bound to item", () => {
  const result = resolveOfferUrl({
    marketplace: "mercadolivre",
    status: "active",
    is_active: true,
    affiliate_link: "https://mercadolivre.com/sec/AbC123",
    source_url: "https://www.mercadolivre.com.br/p/MLB123456",
  });

  assert.equal(result.canRedirect, true);
  assert.equal(result.resolvedSource, "affiliate");
  assert.equal(result.reason, "affiliate_bound_to_canonical_item");
  assert.equal(result.url, "https://mercadolivre.com/sec/AbC123?item_id=MLB123456");
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

test("offer resolver: prefers canonical source URL when standby fallback is enabled", () => {
  const result = resolveOfferUrl(
    {
      marketplace: "mercadolivre",
      status: "standby",
      is_active: false,
      affiliate_link: null,
      source_url: "https://www.mercadolivre.com.br/p/MLB000111",
      canonical_offer_url: "https://produto.mercadolivre.com.br/MLB999888-teste-_JM",
    },
    { allowRedirectWhileStandby: true },
  );

  assert.equal(result.canRedirect, true);
  assert.equal(result.url, "https://produto.mercadolivre.com.br/MLB999888-teste-_JM");
  assert.equal(result.resolvedSource, "canonical_source");
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

test("offer resolver: infers active and uses affiliate bound item when payload omits status", () => {
  const result = resolveOfferUrl({
    marketplace: "mercadolivre",
    affiliate_link: "https://mercadolivre.com/sec/AbC123",
    source_url: "https://www.mercadolivre.com.br/p/MLB123456",
  });

  assert.equal(result.canRedirect, true);
  assert.equal(result.resolvedSource, "affiliate");
  assert.equal(result.reason, "affiliate_bound_to_canonical_item");
  assert.equal(result.url, "https://mercadolivre.com/sec/AbC123?item_id=MLB123456");
});

test("offer resolver: active Mercado Livre falls back to sec affiliate when source is missing", () => {
  const result = resolveOfferUrl({
    marketplace: "mercadolivre",
    status: "active",
    is_active: true,
    affiliate_link: "https://mercadolivre.com/sec/AbC123",
    source_url: null,
  });

  assert.equal(result.canRedirect, true);
  assert.equal(result.resolvedSource, "affiliate");
  assert.equal(result.reason, "affiliate_validated");
});

test("offer resolver: active Mercado Livre ignores malformed canonical URL and binds affiliate to source item", () => {
  const result = resolveOfferUrl({
    marketplace: "mercadolivre",
    status: "active",
    is_active: true,
    affiliate_link: "https://mercadolivre.com/sec/AbC123",
    canonical_offer_url: "https://produto.mercadolivre.com.br/mlb5369244846",
    source_url: "https://www.mercadolivre.com.br/p/MLB23377545?pdp_filters=item_id%3AMLB5369244846",
  });

  assert.equal(result.canRedirect, true);
  assert.equal(result.resolvedSource, "affiliate");
  assert.equal(result.reason, "affiliate_bound_to_canonical_item");
  assert.equal(
    result.url,
    "https://mercadolivre.com/sec/AbC123?item_id=MLB23377545",
  );
});

test("offer resolver: explicit standby keeps gated even with sec link", () => {
  const result = resolveOfferUrl(
    {
      marketplace: "mercadolivre",
      status: "standby",
      is_active: false,
      affiliate_link: "https://mercadolivre.com/sec/AbC123",
      source_url: "https://www.mercadolivre.com.br/p/MLB123456",
    },
    { allowRedirectWhileStandby: false },
  );

  assert.equal(result.canRedirect, false);
  assert.equal(result.reason, "awaiting_affiliate_validation");
});
