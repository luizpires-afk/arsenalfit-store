import test from "node:test";
import assert from "node:assert/strict";

import {
  computePriceDelta,
  extractMlItemIdFromUrl,
  resolveCanonicalMlItemId,
  resolveSiteFinalPrice,
} from "../src/lib/offerAudit.js";
import { resolveFinalPriceInfo } from "../src/lib/pricing.js";
import { evaluateActiveOfferIntegrity } from "../src/lib/repairPolicy.js";

test("offer audit: resolve canonical ml item from explicit ml_item_id", () => {
  const ml = resolveCanonicalMlItemId({
    ml_item_id: "MLB4478549231",
    external_id: "MLB6173287630",
  });
  assert.equal(ml, "MLB4478549231");
});

test("offer audit: extract ml item id from produto URL path", () => {
  const ml = extractMlItemIdFromUrl(
    "https://produto.mercadolivre.com.br/MLB4478549231-kit-2x-creatina-_JM",
  );
  assert.equal(ml, "MLB4478549231");
});

test("offer audit: catalog URL with wid prioritizes destination item", () => {
  const ml = extractMlItemIdFromUrl(
    "https://www.mercadolivre.com.br/x/p/MLB56656247?pdp_filters=item_id:MLB4478549231&wid=MLB4478549231",
  );
  assert.equal(ml, "MLB4478549231");
});

test("offer audit: final site price prioritizes valid pix", () => {
  const final = resolveSiteFinalPrice({
    price: 68.9,
    pix_price: 65.45,
  });
  assert.equal(final, 65.45);
});

test("offer audit: delta classification supports mismatch computation", () => {
  const delta = computePriceDelta(205, 201);
  assert.equal(delta.valid, true);
  assert.equal(Number(delta.deltaAbs?.toFixed(2)), 4);
  assert.equal(Number(delta.deltaPct?.toFixed(2)), 1.95);
});

test("repair policy: broken active offer moves to standby", () => {
  const result = evaluateActiveOfferIntegrity({
    marketplace: "mercadolivre",
    status: "active",
    is_active: true,
    affiliate_link: null,
    source_url: "https://www.mercadolivre.com.br/p/MLB4478549231",
    external_id: "MLB4478549231",
  });
  assert.equal(result.ok, false);
  assert.equal(result.action, "MOVE_TO_STANDBY");
  assert.equal(result.reason, "BROKEN_OFFER_URL");
});

test("repair policy: valid sec link keeps active", () => {
  const result = evaluateActiveOfferIntegrity({
    marketplace: "mercadolivre",
    status: "active",
    is_active: true,
    affiliate_link: "https://mercadolivre.com/sec/1KdZ6HV",
    canonical_offer_url: "https://produto.mercadolivre.com.br/MLB4478549231",
    ml_item_id: "MLB4478549231",
  });
  assert.equal(result.ok, true);
  assert.equal(result.action, "KEEP_ACTIVE");
  assert.equal(result.destinationMlItemId, "MLB4478549231");
});

test("pricing guardrail: final price does not use previous/list as current", () => {
  const pricing = resolveFinalPriceInfo({
    price: 239.9,
    original_price: 239.9,
    previous_price: 349,
    pix_price: null,
  });
  assert.equal(pricing.finalPrice, 239.9);
});
