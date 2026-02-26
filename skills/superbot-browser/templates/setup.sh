#!/bin/bash
# Template: First-time setup for the superbot2 browser profile
# Usage: bash setup.sh
# This script sets up the persistent browser profile and opens a headed browser
# for you to log into your accounts. Sessions persist after this one-time setup.

set -euo pipefail

PROFILE_DIR="$HOME/.superbot2/browser/profile"

echo "=== superbot2 Browser Profile Setup ==="
echo ""

# Step 1: Set up profile directory
mkdir -p "$PROFILE_DIR"
echo "Profile directory: $PROFILE_DIR"

# Step 2: Check env var
if [ -z "${AGENT_BROWSER_PROFILE:-}" ]; then
  echo ""
  echo "AGENT_BROWSER_PROFILE is not set. Adding to ~/.zshrc..."
  echo 'export AGENT_BROWSER_PROFILE="$HOME/.superbot2/browser/profile"' >> "$HOME/.zshrc"
  export AGENT_BROWSER_PROFILE="$PROFILE_DIR"
  echo "Done. Run 'source ~/.zshrc' or restart your terminal to apply."
else
  echo "AGENT_BROWSER_PROFILE is set: $AGENT_BROWSER_PROFILE"
fi

echo ""
echo "Opening headed browser for you to log into your accounts..."
echo "Log into Google, Facebook, Instagram, X, or whatever you need."
echo "Close the browser when done — sessions will persist."
echo ""

# Step 3: Open headed browser for login
agent-browser --headed open "https://accounts.google.com"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Your sessions are saved. All future agent-browser commands will use them."
echo ""
echo "Test it:"
echo "  agent-browser open 'https://console.cloud.google.com'"
echo "  agent-browser snapshot -i"
