#!/bin/bash
# Template: Launch the superbot2 browser profile with CDP for automation.
# Usage: bash setup.sh
# Prerequisites: Run setup-superbot-chrome.sh once to create/migrate the profile.
# After that, run this (or open-superbot-chrome.sh) before each automation session.

set -euo pipefail

BROWSER_DIR="$HOME/.superbot2/browser"
CDP_PORT=9222

# Check profile exists
if [ ! -d "$BROWSER_DIR/Default" ]; then
  echo "❌ Browser profile not found at: $BROWSER_DIR/Default"
  echo "   Run ~/.superbot2/scripts/setup-superbot-chrome.sh first."
  exit 1
fi

# Quit Chrome if running (single-instance ignores --remote-debugging-port)
if pgrep -x "Google Chrome" > /dev/null 2>&1; then
  echo "Chrome is running — quitting first..."
  osascript -e 'quit app "Google Chrome"'
  sleep 3
fi

# Launch Chrome with the superbot2 browser profile + CDP
echo "Launching Chrome with CDP on port $CDP_PORT..."
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$BROWSER_DIR" \
  --remote-debugging-port=$CDP_PORT \
  --no-first-run \
  --no-default-browser-check \
  "about:blank" &

sleep 5

# Verify CDP is ready
curl -s "http://localhost:$CDP_PORT/json/version" | \
  python3 -c "import json,sys; print('✅ CDP ready')"

echo ""
echo "Chrome is ready. Open a tab and start controlling it:"
echo "  curl -s -X PUT 'http://localhost:$CDP_PORT/json/new?https://example.com' > /dev/null"
echo "  agent-browser --cdp $CDP_PORT snapshot -i"
