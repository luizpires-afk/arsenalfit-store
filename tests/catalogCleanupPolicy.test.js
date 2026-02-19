import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeMlExternalId,
  normalizeMlPermalink,
  resolveDuplicateKey,
  pickCanonicalProduct,
  classifyHealthStatus,
  shouldReactivateProduct,
} from "../supabase/functions/catalog-cleanup-unblock/cleanup_policy.js";

test("normaliza MLB external id de url/permalink", () => {
  assert.equal(normalizeMlExternalId("https://produto.mercadolivre.com.br/MLB-1234567890-item-_JM"), "MLB1234567890");
  assert.equal(normalizeMlExternalId("mlb999888777"), "MLB999888777");
});

test("normaliza permalink removendo query/hash", () => {
  const value = normalizeMlPermalink("https://www.mercadolivre.com.br/p/MLB123456?pdp_filters=item_id:MLB123#origin=share");
  assert.equal(value, "https://www.mercadolivre.com.br/p/MLB123456");
});

test("dedupe key prioriza external_id", () => {
  const key = resolveDuplicateKey({
    external_id: "MLB123456789",
    source_url: "https://www.mercadolivre.com.br/p/MLB000001",
    name: "Creatina 300g",
  });
  assert.equal(key, "external:MLB123456789");
});

test("seleciona canonicidade priorizando ativo/validado", () => {
  const older = {
    id: "a",
    is_active: true,
    status: "active",
    affiliate_verified: true,
    validated_at: "2026-02-01T10:00:00.000Z",
    image_url: "https://img",
    description: "descricao completa de produto para manter canonicidade",
    created_at: "2025-01-01T00:00:00.000Z",
    clicks_count: 20,
  };
  const newer = {
    id: "b",
    is_active: false,
    status: "standby",
    affiliate_verified: false,
    validated_at: null,
    image_url: null,
    description: "",
    created_at: "2026-01-01T00:00:00.000Z",
    clicks_count: 5,
  };
  const picked = pickCanonicalProduct([newer, older], new Map());
  assert.equal(picked?.id, "a");
});

test("classifica INVALID_SOURCE quando nao existe id/permalink", () => {
  const result = classifyHealthStatus({
    product: { name: "Produto sem fonte" },
    identifiers: { externalId: null, permalink: null },
    isDuplicate: false,
    priceCheckState: null,
    latestAnomalyNote: null,
    maxFailuresBeforeApiMissing: 3,
  });
  assert.equal(result.status, "INVALID_SOURCE");
});

test("classifica API_MISSING por falha repetida", () => {
  const result = classifyHealthStatus({
    product: { price: 89.9 },
    identifiers: { externalId: "MLB123", permalink: null },
    isDuplicate: false,
    priceCheckState: { fail_count: 4, last_error_code: "http_404" },
    latestAnomalyNote: null,
    maxFailuresBeforeApiMissing: 3,
  });
  assert.equal(result.status, "API_MISSING");
});

test("reativa item bloqueado valido com afiliado", () => {
  const should = shouldReactivateProduct({
    product: {
      is_active: false,
      status: "standby",
      external_id: "MLB123456789",
      affiliate_verified: true,
      auto_disabled_reason: "blocked",
      last_sync: "2026-02-19T10:00:00.000Z",
      price: 79.9,
    },
    healthStatus: "HEALTHY",
    isDuplicate: false,
  });
  assert.equal(should, true);
});

test("nao reativa duplicado", () => {
  const should = shouldReactivateProduct({
    product: {
      is_active: false,
      status: "standby",
      external_id: "MLB123456789",
      affiliate_verified: true,
      price: 79.9,
    },
    healthStatus: "HEALTHY",
    isDuplicate: true,
  });
  assert.equal(should, false);
});
