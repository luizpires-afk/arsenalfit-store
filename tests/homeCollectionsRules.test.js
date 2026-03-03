import test from "node:test";
import assert from "node:assert/strict";

import {
  selectBestDeals,
  selectEliteProducts,
  selectLatestDiversifiedProducts,
  selectPriceDropsToday,
} from "../src/lib/homeCollections.js";

const mk = (id, overrides = {}) => ({
  id,
  name: `Produto ${id}`,
  is_active: true,
  category_id: "cat-a",
  price: 80,
  original_price: 100,
  is_on_sale: true,
  discount_percentage: 20,
  updated_at: "2026-03-03T12:00:00.000Z",
  ...overrides,
});

test("best deals inclui somente desconto >= 20%", () => {
  const rows = [
    mk("a", { price: 80, original_price: 100 }),
    mk("b", { price: 85, original_price: 100, discount_percentage: 15 }),
  ];

  const out = selectBestDeals({ products: rows, minDiscountPercent: 20, limit: 16 });
  assert.deepEqual(out.map((item) => item.id), ["a"]);
});

test("price drops hoje inclui apenas < 20% e queda no dia atual (Sao Paulo)", () => {
  const now = new Date("2026-03-03T18:00:00.000Z");
  const rows = [
    mk("ok", {
      category_id: "cat-a",
      price: 90,
      original_price: 100,
      detected_at: "2026-03-03T13:20:00.000Z",
    }),
    mk("high", {
      category_id: "cat-b",
      price: 70,
      original_price: 100,
      detected_at: "2026-03-03T13:30:00.000Z",
    }),
    mk("yesterday", {
      category_id: "cat-c",
      price: 90,
      original_price: 100,
      detected_at: "2026-03-02T23:00:00.000Z",
    }),
  ];

  const out = selectPriceDropsToday({
    products: rows,
    bestDealIds: new Set(),
    minDiscountExclusive: 20,
    now,
    timeZone: "America/Sao_Paulo",
    limit: 16,
  });

  assert.deepEqual(out.map((item) => item.id), ["ok"]);
});

test("elite prioriza destaque/badge e maior ticket", () => {
  const rows = [
    mk("base", { price: 300, original_price: 320, is_featured: false }),
    mk("featured", { price: 250, is_featured: true }),
    mk("elite-badge", { price: 240, curation_badges: ["ELITE"] }),
  ];

  const out = selectEliteProducts({ products: rows, limit: 3 });
  assert.equal(out[0].id, "featured");
  assert.equal(out[1].id, "elite-badge");
});

test("latest diversified retorna 12 mais recentes com diversidade de categoria", () => {
  const rows = [
    mk("1", { category_id: "cat-a", updated_at: "2026-03-03T12:00:00.000Z" }),
    mk("2", { category_id: "cat-a", updated_at: "2026-03-03T11:59:00.000Z" }),
    mk("3", { category_id: "cat-b", updated_at: "2026-03-03T11:58:00.000Z" }),
    mk("4", { category_id: "cat-c", updated_at: "2026-03-03T11:57:00.000Z" }),
  ];

  const out = selectLatestDiversifiedProducts({ products: rows, limit: 3 });
  assert.deepEqual(out.map((item) => item.id), ["1", "3", "4"]);
});
