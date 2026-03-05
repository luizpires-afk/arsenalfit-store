#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
RUN_LOG="$LOG_DIR/viral-fitness-discovery.log"

mkdir -p "$LOG_DIR"

cd "$PROJECT_ROOT"

echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] [viral_fitness_discovery] START" >> "$RUN_LOG"
if npm run viral_fitness_discovery >> "$RUN_LOG" 2>&1; then
  echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] [viral_fitness_discovery] END ok" >> "$RUN_LOG"
else
  echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] [viral_fitness_discovery] END failed" >> "$RUN_LOG"
  exit 1
fi
