#!/bin/bash
# Template: Launch Chrome with the superbot2 profile + CDP for browser automation
# Usage: bash setup.sh
# This gives agent-browser access to saved sessions (Cloudflare, Facebook, Instagram, X, etc.)

set -euo pipefail

CHROME_PROFILE="$HOME/Library/Application Support/Google/Chrome/superbot2"
TMP_DIR="/tmp/chrome-superbot2"
CDP_PORT=9222

echo "=== superbot2 Browser CDP Startup ==="
echo ""

# Step 1: Quit Chrome if running (single-instance blocks CDP)
if pgrep -x "Google Chrome" > /dev/null; then
  echo "Chrome is running — quitting first (required for CDP)..."
  osascript -e 'quit app "Google Chrome"'
  sleep 3
  echo "Chrome quit."
fi

# Step 2: Copy superbot2 profile to temp dir
# Chrome blocks CDP on its default data dir, so we copy the profile to a temp dir
echo "Copying superbot2 Chrome profile to temp dir..."
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR/Default"
cp -r "$CHROME_PROFILE/." "$TMP_DIR/Default/"
echo "Profile copied."

# Step 3: Launch Chrome with CDP
echo ""
echo "Launching Chrome with CDP on port $CDP_PORT..."
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$TMP_DIR" \
  --remote-debugging-port=$CDP_PORT \
  --no-first-run \
  --no-default-browser-check \
  "about:blank" &

sleep 5

# Step 4: Verify CDP is ready
echo ""
curl -s "http://localhost:$CDP_PORT/json/version" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print('✅ CDP ready:', d['Browser'])" \
  || { echo "❌ CDP not responding — check if Chrome launched"; exit 1; }

echo ""
echo "Chrome is running with CDP on port $CDP_PORT."
echo "All superbot2 sessions (Cloudflare, Facebook, Instagram, X) are available."
echo ""
echo "Usage:"
echo "  curl -s -X PUT 'http://localhost:$CDP_PORT/json/new?https://example.com' > /dev/null"
echo "  agent-browser --cdp $CDP_PORT open 'https://dash.cloudflare.com'"
echo "  agent-browser --cdp $CDP_PORT snapshot -i"
echo ""
echo "=== Startup Complete ==="
