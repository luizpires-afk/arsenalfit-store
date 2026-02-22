import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  PRICE_PRIORITY,
  PRICE_SOURCE,
  resolvePriorityAndTtl,
  resolveFinalPriceFromSignals,
  detectPriceOutlier,
  computeBackoffUntil,
  computeDomainThrottleDelayMs,
  updateDomainCircuitState,
  isCircuitOpen,
} from "../supabase/functions/price-sync/price_check_policy.js";

test("priority/ttl: new product is HIGH", () => {
  const now = new Date("2026-02-19T12:00:00.000Z");
  const createdAt = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

  const result = resolvePriorityAndTtl({
    now,
    createdAt,
    isFeatured: false,
    clicksCount: 0,
    productName: "Produto generico",
    ttlByPriority: {
      HIGH: 75,
      MED: 480,
      LOW: 1440,
    },
  });

  assert.equal(result.priority, PRICE_PRIORITY.HIGH);
  assert.equal(result.ttlMinutes, 75);
});

test("priority/ttl: regular old product falls back to MED", () => {
  const now = new Date("2026-02-19T12:00:00.000Z");
  const createdAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const result = resolvePriorityAndTtl({
    now,
    createdAt,
    isFeatured: false,
    clicksCount: 10,
    productName: "Corda treino funcional",
    ttlByPriority: {
      HIGH: 90,
      MED: 360,
      LOW: 1440,
    },
  });

  assert.equal(result.priority, PRICE_PRIORITY.MED);
  assert.equal(result.ttlMinutes, 360);
});

test("priority/ttl: promotional product is elevated to HIGH", () => {
  const now = new Date("2026-02-19T12:00:00.000Z");
  const createdAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();

  const result = resolvePriorityAndTtl({
    now,
    createdAt,
    isFeatured: false,
    clicksCount: 2,
    isOnSale: true,
    discountPercentage: 18,
    productName: "Creatina monohidratada",
    ttlByPriority: {
      HIGH: 60,
      MED: 360,
      LOW: 1440,
    },
  });

  assert.equal(result.priority, PRICE_PRIORITY.HIGH);
  assert.equal(result.ttlMinutes, 60);
});

test("priority/ttl: high-volatility tech product is HIGH", () => {
  const now = new Date("2026-02-19T12:00:00.000Z");
  const createdAt = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();

  const result = resolvePriorityAndTtl({
    now,
    createdAt,
    isFeatured: false,
    clicksCount: 15,
    productName: "Smartwatch Xiaomi Redmi Watch 5 Active",
    ttlByPriority: {
      HIGH: 45,
      MED: 720,
      LOW: 2160,
    },
  });

  assert.equal(result.priority, PRICE_PRIORITY.HIGH);
  assert.equal(result.ttlMinutes, 45);
});

test("priority/ttl: high-volatility can run faster than HIGH default", () => {
  const now = new Date("2026-02-19T12:00:00.000Z");
  const createdAt = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();

  const result = resolvePriorityAndTtl({
    now,
    createdAt,
    isFeatured: false,
    clicksCount: 5,
    productName: "Smartwatch Samsung Galaxy Fit3",
    ttlByPriority: {
      HIGH: 120,
      HIGH_VOLATILITY: 35,
      MED: 720,
      LOW: 2160,
    },
  });

  assert.equal(result.priority, PRICE_PRIORITY.HIGH);
  assert.equal(result.ttlMinutes, 35);
});

test("priority/ttl: catalog priority LOW is respected for older products", () => {
  const now = new Date("2026-02-19T12:00:00.000Z");
  const createdAt = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString();

  const result = resolvePriorityAndTtl({
    now,
    createdAt,
    isFeatured: false,
    clicksCount: 5,
    productName: "Camiseta dry fit treino masculino",
    catalogPriority: "LOW",
    ttlByPriority: {
      HIGH: 120,
      MED: 720,
      LOW: 2160,
    },
  });

  assert.equal(result.priority, PRICE_PRIORITY.LOW);
  assert.equal(result.ttlMinutes, 2160);
});

test("price precedence: valid API pix wins as unique final price", () => {
  const result = resolveFinalPriceFromSignals({
    apiPrice: 78.9,
    apiPixPrice: 69.9,
    scrapedPrice: 79.0,
    requireScraperWhenNoPix: true,
  });

  assert.equal(result.finalPrice, 69.9);
  assert.equal(result.source, PRICE_SOURCE.API_PIX);
});

test("price precedence: no pix uses API base", () => {
  const result = resolveFinalPriceFromSignals({
    apiPrice: 78.9,
    apiPixPrice: null,
    scrapedPrice: 77.4,
    requireScraperWhenNoPix: true,
  });

  assert.equal(result.finalPrice, 78.9);
  assert.equal(result.source, PRICE_SOURCE.API_BASE);
});

test("price precedence: ignores scraper when it looks like stale list price", () => {
  const result = resolveFinalPriceFromSignals({
    apiPrice: 68.9,
    apiPixPrice: null,
    scrapedPrice: 239.9,
    requireScraperWhenNoPix: true,
  });

  assert.equal(result.finalPrice, 68.9);
  assert.equal(result.source, PRICE_SOURCE.API_BASE);
});

test("price precedence: ignores scraper when it is far below API without pix confirmation", () => {
  const result = resolveFinalPriceFromSignals({
    apiPrice: 349,
    apiPixPrice: null,
    scrapedPrice: 171.9,
    requireScraperWhenNoPix: true,
  });

  assert.equal(result.finalPrice, 349);
  assert.equal(result.source, PRICE_SOURCE.API_BASE);
});

test("price precedence: fallback API_BASE when scraper unavailable", () => {
  const result = resolveFinalPriceFromSignals({
    apiPrice: 78.9,
    apiPixPrice: null,
    scrapedPrice: null,
    requireScraperWhenNoPix: false,
  });

  assert.equal(result.finalPrice, 78.9);
  assert.equal(result.source, PRICE_SOURCE.API_BASE);
});

test("outlier detector flags >30% variation", () => {
  const outlier = detectPriceOutlier({
    previousPrice: 100,
    newPrice: 60,
    percentThreshold: 0.3,
    absoluteThreshold: 60,
  });

  assert.equal(outlier.isOutlier, true);
  assert.ok(outlier.percentDelta > 0.3);
});

test("rate limiter returns positive wait when requests are too close", () => {
  const now = new Date("2026-02-19T12:00:10.000Z");
  const lastRequestAt = "2026-02-19T12:00:00.000Z";

  const delay = computeDomainThrottleDelayMs({
    now,
    lastRequestAt,
    minIntervalSeconds: 15,
    maxIntervalSeconds: 15,
    randomFn: () => 0,
  });

  assert.equal(delay, 5000);
});

test("integration-like: repeated 429 opens circuit and backoff grows", () => {
  const now = new Date("2026-02-19T12:00:00.000Z");
  let state = {
    consecutiveErrors: 0,
    circuitOpenUntil: null,
    lastStatusCode: null,
    lastRequestAt: null,
  };

  for (let i = 0; i < 5; i += 1) {
    state = updateDomainCircuitState({
      state,
      statusCode: 429,
      now,
      errorThreshold: 5,
      openSeconds: 900,
    });
  }

  assert.equal(state.consecutiveErrors, 5);
  assert.equal(isCircuitOpen(state, now), true);

  const backoff1 = computeBackoffUntil({
    failCount: 1,
    now,
    baseMs: 60_000,
    maxMs: 3_600_000,
    jitterRatio: 0,
    randomFn: () => 0,
  });
  const backoff3 = computeBackoffUntil({
    failCount: 3,
    now,
    baseMs: 60_000,
    maxMs: 3_600_000,
    jitterRatio: 0,
    randomFn: () => 0,
  });

  assert.ok(new Date(backoff3).getTime() > new Date(backoff1).getTime());

  const healed = updateDomainCircuitState({
    state,
    statusCode: 200,
    now: new Date("2026-02-19T12:20:00.000Z"),
    errorThreshold: 5,
    openSeconds: 900,
  });
  assert.equal(isCircuitOpen(healed, new Date("2026-02-19T12:20:00.000Z")), false);
});

test("guardrail: price-sync must not hard-code automatic is_active=false", () => {
  const content = fs.readFileSync("supabase/functions/price-sync/index.ts", "utf8");
  assert.equal(/is_active\s*:\s*false/.test(content), false);
});
