#!/bin/bash
# Restart the dashboard (API server + vite dev server with HMR)
set -euo pipefail

SUPERBOT2_NAME="${SUPERBOT2_NAME:-superbot2}"
SUPERBOT2_HOME="${SUPERBOT2_HOME:-$HOME/.$SUPERBOT2_NAME}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# If dashboard not found at REPO_DIR (e.g. running from ~/.superbot2/scripts/), fall back to dev location
if [[ ! -f "$REPO_DIR/dashboard/server.js" ]]; then
  REPO_DIR="$HOME/dev/superbot2"
fi
PID_FILE="$SUPERBOT2_HOME/dashboard.pid"

# Kill old process tree if running
if [[ -f "$PID_FILE" ]]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    # Kill child processes (concurrently spawns vite + node)
    pkill -P "$OLD_PID" 2>/dev/null || true
    kill "$OLD_PID" 2>/dev/null || true
    for i in {1..10}; do
      kill -0 "$OLD_PID" 2>/dev/null || break
      sleep 0.1
    done
  fi
  rm -f "$PID_FILE"
fi

# Also kill anything on both ports as a fallback
for port in 3274 5173; do
  lsof -ti:$port | xargs kill 2>/dev/null || true
done

# Start dashboard (API on 3274 + vite HMR on 5173)
SUPERBOT2_HOME="$SUPERBOT2_HOME" nohup npm --prefix "$REPO_DIR/dashboard-ui" run dev > "$SUPERBOT2_HOME/dashboard.log" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"
echo "Dashboard restarted (PID $NEW_PID) → http://localhost:5173"
