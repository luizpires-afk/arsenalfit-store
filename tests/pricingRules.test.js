import test from "node:test";
import assert from "node:assert/strict";

import {
  parseBRLCurrency,
  resolveFinalPriceInfo,
  resolvePromotionMetrics,
  resolvePricePresentation,
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

test("resolveFinalPriceInfo hides scraper list price even when fresh", () => {
  const pricing = resolveFinalPriceInfo({
    price: 64,
    original_price: 78.9,
    last_price_source: "scraper",
    last_price_verified_at: new Date().toISOString(),
  });

  assert.equal(pricing.finalPrice, 64);
  assert.equal(pricing.listPrice, null);
  assert.equal(pricing.discountPercent, null);
});

test("resolveFinalPriceInfo hides scraper list price when ratio is too high without pix", () => {
  const pricing = resolveFinalPriceInfo({
    price: 171.9,
    original_price: 349,
    last_price_source: "scraper",
    last_price_verified_at: new Date().toISOString(),
  });

  assert.equal(pricing.finalPrice, 171.9);
  assert.equal(pricing.listPrice, null);
  assert.equal(pricing.discountPercent, null);
});

test("resolveFinalPriceInfo accepts higher list ratio with trusted promo flag", () => {
  const pricing = resolveFinalPriceInfo({
    price: 171.9,
    original_price: 349,
    discount_percentage: 51,
    last_price_source: "auth",
    last_price_verified_at: new Date().toISOString(),
  });

  assert.equal(pricing.finalPrice, 171.9);
  assert.equal(pricing.listPrice, 349);
  assert.equal(pricing.discountPercent, 51);
});

test("resolveFinalPriceInfo hides scraper list price when stale", () => {
  const staleDate = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
  const pricing = resolveFinalPriceInfo({
    price: 64,
    original_price: 78.9,
    last_price_source: "scraper",
    last_price_verified_at: staleDate,
  });

  assert.equal(pricing.finalPrice, 64);
  assert.equal(pricing.listPrice, null);
  assert.equal(pricing.discountPercent, null);
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

test("resolveFinalPriceInfo still allows higher list ratio when pix is trusted", () => {
  const pricing = resolveFinalPriceInfo({
    price: 239.9,
    pix_price: 65.45,
    pix_price_source: "api",
    original_price: 239.9,
    last_price_source: "auth",
    last_price_verified_at: new Date().toISOString(),
  });

  assert.equal(pricing.finalPrice, 65.45);
  assert.equal(pricing.listPrice, 239.9);
  assert.equal(pricing.discountPercent, 73);
});

test("resolvePricePresentation shows pix as primary and card as secondary when pix is valid", () => {
  const pricing = resolvePricePresentation({
    price: 68.9,
    pix_price: 65.45,
    pix_price_source: "api",
    original_price: 239.9,
    last_price_source: "auth",
    last_price_verified_at: new Date().toISOString(),
  });

  assert.equal(pricing.displayPricePrimary, 65.45);
  assert.equal(pricing.displayPriceSecondary, 68.9);
  assert.equal(pricing.displayStrikethrough, 239.9);
  assert.equal(pricing.discountPercent, 73);
});

test("resolvePricePresentation falls back to de/por using previous history when list is absent", () => {
  const pricing = resolvePricePresentation({
    price: 98.9,
    previous_price: 118.68,
    previous_price_source: "HISTORY",
    previous_price_expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    original_price: null,
    pix_price: null,
  });

  assert.equal(pricing.displayPricePrimary, 98.9);
  assert.equal(pricing.displayPriceSecondary, null);
  assert.equal(pricing.displayStrikethrough, 118.68);
  assert.equal(pricing.discountPercent, 17);
});

test("resolvePricePresentation hides tiny previous history drop", () => {
  const pricing = resolvePricePresentation({
    price: 57.21,
    previous_price: 59.6,
    previous_price_source: "HISTORY",
    previous_price_expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    original_price: null,
    pix_price: null,
    last_price_source: "catalog",
  });

  assert.equal(pricing.displayPricePrimary, 57.21);
  assert.equal(pricing.displayStrikethrough, null);
  assert.equal(pricing.discountPercent, null);
});

test("resolvePricePresentation ignores expired previous history", () => {
  const pricing = resolvePricePresentation({
    price: 60.99,
    previous_price: 64,
    previous_price_source: "HISTORY",
    previous_price_expires_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    original_price: null,
    pix_price: null,
  });

  assert.equal(pricing.displayPricePrimary, 60.99);
  assert.equal(pricing.displayStrikethrough, null);
  assert.equal(pricing.discountPercent, null);
});

test("resolvePricePresentation keeps valid history compare even when last source is scraper", () => {
  const pricing = resolvePricePresentation({
    price: 77.85,
    previous_price: 113.5,
    previous_price_source: "HISTORY",
    previous_price_expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    original_price: null,
    pix_price: null,
    last_price_source: "scraper",
  });

  assert.equal(pricing.displayPricePrimary, 77.85);
  assert.equal(pricing.displayStrikethrough, 113.5);
  assert.equal(pricing.discountPercent, 31);
});

test("resolvePricePresentation keeps low scraper price when Mercado trace is bound to same ml_item_id", () => {
  const pricing = resolvePricePresentation({
    ml_item_id: "MLB4179901653",
    marketplace: "mercadolivre",
    price: 39,
    original_price: 151.1,
    previous_price: 151.1,
    previous_price_source: "HISTORY",
    source_url:
      "https://www.mercadolivre.com.br/opus-dei-pre-treino-pre-workout-300g-ftw-sabor-frutas-amarelas/p/MLB51534861?pdp_filters=item_id%3AMLB4179901653&matt_tool=38524122#origin=share&sid=share&wid=MLB4179901653",
    affiliate_link: "https://mercadolivre.com/sec/172szSy",
    canonical_offer_url: "https://produto.mercadolivre.com.br/mlb4179901653",
    last_price_source: "scraper",
    last_price_verified_at: new Date().toISOString(),
  });

  assert.equal(pricing.displayPricePrimary, 39);
  assert.notEqual(pricing.displayPricePrimary, 151.1);
});

test("resolvePricePresentation keeps anti-drop guard for Mercado when trace is not bound", () => {
  const pricing = resolvePricePresentation({
    ml_item_id: "MLB4179901653",
    marketplace: "mercadolivre",
    price: 39,
    original_price: 151.1,
    source_url:
      "https://www.mercadolivre.com.br/p/MLB51534861?pdp_filters=item_id%3AMLB0000000000",
    affiliate_link: "https://mercadolivre.com/sec/172szSy",
    canonical_offer_url: "https://produto.mercadolivre.com.br/mlb9999999999",
    last_price_source: "scraper",
    last_price_verified_at: new Date().toISOString(),
  });

  assert.equal(pricing.displayPricePrimary, 151.1);
});

test("resolvePromotionMetrics keeps real discount signal even when scraper list is hidden", () => {
  const promo = resolvePromotionMetrics({
    ml_item_id: "MLB5159053928",
    marketplace: "mercadolivre",
    price: 33.25,
    original_price: 67.98,
    previous_price: 67.98,
    last_price_source: "scraper",
    source_url:
      "https://www.mercadolivre.com.br/termogenico-thermocaps-200mg-60caps-ftw-diabo-verde/p/MLB12465919?pdp_filters=item_id%3AMLB5159053928#origin%3Dshare%26sid%3Dshare%26wid%3DMLB5159053928",
    canonical_offer_url: "https://produto.mercadolivre.com.br/mlb5159053928",
    affiliate_link: "https://mercadolivre.com/sec/2iS1Zvw",
    last_price_verified_at: new Date().toISOString(),
  });

  assert.equal(promo.anchor, 67.98);
  assert.equal(promo.discountPercent, 51);
  assert.equal(promo.hasDiscount, true);
});
