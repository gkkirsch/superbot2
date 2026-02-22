#!/bin/bash
# launch-chrome-instance.sh — Launch a new Chrome instance on a specific CDP port
#
# Usage: launch-chrome-instance.sh <port>
#
# Launches Chrome with a fresh user-data-dir for browser automation workers.
# Port 9222 is reserved for the user's main Chrome. Valid range: 9223-9299.
#
# Examples:
#   launch-chrome-instance.sh 9223
#   launch-chrome-instance.sh 9224

set -uo pipefail

PORT="${1:-}"

if [[ -z "$PORT" ]]; then
  echo "Usage: launch-chrome-instance.sh <port>" >&2
  echo "  Port must be in range 9223-9299" >&2
  exit 1
fi

if [[ "$PORT" -lt 9223 || "$PORT" -gt 9299 ]] 2>/dev/null; then
  echo "ERROR: Port must be in range 9223-9299 (9222 is reserved for user's main Chrome)" >&2
  exit 1
fi

# Check if port is already in use
if lsof -i :"$PORT" > /dev/null 2>&1; then
  echo "ERROR: Port $PORT is already in use" >&2
  lsof -i :"$PORT" | head -5 >&2
  exit 1
fi

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
USER_DATA_DIR="/tmp/superbot2-chrome-${PORT}"

if [[ ! -x "$CHROME" ]]; then
  echo "ERROR: Chrome not found at $CHROME" >&2
  exit 1
fi

# Create user-data-dir
mkdir -p "$USER_DATA_DIR"

# Launch Chrome in headless-new mode with CDP
"$CHROME" \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$USER_DATA_DIR" \
  --headless=new \
  --no-first-run \
  --no-default-browser-check \
  --disable-background-networking \
  --disable-sync \
  --disable-translate \
  --disable-extensions \
  --disable-default-apps \
  > /dev/null 2>&1 &

CHROME_PID=$!

# Wait for CDP endpoint to become available (up to 10 seconds)
for i in $(seq 1 20); do
  if curl -s "http://localhost:${PORT}/json/version" > /dev/null 2>&1; then
    echo "$PORT"
    exit 0
  fi
  sleep 0.5
done

# CDP didn't come up — kill the process and fail
kill "$CHROME_PID" 2>/dev/null
rm -rf "$USER_DATA_DIR"
echo "ERROR: Chrome failed to start on port $PORT (timed out waiting for CDP)" >&2
exit 1
