#!/bin/bash
# Template: Connect to user's Chrome via CDP and open a URL
# Usage: bash connect.sh <url>
# Prerequisites: Chrome running with --remote-debugging-port=9222

set -euo pipefail

CDP_PORT=9222
TARGET_URL="${1:?Usage: bash connect.sh <url>}"

# Step 1: Verify Chrome is listening on CDP port
if ! lsof -i :$CDP_PORT > /dev/null 2>&1; then
  echo "ERROR: Chrome not listening on port $CDP_PORT"
  echo ""
  echo "Launch Chrome with remote debugging enabled:"
  echo "  open -a 'Google Chrome' --args --remote-debugging-port=$CDP_PORT"
  echo ""
  echo "Note: If Chrome is already running, you need to quit it first"
  echo "and relaunch with the flag."
  exit 1
fi

echo "Chrome is listening on port $CDP_PORT"

# Step 2: Create a new tab in the user's Chrome (MUST use PUT)
echo "Creating tab: $TARGET_URL"
TAB_INFO=$(curl -s -X PUT "http://localhost:$CDP_PORT/json/new?$TARGET_URL")
TAB_ID=$(echo "$TAB_INFO" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "Tab created: $TAB_ID"

# Step 3: Wait for page to load
echo "Waiting for page to load..."
sleep 3

# Step 4: Snapshot interactive elements
echo "Taking snapshot..."
npx agent-browser --cdp $CDP_PORT snapshot -i

echo ""
echo "Ready. Use refs from the snapshot above to interact:"
echo "  npx agent-browser --cdp $CDP_PORT click @e1"
echo "  npx agent-browser --cdp $CDP_PORT fill @e2 \"text\""
echo "  npx agent-browser --cdp $CDP_PORT screenshot /tmp/screenshot.png"
echo ""
echo "Tab ID: $TAB_ID"
echo "To close: curl -s -X PUT 'http://localhost:$CDP_PORT/json/close/$TAB_ID'"
