#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"

RUN_TS="$(date +%Y-%m-%dT%H:%M:%S%z)"
RUN_LOG="$LOG_DIR/ml-30m-sync-cycle.log"
RUN_EPOCH_START="$(date +%s)"

cd "$PROJECT_ROOT"

echo "[$RUN_TS] [ml_30m_sync_cycle] START" >> "$RUN_LOG"

FAILED_STEPS=0

run_step() {
	local step="$1"
	echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] [ml_30m_sync_cycle] step_start=${step}" >> "$RUN_LOG"
	if npm run "$step" >> "$RUN_LOG" 2>&1; then
		echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] [ml_30m_sync_cycle] step_ok=${step}" >> "$RUN_LOG"
	else
		FAILED_STEPS=$((FAILED_STEPS + 1))
		echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] [ml_30m_sync_cycle] step_failed=${step}" >> "$RUN_LOG"
	fi
}

run_step "ai_trend_predictor"
run_step "fitness_trend_discovery"
run_step "competitor_spy_engine"
run_step "catalog_ingest_auto"
run_step "product_validator_auto"
run_step "price_history_update"
run_step "deal_detector_30m"
run_step "undervalued_product_detector"
run_step "recalculate_product_scores_auto"
run_step "ai_profit_predictor"
run_step "conversion_optimizer"
run_step "ai_dynamic_pricing"
run_step "ai_ads_optimizer"
run_step "ai_product_description_generator"
run_step "curate_store_products"
run_step "seo_page_generator"
run_step "programmatic_seo_engine"
run_step "seo_keyword_expander"

echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] [ml_30m_sync_cycle] END" >> "$RUN_LOG"

RUN_EPOCH_END="$(date +%s)"
PIPELINE_DURATION_SEC="$((RUN_EPOCH_END - RUN_EPOCH_START))"

HEALTH_JSON="$(node - <<'NODE'
const fs = require('fs');

function readJson(path) {
	try {
		return JSON.parse(fs.readFileSync(path, 'utf8'));
	} catch {
		return null;
	}
}

const trend = readJson('logs/ai-trend-predictor.json') || {};
const totals = trend.totals || {};

const status = trend.ok === true && trend.skipped !== true
	? 'active'
	: 'inactive';

const out = {
	trend_predictor_status: status,
	trends_loaded: Number(totals.predicted ?? totals.collected_signals ?? 0) || 0,
	products_updated_with_trend_score: Number(totals.products_trend_score_updated ?? 0) || 0,
};

process.stdout.write(JSON.stringify(out));
NODE
)"

echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] [ml_30m_sync_cycle] health_check=${HEALTH_JSON} pipeline_duration=${PIPELINE_DURATION_SEC}s" >> "$RUN_LOG"

if [ "$FAILED_STEPS" -gt 0 ]; then
	echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] [ml_30m_sync_cycle] completed_with_errors failed_steps=${FAILED_STEPS}" >> "$RUN_LOG"
else
	echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] [ml_30m_sync_cycle] completed_ok" >> "$RUN_LOG"
fi
