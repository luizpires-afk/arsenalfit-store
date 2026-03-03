#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
PID_FILE="$LOG_DIR/auto-recover-daemon.pid"
LOOP_LOG="$LOG_DIR/auto-recover-daemon-loop.log"
RUNNER="$PROJECT_ROOT/scripts/run-auto-recover-scheduled.sh"

mkdir -p "$LOG_DIR"

is_running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null
}

start_daemon() {
  if is_running; then
    echo "Daemon already running with PID $(cat "$PID_FILE")"
    exit 0
  fi

  nohup bash -lc "while true; do '$RUNNER'; sleep 1800; done" >> "$LOOP_LOG" 2>&1 &
  daemon_pid=$!
  echo "$daemon_pid" > "$PID_FILE"
  echo "Daemon started with PID $daemon_pid"
}

stop_daemon() {
  if ! is_running; then
    echo "Daemon is not running"
    rm -f "$PID_FILE"
    exit 0
  fi

  daemon_pid="$(cat "$PID_FILE")"
  kill "$daemon_pid"
  rm -f "$PID_FILE"
  echo "Daemon stopped (PID $daemon_pid)"
}

status_daemon() {
  if is_running; then
    echo "Daemon running (PID $(cat "$PID_FILE"))"
  else
    echo "Daemon not running"
    exit 1
  fi
}

case "${1:-start}" in
  start)
    start_daemon
    ;;
  stop)
    stop_daemon
    ;;
  restart)
    stop_daemon || true
    start_daemon
    ;;
  status)
    status_daemon
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 2
    ;;
esac
