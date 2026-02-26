#!/bin/bash
# Template: Launch Chrome with the superbot2 profile + CDP for browser automation.
# Usage: bash setup.sh
# Prerequisites: Run setup-superbot-chrome.sh once to create the profile.
# After that, run this (or open-superbot-chrome.sh) any time you need the browser.

set -euo pipefail

CHROME_PROFILE="$HOME/Library/Application Support/Google/Chrome/superbot2"
TMP_DIR="/tmp/chrome-superbot2"
CDP_PORT=9222

# Check profile exists
if [ ! -d "$CHROME_PROFILE" ]; then
  echo "❌ Profile not found. Run ~/.superbot2/scripts/setup-superbot-chrome.sh first."
  exit 1
fi

# Quit Chrome if running (single-instance ignores --remote-debugging-port)
if pgrep -x "Google Chrome" > /dev/null 2>&1; then
  echo "Chrome is running — quitting first..."
  osascript -e 'quit app "Google Chrome"'
  sleep 3
fi

# Copy profile to temp dir (Chrome blocks CDP on its default data directory)
echo "Copying superbot2 profile to temp dir..."
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR/Default"
cp -r "$CHROME_PROFILE/." "$TMP_DIR/Default/"

# Launch Chrome with CDP
echo "Launching Chrome with CDP on port $CDP_PORT..."
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$TMP_DIR" \
  --remote-debugging-port=$CDP_PORT \
  --no-first-run \
  --no-default-browser-check \
  "about:blank" &

sleep 5

# Verify CDP is ready
curl -s "http://localhost:$CDP_PORT/json/version" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print('✅ CDP ready:', json.load(sys.stdin)['Browser'])" 2>/dev/null \
  || curl -s "http://localhost:$CDP_PORT/json/version" | python3 -c "import json,sys; print('✅ CDP ready')"

echo ""
echo "Chrome is ready. Open a tab and start controlling it:"
echo "  curl -s -X PUT 'http://localhost:$CDP_PORT/json/new?https://example.com' > /dev/null"
echo "  agent-browser --cdp $CDP_PORT snapshot -i"
