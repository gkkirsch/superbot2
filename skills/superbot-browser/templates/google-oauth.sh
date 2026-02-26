#!/bin/bash
# Template: Navigate to a Google service using the superbot2 browser profile
# Usage: bash google-oauth.sh <google-service-url>
# Examples:
#   bash google-oauth.sh "https://console.cloud.google.com/"
#   bash google-oauth.sh "https://console.cloud.google.com/apis/library?project=my-project"
#   bash google-oauth.sh "https://console.anthropic.com/"
#
# Prerequisites:
#   - AGENT_BROWSER_PROFILE set to ~/.superbot2/browser/profile
#   - Google account logged in on the superbot2 profile

set -euo pipefail

TARGET_URL="${1:?Usage: bash google-oauth.sh <google-service-url>}"

# Step 1: Verify profile is configured
if [ -z "${AGENT_BROWSER_PROFILE:-}" ]; then
  echo "WARNING: AGENT_BROWSER_PROFILE not set. Using default: ~/.superbot2/browser/profile"
  export AGENT_BROWSER_PROFILE="$HOME/.superbot2/browser/profile"
fi

# Step 2: Navigate to the target URL
echo "Opening: $TARGET_URL"
agent-browser open "$TARGET_URL"

# Step 3: Wait for page load (Google services are heavy SPAs)
echo "Waiting for page load..."
agent-browser wait 5000

# Step 4: Check where we landed
CURRENT_URL=$(agent-browser get url 2>/dev/null || echo "unknown")
echo "Current URL: $CURRENT_URL"

# Step 5: Handle possible scenarios
if echo "$CURRENT_URL" | grep -q "accounts.google.com"; then
  echo ""
  echo "Landed on Google sign-in page."
  echo "The superbot2 profile is not authenticated with Google."
  echo ""
  echo "Taking snapshot of sign-in page..."
  agent-browser snapshot -i
  echo ""
  echo "Options:"
  echo "  1. If account picker: click the correct account ref"
  echo "  2. If consent screen: click 'Allow' ref"
  echo "  3. If sign-in form: run with --headed and log in manually"
  echo ""
elif echo "$CURRENT_URL" | grep -q "myaccount.google.com/signinoptions"; then
  echo ""
  echo "Google is requesting re-authentication."
  echo "Run with --headed to verify identity manually."
  agent-browser snapshot -i
else
  echo ""
  echo "Successfully authenticated. Taking snapshot..."
  agent-browser snapshot -i
  echo ""
  echo "User is logged in. Use refs from the snapshot to interact."
fi
