#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/auto-recover-scheduled.log"
LOCK_FILE="$LOG_DIR/auto-recover-scheduled.lock"

ENV_FILE_DEFAULT="$PROJECT_ROOT/supabase/functions/.env.scheduler"
ENV_FILE_FALLBACK="$PROJECT_ROOT/.env"
ENV_FILE="${AUTO_RECOVER_ENV_FILE:-$ENV_FILE_DEFAULT}"

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

load_env_file() {
  local file_path="$1"
  if [ ! -f "$file_path" ]; then
    return 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$file_path"
  set +a
  return 0
}

if [ -e "$LOCK_FILE" ] && kill -0 "$(cat "$LOCK_FILE" 2>/dev/null)" 2>/dev/null; then
  echo "[$(timestamp)] Skipping run: previous process still active" >> "$LOG_FILE"
  exit 0
fi

echo $$ > "$LOCK_FILE"
cleanup() {
  rm -f "$LOCK_FILE"
}
trap cleanup EXIT

loaded_env_file=""
if load_env_file "$ENV_FILE"; then
  loaded_env_file="$ENV_FILE"
elif [ "$ENV_FILE" != "$ENV_FILE_FALLBACK" ] && load_env_file "$ENV_FILE_FALLBACK"; then
  loaded_env_file="$ENV_FILE_FALLBACK"
fi

if [ -z "${SUPABASE_URL:-}" ] && [ -n "${VITE_SUPABASE_URL:-}" ]; then
  export SUPABASE_URL="$VITE_SUPABASE_URL"
fi

echo "[$(timestamp)] Starting auto_recover_mercado_products" >> "$LOG_FILE"
if [ -n "$loaded_env_file" ]; then
  echo "[$(timestamp)] Loaded env file: $loaded_env_file" >> "$LOG_FILE"
else
  echo "[$(timestamp)] No env file loaded (checked: $ENV_FILE and fallback .env)" >> "$LOG_FILE"
fi

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "[$(timestamp)] Missing required env keys: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY" >> "$LOG_FILE"
fi

if npm run auto_recover_mercado_products >> "$LOG_FILE" 2>&1; then
  exit_code=0
else
  exit_code=$?
fi

echo "[$(timestamp)] Finished with exit code: $exit_code" >> "$LOG_FILE"
exit "$exit_code"
