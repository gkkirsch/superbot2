#!/bin/bash
# open-superbot-chrome.sh
# Launches the superbot2 Chrome profile with CDP for browser automation.
# Run this any time you need workers to control the browser.
# Prerequisites: Run setup-superbot-chrome.sh once first to create the profile.

set -euo pipefail

PROFILE_NAME="superbot2"
CHROME_PROFILE="$HOME/Library/Application Support/Google/Chrome/$PROFILE_NAME"
TMP_DIR="/tmp/chrome-superbot2"
CDP_PORT=9222

# Check profile exists
if [ ! -d "$CHROME_PROFILE" ]; then
  echo "❌ Profile not found at: $CHROME_PROFILE"
  echo "   Run setup-superbot-chrome.sh first to create the profile."
  exit 1
fi

# Quit Chrome if running (single-instance blocks --remote-debugging-port)
if pgrep -x "Google Chrome" > /dev/null 2>&1; then
  echo "🔄 Chrome is running — quitting first (required for CDP)..."
  osascript -e 'quit app "Google Chrome"'
  sleep 3
fi

# Copy profile to temp dir (Chrome blocks CDP on its default data directory)
echo "📋 Copying superbot2 profile to temp dir..."
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR/Default"
cp -r "$CHROME_PROFILE/." "$TMP_DIR/Default/"

# Launch Chrome with CDP
echo "🚀 Launching Chrome with CDP on port $CDP_PORT..."
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$TMP_DIR" \
  --remote-debugging-port=$CDP_PORT \
  --no-first-run \
  --no-default-browser-check \
  "about:blank" &

sleep 5

# Verify CDP is ready
curl -s "http://localhost:$CDP_PORT/json/version" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print('✅ CDP ready:', d['Browser'])" \
  || { echo "❌ CDP not responding — Chrome may not have launched"; exit 1; }

echo ""
echo "🤖 superbot2 Chrome is ready. Use agent-browser --cdp $CDP_PORT to control it."
echo "   Example: agent-browser --cdp $CDP_PORT open 'https://dash.cloudflare.com'"
