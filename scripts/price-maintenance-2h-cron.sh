#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER_COMMAND="npm run price_maintenance_full"
LOG_FILE="$PROJECT_ROOT/logs/price-maintenance-2h-cron.log"
MARKER="# PRICE_MAINTENANCE_2H_CRON"

CRON_TIME_DEFAULT="0 */2 * * *"
CRON_TIME="${CRON_TIME:-$CRON_TIME_DEFAULT}"
ACTION="${1:-start}"

mkdir -p "$PROJECT_ROOT/logs"

current_crontab() {
  crontab -l 2>/dev/null || true
}

build_entry() {
  echo "$CRON_TIME cd $PROJECT_ROOT && $RUNNER_COMMAND >> $LOG_FILE 2>&1 $MARKER"
}

start_cron() {
  local existing
  existing="$(current_crontab)"
  if echo "$existing" | grep -Fq "$MARKER"; then
    echo "Cron ja cadastrado."
    exit 0
  fi

  {
    echo "$existing"
    build_entry
  } | sed '/^$/N;/^\n$/D' | crontab -

  echo "Cron cadastrado com sucesso: $(build_entry)"
}

stop_cron() {
  local existing
  existing="$(current_crontab)"

  if ! echo "$existing" | grep -Fq "$MARKER"; then
    echo "Cron nao encontrado."
    exit 0
  fi

  echo "$existing" | grep -Fv "$MARKER" | crontab -
  echo "Cron removido com sucesso."
}

status_cron() {
  local existing
  existing="$(current_crontab)"
  if echo "$existing" | grep -Fq "$MARKER"; then
    echo "Cron ativo:"
    echo "$existing" | grep -F "$MARKER"
  else
    echo "Cron inativo."
    exit 1
  fi
}

case "$ACTION" in
  start)
    start_cron
    ;;
  stop)
    stop_cron
    ;;
  restart)
    stop_cron || true
    start_cron
    ;;
  status)
    status_cron
    ;;
  *)
    echo "Uso: $0 {start|stop|restart|status}"
    exit 2
    ;;
esac
