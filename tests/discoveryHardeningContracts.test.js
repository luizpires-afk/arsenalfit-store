import test from "node:test";
import assert from "node:assert/strict";

import {
  DISCOVERY_SCORE_PAYLOAD_VERSION,
  buildScorePayload,
  classifyDiscoveryError,
} from "../shared/discoveryContracts.js";
import {
  parseCategoryGate,
  detectCategoryBucket,
} from "../scripts/seo-page-release-scheduler.js";
import { acquireLock } from "../scripts/viral-momentum-refresh.js";

test("seo category gate: parse normalizes keys and ignores invalid input", () => {
  const parsed = parseCategoryGate('{"Creatina":0.62," whey ":"0.58","":0.9}');

  assert.deepEqual(parsed, {
    creatina: 0.62,
    whey: 0.58,
  });
  assert.deepEqual(parseCategoryGate("not-json"), {});
});

test("seo category gate: detect bucket from keyword/title", () => {
  const map = { creatina: 0.62, whey: 0.58 };

  const byKeyword = detectCategoryBucket({ keyword: "melhor creatina monohidratada" }, map);
  const byTitle = detectCategoryBucket({ title: "Top Whey isolado 900g" }, map);
  const fallback = detectCategoryBucket({ keyword: "pre treino" }, map);

  assert.equal(byKeyword, "creatina");
  assert.equal(byTitle, "whey");
  assert.equal(fallback, "default");
});

test("viral refresh lock: returns already_locked when lock is active", async () => {
  const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const calls = [];

  const client = {
    request: async (path, options) => {
      calls.push({ path, method: options?.method || "GET" });
      if (String(options?.method) === "GET") {
        return [{ job_name: "viral-momentum-refresh-6h", locked_until: future }];
      }
      throw new Error("post_should_not_happen_when_locked");
    },
  };

  const result = await acquireLock(client, "viral-momentum-refresh-6h", "test-runner", 25);

  assert.equal(result.acquired, false);
  assert.equal(result.reason, "already_locked");
  assert.equal(calls.length, 1);
});

test("viral refresh lock: acquires lock and writes merged lock row", async () => {
  const calls = [];

  const client = {
    request: async (path, options) => {
      calls.push({ path, method: options?.method || "GET", body: options?.body || null });
      if (String(options?.method) === "GET") return [];
      if (String(options?.method) === "POST") return null;
      return null;
    },
  };

  const result = await acquireLock(client, "viral-momentum-refresh-6h", "test-runner", 5);

  assert.equal(result.acquired, true);
  assert.ok(result.locked_until);
  assert.equal(calls.length, 2);
  assert.match(calls[1].path, /discovery_job_locks\?on_conflict=job_name/);
});

test("payload version contract: score payload defaults to discovery contract version", () => {
  const payload = buildScorePayload({
    opportunity: { score: 88, components: { price_drop: 30 } },
    viral: { score: 71, score_version: "v4" },
    filter: { accepted: true, reasons: [] },
    metadata: { external_product_id: "MLB123" },
  });

  assert.equal(payload.payload_version, DISCOVERY_SCORE_PAYLOAD_VERSION);
  assert.equal(payload.opportunity.score, 88);
  assert.equal(payload.viral.score, 71);
  assert.equal(payload.filter.accepted, true);
});

test("payload taxonomy: classifyDiscoveryError maps known codes to priority", () => {
  const p1 = classifyDiscoveryError("critical_baseline_breach");
  const p2 = classifyDiscoveryError("collector_degraded while collecting terms");
  const p3 = classifyDiscoveryError("other_non_mapped_error");

  assert.equal(p1.priority, "P1");
  assert.equal(p2.priority, "P2");
  assert.equal(p3.priority, "P3");
});
