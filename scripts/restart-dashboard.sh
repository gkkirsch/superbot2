#!/bin/bash
# Restart the dashboard server using the PID file
set -euo pipefail

SUPERBOT2_NAME="${SUPERBOT2_NAME:-superbot2}"
SUPERBOT2_HOME="${SUPERBOT2_HOME:-$HOME/.$SUPERBOT2_NAME}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# If dashboard not found at REPO_DIR (e.g. running from ~/.superbot2/scripts/), fall back to dev location
if [[ ! -f "$REPO_DIR/dashboard/server.js" ]]; then
  REPO_DIR="$HOME/dev/superbot2"
fi
PID_FILE="$SUPERBOT2_HOME/dashboard.pid"
PORT=3274

# Kill old server if running
if [[ -f "$PID_FILE" ]]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null
    # Wait briefly for clean shutdown
    for i in {1..10}; do
      kill -0 "$OLD_PID" 2>/dev/null || break
      sleep 0.1
    done
  fi
  rm -f "$PID_FILE"
fi

# Also kill anything on the port as a fallback
lsof -ti:$PORT | xargs kill 2>/dev/null || true

# Start new server (nohup so it survives terminal close)
SUPERBOT2_HOME="$SUPERBOT2_HOME" PORT=$PORT nohup node "$REPO_DIR/dashboard/server.js" > "$SUPERBOT2_HOME/dashboard.log" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"
echo "Dashboard server restarted (PID $NEW_PID)"
