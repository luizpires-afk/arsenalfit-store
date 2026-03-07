#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

NAME=""
INTERVAL_SECONDS=""
COMMAND_TO_RUN=""
INITIAL_DELAY_SECONDS="0"
ACTION="${1:-status}"

parse_args() {
  shift
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --name)
        NAME="$2"
        shift 2
        ;;
      --interval-seconds)
        INTERVAL_SECONDS="$2"
        shift 2
        ;;
      --command)
        COMMAND_TO_RUN="$2"
        shift 2
        ;;
      --initial-delay-seconds)
        INITIAL_DELAY_SECONDS="$2"
        shift 2
        ;;
      *)
        echo "Unknown argument: $1"
        exit 2
        ;;
    esac
  done
}

require_config() {
  if [[ -z "$NAME" || -z "$INTERVAL_SECONDS" || -z "$COMMAND_TO_RUN" ]]; then
    echo "Usage: $0 {start|stop|restart|status|run-loop} --name <name> --interval-seconds <seconds> --command <shell_command> [--initial-delay-seconds <seconds>]"
    exit 2
  fi
}

LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"

pid_file() {
  echo "$LOG_DIR/${NAME}.pid"
}

loop_log_file() {
  echo "$LOG_DIR/${NAME}.log"
}

is_running() {
  local pf
  pf="$(pid_file)"
  [[ -f "$pf" ]] && kill -0 "$(cat "$pf" 2>/dev/null)" 2>/dev/null
}

run_loop() {
  local log_file
  log_file="$(loop_log_file)"

  if [[ "$INITIAL_DELAY_SECONDS" -gt 0 ]]; then
    sleep "$INITIAL_DELAY_SECONDS"
  fi

  while true; do
    echo "[$(date --iso-8601=seconds)] [${NAME}] cycle start" >> "$log_file"
    if bash -lc "$COMMAND_TO_RUN" >> "$log_file" 2>&1; then
      echo "[$(date --iso-8601=seconds)] [${NAME}] cycle ok" >> "$log_file"
    else
      echo "[$(date --iso-8601=seconds)] [${NAME}] cycle failed" >> "$log_file"
    fi
    sleep "$INTERVAL_SECONDS"
  done
}

start_daemon() {
  local pf log_file
  pf="$(pid_file)"
  log_file="$(loop_log_file)"

  if is_running; then
    echo "Daemon ja em execucao com PID $(cat "$pf")"
    exit 0
  fi

  nohup bash -lc "'$0' run-loop --name '$NAME' --interval-seconds '$INTERVAL_SECONDS' --command '$COMMAND_TO_RUN' --initial-delay-seconds '$INITIAL_DELAY_SECONDS'" >> "$log_file" 2>&1 &
  local daemon_pid=$!
  echo "$daemon_pid" > "$pf"
  echo "Daemon iniciado com PID $daemon_pid"
}

stop_daemon() {
  local pf
  pf="$(pid_file)"

  if ! is_running; then
    echo "Daemon nao esta em execucao"
    rm -f "$pf"
    exit 0
  fi

  local daemon_pid
  daemon_pid="$(cat "$pf")"
  kill "$daemon_pid"
  rm -f "$pf"
  echo "Daemon finalizado (PID $daemon_pid)"
}

status_daemon() {
  local pf
  pf="$(pid_file)"

  if is_running; then
    echo "Daemon ativo (PID $(cat "$pf"))"
  else
    echo "Daemon inativo"
    exit 1
  fi
}

parse_args "$@"
require_config

case "$ACTION" in
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
  run-loop)
    run_loop
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|run-loop} --name <name> --interval-seconds <seconds> --command <shell_command> [--initial-delay-seconds <seconds>]"
    exit 2
    ;;
esac
