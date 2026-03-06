import os from "os";
import {
  DEFAULT_ENV,
  getArg,
  toInt,
  parseEnvAndClient,
  getMlToken,
  writeJson,
} from "./_affiliate_catalog_common.js";
import { mlCollectorService } from "./discovery/mlCollectorService.js";
import { opportunityScoringService } from "./discovery/opportunityScoringService.js";
import { viralScoringService } from "./discovery/viralScoringService.js";
import { discoveryFilterService } from "./discovery/discoveryFilterService.js";
import { upsertDiscoveryCandidates, writeCandidateEvent } from "./discovery/discoveryQueueService.js";
import { alertService } from "./discovery/alertService.js";
import { loadViralMomentumConfig } from "./discovery/viralMomentumConfig.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "reports/discovery-intelligence-report.json");
const perTermLimit = Math.max(5, Math.min(50, toInt(getArg("--per-term-limit", "25"), 25)));
const lockMinutes = Math.max(5, Math.min(60, toInt(getArg("--lock-minutes", "25"), 25)));
const minExpectedCollected = Math.max(0, toInt(getArg("--min-expected-collected", process.env.DISCOVERY_MIN_EXPECTED_COLLECTED || "10"), 10));

const nowIso = () => new Date().toISOString();

const buildInFilter = (values) =>
  values
    .filter(Boolean)
    .map((v) => `"${String(v).replace(/"/g, '\\"')}"`)
    .join(",");

const chunkRows = (rows, size = 200) => {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
};

const acquireLock = async (client, lockName, lockedBy, lockForMinutes) => {
  const existing = await client.request(`/discovery_job_locks?select=job_name,locked_until&job_name=eq.${encodeURIComponent(lockName)}`, { method: "GET" });
  const row = Array.isArray(existing) ? existing[0] : null;
  const now = Date.now();
  const lockedUntilTs = row?.locked_until ? new Date(row.locked_until).getTime() : 0;

  if (lockedUntilTs > now) {
    return { acquired: false, reason: "already_locked", locked_until: row.locked_until };
  }

  const nextLock = new Date(now + lockForMinutes * 60 * 1000).toISOString();
  await client.request("/discovery_job_locks?on_conflict=job_name", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      {
        job_name: lockName,
        locked_until: nextLock,
        locked_by: lockedBy,
      },
    ]),
  });

  return { acquired: true, locked_until: nextLock };
};

const loadPreviousSnapshots = async (client, externalIds) => {
  const filter = buildInFilter(externalIds);
  if (!filter) return new Map();
  const rows = await client.request(
    `/discovery_products?select=*&marketplace=eq.mercadolivre&external_product_id=in.(${filter})`,
    { method: "GET" },
  );
  const map = new Map();
  for (const row of rows || []) map.set(row.external_product_id, row);
  return map;
};

const loadHistoricalAverageMap = async (client, externalIds) => {
  const filter = buildInFilter(externalIds);
  if (!filter) return new Map();

  const rows = await client.request(
    `/discovery_price_history?select=external_product_id,price,captured_at&marketplace=eq.mercadolivre&external_product_id=in.(${filter})&order=captured_at.desc&limit=5000`,
    { method: "GET" },
  );

  const grouped = new Map();
  for (const row of rows || []) {
    const key = row.external_product_id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(Number(row.price || 0));
  }

  const avgMap = new Map();
  for (const [key, values] of grouped.entries()) {
    const valid = values.filter((v) => Number.isFinite(v) && v > 0);
    if (!valid.length) continue;
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    avgMap.set(key, Number(avg.toFixed(2)));
  }
  return avgMap;
};

const loadTrendHistoryMap = async (client, externalIds) => {
  const filter = buildInFilter(externalIds);
  if (!filter) return new Map();

  const rows = await client.request(
    `/product_trend_history?select=external_product_id,captured_at,sales_count,reviews_count,questions_count,favorites_count,stock,search_trend_score,social_mentions,engagement_score,signal_confidence&marketplace=eq.mercadolivre&external_product_id=in.(${filter})&order=captured_at.desc&limit=10000`,
    { method: "GET" },
  ).catch(() => []);

  const grouped = new Map();
  for (const row of rows || []) {
    const key = String(row?.external_product_id || "");
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
};

async function main() {
  const { env, client } = parseEnvAndClient(envFile);
  const viralConfig = loadViralMomentumConfig({ ...process.env, ...env });
  const token = getMlToken(env);
  const lockName = "discovery-intelligence-30m";
  const lockBy = `${os.hostname()}:${process.pid}`;
  const roundId = `discovery-round-${Date.now()}`;

  const lock = await acquireLock(client, lockName, lockBy, lockMinutes);
  if (!lock.acquired) {
    const report = {
      generated_at: nowIso(),
      ok: true,
      skipped: true,
      reason: lock.reason,
      lock,
    };
    writeJson(outFile, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const collected = await mlCollectorService({
    terms: undefined,
    token,
    perTermLimit,
  });

  const externalIds = collected.products.map((p) => p.external_product_id);
  const previousMap = await loadPreviousSnapshots(client, externalIds);
  const historicalAvgMap = await loadHistoricalAverageMap(client, externalIds);
  const trendHistoryMap = await loadTrendHistoryMap(client, externalIds);

  const snapshotRows = [];
  const metricsRows = [];
  const historyRows = [];
  const viralSignalRows = [];
  const trendKeywordRows = [];
  const productTrendHistoryRows = [];
  const viralScoreRows = [];
  const acceptedCandidateRows = [];
  const filteredRows = [];
  const itemErrors = [];

  for (const product of collected.products) {
    try {
      const previous = previousMap.get(product.external_product_id) || null;
      const historicalAvg = historicalAvgMap.get(product.external_product_id) || null;

      const opp = opportunityScoringService({
        product,
        previousSnapshot: previous,
        historicalAvgPrice: historicalAvg,
      });

      const historySeries = trendHistoryMap.get(product.external_product_id) || [];
      const viral = viralScoringService({
        product,
        previousSnapshot: previous,
        historySeries,
        config: viralConfig,
        roundId,
      });
      const filter = discoveryFilterService({
        product,
        opportunityScore: opp.score,
        viralScore: viral.score,
        signalConfidence: viral.signal_confidence,
        config: viralConfig,
      });

      const mergedComponents = {
        opportunity: { score: opp.score, ...opp },
        viral: { score: viral.score, ...viral },
        filter,
      };

      const base = {
        ...product,
        opportunity_score: Math.round(opp.score),
        viral_score: Math.round(viral.score),
        viral_momentum_score: Number(viral.score.toFixed(3)),
        score_version: viral.score_version,
        score_components: mergedComponents,
        updated_at: nowIso(),
      };

      snapshotRows.push(base);

      metricsRows.push({
        marketplace: product.marketplace,
        external_product_id: product.external_product_id,
        captured_at: nowIso(),
        current_price: product.current_price,
        original_price: product.original_price,
        discount_percent: product.discount_percent,
        sold_quantity: product.sold_quantity,
        reviews_count: product.reviews_count,
        rating: product.rating,
        stock: product.stock,
        favorites_count: product.favorites_count,
        opportunity_score: Math.round(opp.score),
        viral_score: Math.round(viral.score),
        viral_momentum_score: Number(viral.score.toFixed(3)),
        score_version: viral.score_version,
        opportunity_components: { ...opp.components, ...opp.explanation },
        viral_components: {
          ...(viral.components || {}),
          ...(viral.explanation || {}),
          top_signals: viral.top_signals,
          windows: viral.windows,
        },
        raw_signal: {
          source_terms: product.source_terms,
          matched_terms_count: product.matched_terms_count,
        },
      });

      viralSignalRows.push(...(viral.signals?.windowsRows || []));
      trendKeywordRows.push(...(viral.signals?.trendKeywordRows || []));
      if (viral.signals?.trendHistoryRow) productTrendHistoryRows.push(viral.signals.trendHistoryRow);

      viralScoreRows.push({
        round_id: roundId,
        marketplace: product.marketplace,
        external_product_id: product.external_product_id,
        score_version: viral.score_version,
        score: Number(viral.score.toFixed(3)),
        reliability_penalty: Number((viral.reliability_penalty || 0).toFixed(3)),
        score_components: viral.score_components || {},
        decision_reason: String(viral.decision_reason || ""),
        windows: viral.windows || {},
        created_at: nowIso(),
        updated_at: nowIso(),
      });

      if (Number(product.current_price || 0) > 0) {
        historyRows.push({
          marketplace: product.marketplace,
          external_product_id: product.external_product_id,
          captured_at: nowIso(),
          price: product.current_price,
        });
      }

      if (filter.accepted) {
        acceptedCandidateRows.push({
          marketplace: product.marketplace,
          external_product_id: product.external_product_id,
          title: product.title,
          category: product.category,
          seller: product.seller,
          seller_reputation: product.seller_reputation,
          affiliate_link: product.affiliate_link,
          product_url: product.product_url,
          current_price: product.current_price,
          original_price: product.original_price,
          discount_percent: product.discount_percent,
          sold_quantity: product.sold_quantity,
          reviews_count: product.reviews_count,
          rating: product.rating,
          stock: product.stock,
          favorites_count: product.favorites_count,
          opportunity_score: Math.round(opp.score),
          viral_score: Math.round(viral.score),
          viral_momentum_score: Number(viral.score.toFixed(3)),
          signal_origin: "collector",
          score_components: mergedComponents,
          status: "new",
          confidence: Number(Math.min(1, ((opp.score * 0.55 + viral.score * 0.45) / 100) * (viral.signal_confidence || 0.6)).toFixed(3)),
          score_version: viral.score_version,
          score_decision_reason: String(viral.decision_reason || ""),
          updated_at: nowIso(),
        });
      } else {
        filteredRows.push({ external_product_id: product.external_product_id, reasons: filter.reasons });
      }
    } catch (error) {
      itemErrors.push({
        external_product_id: product?.external_product_id || null,
        title: product?.title || null,
        message: String(error?.message || error || "item_processing_error"),
      });
    }
  }

  if (snapshotRows.length) {
    await client.request("/discovery_products?on_conflict=marketplace,external_product_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(snapshotRows),
    });
  }

  const productRows = await loadPreviousSnapshots(client, externalIds);

  if (metricsRows.length) {
    for (const metric of metricsRows) {
      const linked = productRows.get(metric.external_product_id);
      metric.discovery_product_id = linked?.id || null;
    }
    await client.request("/discovery_product_metrics", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(metricsRows),
    });
  }

  if (historyRows.length) {
    for (const row of historyRows) {
      const linked = productRows.get(row.external_product_id);
      row.discovery_product_id = linked?.id || null;
    }
    await client.request("/discovery_price_history", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(historyRows),
    });
  }

  if (viralSignalRows.length) {
    for (const row of viralSignalRows) {
      const linked = productRows.get(row.external_product_id);
      row.discovery_product_id = linked?.id || null;
    }
    for (const batch of chunkRows(viralSignalRows, 300)) {
      await client.request("/viral_signals?on_conflict=round_id,marketplace,external_product_id,signal_window", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(batch),
      }).catch(() => null);
    }
  }

  if (trendKeywordRows.length) {
    for (const batch of chunkRows(trendKeywordRows, 500)) {
      await client.request("/trend_keywords", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(batch.map(({ _round_id, _external_product_id, ...row }) => row)),
      }).catch(() => null);
    }
  }

  if (productTrendHistoryRows.length) {
    for (const row of productTrendHistoryRows) {
      const linked = productRows.get(row.external_product_id);
      row.discovery_product_id = linked?.id || null;
    }
    for (const batch of chunkRows(productTrendHistoryRows, 300)) {
      await client.request("/product_trend_history", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(batch),
      }).catch(() => null);
    }
  }

  if (viralScoreRows.length) {
    for (const row of viralScoreRows) {
      const linked = productRows.get(row.external_product_id);
      row.discovery_product_id = linked?.id || null;
    }
    for (const batch of chunkRows(viralScoreRows, 300)) {
      await client.request("/viral_scores?on_conflict=round_id,marketplace,external_product_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(batch),
      }).catch(() => null);
    }
  }

  for (const row of acceptedCandidateRows) {
    const linked = productRows.get(row.external_product_id);
    row.discovery_product_id = linked?.id || null;
  }

  const dedupAcceptedMap = new Map();
  for (const row of acceptedCandidateRows) {
    const key = `${String(row.marketplace || "").toLowerCase()}::${String(row.external_product_id || "")}`;
    const existing = dedupAcceptedMap.get(key);
    if (!existing) {
      dedupAcceptedMap.set(key, row);
      continue;
    }
    const currentScore = Number(row?.opportunity_score || 0) + Number(row?.viral_score || 0);
    const existingScore = Number(existing?.opportunity_score || 0) + Number(existing?.viral_score || 0);
    if (currentScore > existingScore) {
      dedupAcceptedMap.set(key, row);
    }
  }

  const dedupAcceptedRows = Array.from(dedupAcceptedMap.values());
  const upsertedCandidates = await upsertDiscoveryCandidates({ client, acceptedRows: dedupAcceptedRows });

  const candidateByExternalId = new Map();
  for (const row of upsertedCandidates || []) {
    candidateByExternalId.set(String(row?.external_product_id || ""), row);
  }

  if (viralScoreRows.length) {
    const scoreRowsWithCandidates = viralScoreRows
      .map((row) => {
        const candidate = candidateByExternalId.get(String(row.external_product_id || ""));
        return {
          ...row,
          candidate_id: candidate?.id || null,
        };
      })
      .filter((row) => row.candidate_id);

    for (const batch of chunkRows(scoreRowsWithCandidates, 200)) {
      await client.request("/viral_scores?on_conflict=round_id,marketplace,external_product_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(batch),
      }).catch(() => null);
    }
  }

  if (collected.products.length < minExpectedCollected) {
    await client.request("/discovery_alerts", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([
        {
          marketplace: "mercadolivre",
          external_product_id: "baseline",
          alert_type: "pipeline_issue",
          severity: "critical",
          status: "new",
          message: `discovery ingestion below baseline: collected=${collected.products.length}, expected_min=${minExpectedCollected}`,
          payload: {
            expected_min_collected: minExpectedCollected,
            collected: collected.products.length,
            collector_errors: collected.errors?.length || 0,
          },
        },
      ]),
    }).catch(() => null);
  }

  for (const candidate of upsertedCandidates) {
    await writeCandidateEvent({
      client,
      candidateId: candidate.id,
      previousStatus: null,
      nextStatus: candidate.status,
      eventType: candidate.status === "new" ? "reviewing" : "reviewing",
      payload: {
        opportunity_score: candidate.opportunity_score,
        viral_score: candidate.viral_score,
      },
      actor: "system",
    });

    await alertService({
      client,
      candidate,
      webhookUrl: env.DISCOVERY_ALERT_WEBHOOK || process.env.DISCOVERY_ALERT_WEBHOOK || null,
    });
  }

  const report = {
    generated_at: nowIso(),
    ok: true,
    lock,
    totals: {
      collected: collected.products.length,
      accepted: dedupAcceptedRows.length,
      filtered: filteredRows.length,
      errors: collected.errors.length + itemErrors.length,
    },
    filtered_samples: filteredRows.slice(0, 25),
    collector_errors: collected.errors,
    item_errors: itemErrors,
    baseline_guard: {
      expected_min_collected: minExpectedCollected,
      collected: collected.products.length,
      below_baseline: collected.products.length < minExpectedCollected,
    },
    operational_risk: {
      deduped_candidates_removed: Math.max(0, acceptedCandidateRows.length - dedupAcceptedRows.length),
      collector_error_rate: Number(((collected.errors.length / Math.max(1, collected.products.length + collected.errors.length)) * 100).toFixed(2)),
      item_error_rate: Number(((itemErrors.length / Math.max(1, collected.products.length)) * 100).toFixed(2)),
      viral_scores_generated: viralScoreRows.length,
      viral_signals_collected: viralSignalRows.length,
      risk_level:
        collected.products.length < minExpectedCollected || collected.errors.length >= 5
          ? "high"
          : itemErrors.length > 0
            ? "medium"
            : "low",
    },
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
