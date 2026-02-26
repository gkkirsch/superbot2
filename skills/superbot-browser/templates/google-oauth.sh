#!/bin/bash
# Template: Navigate to a Google service using the superbot2 Chrome profile
# Usage: bash google-oauth.sh <google-service-url>
# Examples:
#   bash google-oauth.sh "https://console.cloud.google.com/"
#   bash google-oauth.sh "https://console.cloud.google.com/apis/library?project=my-project"
#   bash google-oauth.sh "https://console.anthropic.com/"
#
# Prerequisites:
#   - superbot2 Chrome profile running with --remote-debugging-port=9222
#   - Google account logged in on the superbot2 profile

set -euo pipefail

CDP_PORT=9222
TARGET_URL="${1:?Usage: bash google-oauth.sh <google-service-url>}"

# Step 1: Verify Chrome is listening
if ! lsof -i :$CDP_PORT > /dev/null 2>&1; then
  echo "ERROR: Chrome not listening on port $CDP_PORT"
  echo "Launch with: open -a 'Google Chrome' --args --remote-debugging-port=$CDP_PORT"
  exit 1
fi

# Step 2: Create tab and navigate
echo "Opening: $TARGET_URL"
TAB_INFO=$(curl -s -X PUT "http://localhost:$CDP_PORT/json/new?$TARGET_URL")
TAB_ID=$(echo "$TAB_INFO" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "Tab: $TAB_ID"

# Step 3: Wait for page load (Google services are heavy SPAs)
echo "Waiting for page load..."
sleep 5

# Step 4: Check where we landed
CURRENT_URL=$(npx agent-browser --cdp $CDP_PORT get url 2>/dev/null || echo "unknown")
echo "Current URL: $CURRENT_URL"

# Step 5: Handle possible scenarios
if echo "$CURRENT_URL" | grep -q "accounts.google.com"; then
  echo ""
  echo "Landed on Google sign-in page."
  echo "This means the superbot2 Chrome session is not authenticated with Google."
  echo ""
  echo "Taking snapshot of sign-in page..."
  npx agent-browser --cdp $CDP_PORT snapshot -i
  echo ""
  echo "Options:"
  echo "  1. If account picker: click the correct account ref"
  echo "  2. If consent screen: click 'Allow' ref"
  echo "  3. If sign-in form: user must sign in manually first"
  echo ""
elif echo "$CURRENT_URL" | grep -q "myaccount.google.com/signinoptions"; then
  echo ""
  echo "Google is requesting re-authentication."
  echo "User may need to verify their identity manually."
  npx agent-browser --cdp $CDP_PORT snapshot -i
else
  echo ""
  echo "Successfully authenticated. Taking snapshot..."
  npx agent-browser --cdp $CDP_PORT snapshot -i
  echo ""
  echo "User is logged in. Use refs from the snapshot to interact."
fi

echo ""
echo "Tab ID: $TAB_ID"
echo "To close: curl -s -X PUT 'http://localhost:$CDP_PORT/json/close/$TAB_ID'"
