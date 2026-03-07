#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-supabase/functions/.env.scheduler}"
RUN_E2E="${PRODUCTION_SMOKE_RUN_E2E:-true}"
RUN_BUILD_VALIDATION="${PRODUCTION_SMOKE_RUN_BUILD_VALIDATION:-true}"
RUN_FULL_PRICING="${PRODUCTION_SMOKE_RUN_FULL_PRICING:-false}"
RUN_OPERATIONAL_SNAPSHOT="${PRODUCTION_SMOKE_RUN_OPERATIONAL_SNAPSHOT:-true}"
STRICT_CONFIG="${PRODUCTION_SMOKE_STRICT_CONFIG:-true}"
CONFIG_ERRORS=0

now_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log() {
  echo "[$(now_utc)] $*"
}

env_value() {
  local key="$1"
  local from_process="${!key:-}"
  if [[ -n "$from_process" ]]; then
    echo "$from_process"
    return 0
  fi
  if [[ -f "$ENV_FILE" ]]; then
    local line
    line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
    if [[ -n "$line" ]]; then
      echo "${line#*=}"
      return 0
    fi
  fi
  echo ""
}

check_any() {
  local label="$1"
  shift
  local key
  for key in "$@"; do
    local value
    value="$(env_value "$key")"
    if [[ -n "$value" ]]; then
      log "CONFIG_OK ${label}: ${key}"
      return 0
    fi
  done
  log "CONFIG_MISSING ${label}: expected one of [$*]"
  CONFIG_ERRORS=$((CONFIG_ERRORS + 1))
  return 1
}

validate_required_config() {
  check_any "mercado_livre_token" "MELI_ACCESS_TOKEN" "MERCADOLIVRE_ACCESS_TOKEN" "ACCESS_TOKEN" || true
  check_any "alert_webhook" "ALERT_ROUTING_P1_WEBHOOK" "ALERT_ROUTING_P2_WEBHOOK" "ALERT_ROUTING_P3_WEBHOOK" || true

  if [[ "$CONFIG_ERRORS" -gt 0 ]]; then
    if [[ "$STRICT_CONFIG" == "true" ]]; then
      log "CONFIG_FAIL strict_config=true errors=${CONFIG_ERRORS}"
      log "CONFIG_HINT set env keys in ${ENV_FILE} or process env before running readiness"
      return 1
    fi
    log "CONFIG_WARN strict_config=false errors=${CONFIG_ERRORS} (continuing in progressive mode)"
  fi

  return 0
}

run_step() {
  local label="$1"
  shift
  log "STEP_START ${label}"
  "$@"
  log "STEP_OK ${label}"
}

run_optional_step() {
  local env_flag="$1"
  local label="$2"
  shift 2
  if [[ "$env_flag" == "true" ]]; then
    run_step "$label" "$@"
  else
    log "STEP_SKIP ${label}"
  fi
}

log "PRODUCTION_SMOKE_START env_file=${ENV_FILE} run_e2e=${RUN_E2E} run_build_validation=${RUN_BUILD_VALIDATION} run_full_pricing=${RUN_FULL_PRICING} run_operational_snapshot=${RUN_OPERATIONAL_SNAPSHOT} strict_config=${STRICT_CONFIG}"

if [[ ! -f "$ENV_FILE" ]]; then
  log "CONFIG_WARN env_file_missing=${ENV_FILE} (using process env only)"
fi

validate_required_config

run_step "deployment_check" npm run system_deployment_check
run_step "pipeline_health" npm run pipeline_final_health
run_step "discovery_intelligence" npm run discovery_intelligence_run
run_step "viral_momentum_refresh" npm run viral_momentum_refresh
run_step "seo_release_scheduler" npm run seo_release_scheduler
run_step "alert_routing" npm run alert_routing

run_step "sanity_price_promo" npm run sanity_price_promo
run_step "validate_reference_pricing" npm run validate_reference_pricing
run_optional_step "$RUN_FULL_PRICING" "validate_all_products_pricing" npm run validate_all_products_pricing
run_optional_step "$RUN_OPERATIONAL_SNAPSHOT" "operational_health_snapshot_strict" npm run operational_health_snapshot_strict
run_step "system_production_readiness" npm run system_production_readiness

run_optional_step "$RUN_BUILD_VALIDATION" "build" npm run build
run_optional_step "$RUN_BUILD_VALIDATION" "lint" npm run lint
run_optional_step "$RUN_BUILD_VALIDATION" "test" npm run test

run_optional_step "$RUN_E2E" "e2e_discovery_seo_flow" npm run e2e_discovery_seo_flow

log "PRODUCTION_SMOKE_OK"
