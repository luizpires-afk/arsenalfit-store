import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  toInt,
  writeJson,
} from "./_affiliate_catalog_common.js";
import { loadViralMomentumConfig } from "./discovery/viralMomentumConfig.js";
import { viralScoringService } from "./discovery/viralScoringService.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "reports/viral-momentum-refresh-report.json");
const limit = Math.max(50, Math.min(5000, toInt(getArg("--limit", "1200"), 1200)));
const roundId = getArg("--round-id", `viral-refresh-${Date.now()}`);

const buildInFilter = (values) =>
  values
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .map((v) => `"${v.replace(/"/g, '\\"')}"`)
    .join(",");

const chunk = (rows, size = 200) => {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
};

const loadHistoryMap = async (client, externalIds) => {
  const inFilter = buildInFilter(externalIds);
  if (!inFilter) return new Map();
  const rows = await client.request(
    `/product_trend_history?select=external_product_id,captured_at,sales_count,reviews_count,questions_count,favorites_count,stock,search_trend_score,social_mentions,engagement_score,signal_confidence&marketplace=eq.mercadolivre&external_product_id=in.(${inFilter})&order=captured_at.desc&limit=15000`,
    { method: "GET" },
  ).catch(() => []);

  const map = new Map();
  for (const row of rows || []) {
    const key = String(row?.external_product_id || "");
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
};

const main = async () => {
  const { env, client } = parseEnvAndClient(envFile);
  const config = loadViralMomentumConfig({ ...process.env, ...env });
  const nowIso = new Date().toISOString();

  const products = await client.fetchPagedRows(
    `/discovery_products?select=id,marketplace,external_product_id,title,category,seller,seller_reputation,affiliate_link,product_url,current_price,original_price,discount_percent,sold_quantity,reviews_count,rating,stock,favorites_count,source_terms,matched_terms_count,opportunity_score,viral_score,updated_at&marketplace=eq.mercadolivre&order=updated_at.desc&limit=${limit}`,
    1000,
  );

  const externalIds = (products || []).map((row) => row.external_product_id);
  const historyMap = await loadHistoryMap(client, externalIds);

  const updates = [];
  const scoreRows = [];
  const errors = [];

  for (const row of products || []) {
    try {
      const historySeries = historyMap.get(String(row.external_product_id || "")) || [];
      const scored = viralScoringService({
        product: row,
        previousSnapshot: null,
        historySeries,
        config,
        roundId,
      });

      updates.push({
        id: row.id,
        viral_score: Math.round(scored.score),
        opportunity_score: Math.round(Number(row.opportunity_score || 0)),
        score_components: {
          ...(row.score_components || {}),
          viral: {
            ...(scored.score_components || {}),
            top_signals: scored.top_signals,
            score_version: scored.score_version,
            decision_reason: scored.decision_reason,
          },
        },
        updated_at: nowIso,
      });

      scoreRows.push({
        round_id: roundId,
        marketplace: row.marketplace,
        external_product_id: row.external_product_id,
        discovery_product_id: row.id,
        score_version: scored.score_version,
        score: Number(scored.score.toFixed(3)),
        reliability_penalty: Number((scored.reliability_penalty || 0).toFixed(3)),
        score_components: scored.score_components || {},
        decision_reason: String(scored.decision_reason || ""),
        windows: scored.windows || {},
        created_at: nowIso,
        updated_at: nowIso,
      });
    } catch (error) {
      errors.push({
        external_product_id: row.external_product_id,
        message: String(error?.message || error || "score_refresh_error"),
      });
    }
  }

  for (const batch of chunk(updates, 200)) {
    await client.request("/discovery_products?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(batch),
    });
  }

  for (const batch of chunk(scoreRows, 200)) {
    await client.request("/viral_scores?on_conflict=round_id,marketplace,external_product_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(batch),
    }).catch(() => null);
  }

  const report = {
    generated_at: nowIso,
    ok: true,
    round_id: roundId,
    score_version: config.score_version,
    scanned: products.length,
    refreshed: updates.length,
    errors: errors.length,
    error_samples: errors.slice(0, 20),
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
