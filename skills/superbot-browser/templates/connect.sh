#!/bin/bash
# Template: Connect to Chrome via CDP and open a URL
# Usage: bash connect.sh <url>
# Uses existing Chrome on port 9222 if available, otherwise launches superbot2 profile

set -euo pipefail

CDP_PORT=9222
TARGET_URL="${1:?Usage: bash connect.sh <url>}"

# Step 1: Use existing Chrome on CDP port, or launch superbot2 profile as fallback
if lsof -i :$CDP_PORT > /dev/null 2>&1; then
  echo "Using existing Chrome on port $CDP_PORT"
else
  echo "No Chrome on port $CDP_PORT — launching superbot2 profile..."
  open -a "Google Chrome" --args \
    --profile-directory="superbot2" \
    --remote-debugging-port=$CDP_PORT \
    --disable-infobars &
  sleep 3

  if ! lsof -i :$CDP_PORT > /dev/null 2>&1; then
    echo "ERROR: Chrome failed to start on port $CDP_PORT"
    exit 1
  fi
  echo "superbot2 Chrome profile launched on port $CDP_PORT"
fi

# Step 2: Create a new tab (MUST use PUT)
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
echo "  npx agent-browser --cdp $CDP_PORT screenshot ~/.superbot2/uploads/screenshot.png"
echo ""
echo "Tab ID: $TAB_ID"
echo "To close: curl -s -X PUT 'http://localhost:$CDP_PORT/json/close/$TAB_ID'"
