#!/bin/bash
# setup.sh — Start the superbot2 browser session with CDP.
# Run before each automation session.
# If Chrome is already running with CDP on 9222, this is a no-op.

set -euo pipefail

BROWSER_DIR="$HOME/.superbot2/browser"
CDP_PORT=9222

# Check profile exists
if [ ! -d "$BROWSER_DIR/Default" ]; then
  echo "❌ Profile not found. Run init.sh first."
  exit 1
fi

# If CDP is already up, nothing to do
if curl -s "http://localhost:$CDP_PORT/json/version" > /dev/null 2>&1; then
  echo "✅ CDP already running on port $CDP_PORT."
  exit 0
fi

# Launch Chrome with the superbot2 profile + CDP
echo "Launching Chrome on port $CDP_PORT..."
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$BROWSER_DIR" \
  --remote-debugging-port=$CDP_PORT \
  --no-first-run \
  --no-default-browser-check \
  "about:blank" &

sleep 5

curl -s "http://localhost:$CDP_PORT/json/version" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print('✅ CDP ready:', d['Browser'])"
