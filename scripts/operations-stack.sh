#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTION="${1:-status}"
HAS_CRONTAB="false"

if command -v crontab >/dev/null 2>&1; then
  HAS_CRONTAB="true"
fi

now_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log() {
  echo "[$(now_utc)] [ops_stack] $*"
}

run_component() {
  local name="$1"
  shift

  log "COMPONENT_START ${name}"
  if "$@"; then
    log "COMPONENT_OK ${name}"
    return 0
  fi

  log "COMPONENT_FAIL ${name}"
  return 1
}

ml_component_cmd() {
  local op="$1"
  if [[ "$HAS_CRONTAB" == "true" ]]; then
    bash "$PROJECT_ROOT/scripts/ml-30m-sync-cron.sh" "$op"
    return $?
  fi
  bash "$PROJECT_ROOT/scripts/ml-30m-sync-daemon.sh" "$op"
}

price_component_cmd() {
  local op="$1"
  if [[ "$HAS_CRONTAB" == "true" ]]; then
    bash "$PROJECT_ROOT/scripts/price-maintenance-2h-cron.sh" "$op"
    return $?
  fi
  bash "$PROJECT_ROOT/scripts/interval-task-daemon.sh" "$op" \
    --name "price-maintenance-2h-daemon" \
    --interval-seconds 7200 \
    --command "cd '$PROJECT_ROOT' && npm run price_maintenance_full"
}

viral_component_cmd() {
  local op="$1"
  if [[ "$HAS_CRONTAB" == "true" ]]; then
    bash "$PROJECT_ROOT/scripts/viral-momentum-6h-cron.sh" "$op"
    return $?
  fi
  bash "$PROJECT_ROOT/scripts/interval-task-daemon.sh" "$op" \
    --name "viral-momentum-6h-daemon" \
    --interval-seconds 21600 \
    --command "cd '$PROJECT_ROOT' && npm run viral_momentum_refresh && npm run viral_momentum_observability"
}

score_component_cmd() {
  local op="$1"
  if [[ "$HAS_CRONTAB" == "true" ]]; then
    bash "$PROJECT_ROOT/scripts/score-recalc-24h-cron.sh" "$op"
    return $?
  fi
  bash "$PROJECT_ROOT/scripts/interval-task-daemon.sh" "$op" \
    --name "score-recalc-24h-daemon" \
    --interval-seconds 86400 \
    --command "cd '$PROJECT_ROOT' && npm run recalculate_product_scores_auto"
}

auto_recover_component_cmd() {
  local op="$1"
  bash "$PROJECT_ROOT/scripts/auto-recover-daemon.sh" "$op"
}

run_lifecycle() {
  local op="$1"
  local failures=0

  run_component "ml_30m_sync" ml_component_cmd "$op" || failures=$((failures + 1))
  run_component "price_maintenance_2h" price_component_cmd "$op" || failures=$((failures + 1))
  run_component "viral_momentum_6h" viral_component_cmd "$op" || failures=$((failures + 1))
  run_component "score_recalc_24h" score_component_cmd "$op" || failures=$((failures + 1))
  run_component "auto_recover_daemon" auto_recover_component_cmd "$op" || failures=$((failures + 1))

  if [[ "$failures" -gt 0 ]]; then
    log "STACK_WARN ${op} failures=${failures} scheduler_mode=$([[ "$HAS_CRONTAB" == "true" ]] && echo cron || echo daemon)"
    return 1
  fi

  log "STACK_OK ${op} scheduler_mode=$([[ "$HAS_CRONTAB" == "true" ]] && echo cron || echo daemon)"
}

start_stack() {
  run_lifecycle "start"
}

stop_stack() {
  run_lifecycle "stop"
}

status_stack() {
  run_lifecycle "status"
}

readiness_stack() {
  local env_file="${2:-supabase/functions/.env.scheduler}"
  log "READINESS_START env_file=${env_file}"
  bash "$PROJECT_ROOT/scripts/run-production-readiness.sh" "$env_file"
  log "READINESS_OK"
}

restart_stack() {
  stop_stack || true
  start_stack
}

case "$ACTION" in
  start)
    start_stack
    ;;
  stop)
    stop_stack
    ;;
  restart)
    restart_stack
    ;;
  status)
    status_stack
    ;;
  readiness)
    readiness_stack "$@"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|readiness [env_file]}"
    exit 2
    ;;
esac
