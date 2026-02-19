import test from "node:test";
import assert from "node:assert/strict";

import {
  parseBRLCurrency,
  resolveFinalPriceInfo,
} from "../src/lib/pricing.js";

test("parseBRLCurrency normalizes BRL decimal format", () => {
  assert.equal(parseBRLCurrency("R$ 78,90"), 78.9);
});

test("parseBRLCurrency handles thousands separator", () => {
  assert.equal(parseBRLCurrency("R$ 2.081,45"), 2081.45);
});

test("resolveFinalPriceInfo prioritizes valid API pix as final price", () => {
  const pricing = resolveFinalPriceInfo({
    price: 78.9,
    pix_price: 69.9,
    pix_price_source: "api",
    original_price: 119.9,
  });

  assert.equal(pricing.finalPrice, 69.9);
  assert.equal(pricing.usedPix, true);
  assert.equal(pricing.listPrice, 119.9);
});

test("resolveFinalPriceInfo falls back to standard price when pix is absent", () => {
  const pricing = resolveFinalPriceInfo({
    price: 78.9,
    pix_price: null,
    pix_price_source: null,
    original_price: 119.9,
  });

  assert.equal(pricing.finalPrice, 78.9);
  assert.equal(pricing.usedPix, false);
});

test("resolveFinalPriceInfo ignores untrusted scraper pix", () => {
  const pricing = resolveFinalPriceInfo({
    price: 78.9,
    pix_price: 69.9,
    pix_price_source: "scraper",
    original_price: 119.9,
  });

  assert.equal(pricing.finalPrice, 78.9);
  assert.equal(pricing.usedPix, false);
});

test("resolveFinalPriceInfo does not create synthetic list price from base when using pix", () => {
  const pricing = resolveFinalPriceInfo({
    price: 239.9,
    pix_price: 69.9,
    pix_price_source: "api",
    original_price: null,
  });

  assert.equal(pricing.finalPrice, 69.9);
  assert.equal(pricing.listPrice, null);
});
