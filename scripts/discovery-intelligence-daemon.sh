#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.discovery-intelligence-daemon.pid"
LOG_FILE="$ROOT_DIR/logs/discovery-intelligence-daemon.log"

mkdir -p "$ROOT_DIR/logs"

start_daemon() {
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "discovery-intelligence daemon already running (pid=$(cat "$PID_FILE"))"
    exit 0
  fi

  (
    cd "$ROOT_DIR"
    while true; do
      date -Is >> "$LOG_FILE"
      npm run discovery_intelligence_run >> "$LOG_FILE" 2>&1 || true
      sleep 1800
    done
  ) &

  echo $! > "$PID_FILE"
  echo "discovery-intelligence daemon started (pid=$!)"
}

stop_daemon() {
  if [[ ! -f "$PID_FILE" ]]; then
    echo "daemon is not running"
    exit 0
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "daemon stopped (pid=$pid)"
  else
    echo "stale pid file removed"
  fi
  rm -f "$PID_FILE"
}

status_daemon() {
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "running (pid=$(cat "$PID_FILE"))"
  else
    echo "not running"
  fi
}

case "${1:-}" in
  start)
    start_daemon
    ;;
  stop)
    stop_daemon
    ;;
  status)
    status_daemon
    ;;
  *)
    echo "usage: $0 {start|stop|status}"
    exit 1
    ;;
esac
