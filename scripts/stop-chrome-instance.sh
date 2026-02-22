#!/bin/bash
# stop-chrome-instance.sh — Stop a Chrome instance on a specific CDP port
#
# Usage: stop-chrome-instance.sh <port>
#
# Kills the Chrome process running on the specified CDP port and cleans up
# its temporary user-data-dir. Will not touch port 9222 (user's main Chrome).
#
# Examples:
#   stop-chrome-instance.sh 9223
#   stop-chrome-instance.sh 9224

set -uo pipefail

PORT="${1:-}"

if [[ -z "$PORT" ]]; then
  echo "Usage: stop-chrome-instance.sh <port>" >&2
  exit 1
fi

if [[ "$PORT" == "9222" ]]; then
  echo "ERROR: Refusing to stop port 9222 (user's main Chrome)" >&2
  exit 1
fi

# Find Chrome process with this debugging port
PIDS=$(pgrep -f "remote-debugging-port=${PORT}" 2>/dev/null || true)

if [[ -z "$PIDS" ]]; then
  echo "No Chrome instance found on port $PORT" >&2
  # Still clean up user-data-dir if it exists
  USER_DATA_DIR="/tmp/superbot2-chrome-${PORT}"
  if [[ -d "$USER_DATA_DIR" ]]; then
    rm -rf "$USER_DATA_DIR"
    echo "Cleaned up $USER_DATA_DIR"
  fi
  exit 0
fi

# Send SIGTERM first
for pid in $PIDS; do
  kill "$pid" 2>/dev/null
done

# Wait up to 5 seconds for graceful shutdown
for i in $(seq 1 10); do
  if ! pgrep -f "remote-debugging-port=${PORT}" > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

# SIGKILL any survivors
REMAINING=$(pgrep -f "remote-debugging-port=${PORT}" 2>/dev/null || true)
if [[ -n "$REMAINING" ]]; then
  for pid in $REMAINING; do
    kill -9 "$pid" 2>/dev/null
  done
  sleep 0.5
fi

# Clean up user-data-dir
USER_DATA_DIR="/tmp/superbot2-chrome-${PORT}"
if [[ -d "$USER_DATA_DIR" ]]; then
  rm -rf "$USER_DATA_DIR"
fi

echo "Stopped Chrome on port $PORT"
