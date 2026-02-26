#!/bin/bash
# open-superbot-chrome.sh
# Opens the superbot2 Chrome profile. Run this any time you need it.

PROFILE_NAME="superbot2"
PROFILE_DIR="$HOME/Library/Application Support/Google/Chrome/$PROFILE_NAME"

if [ ! -d "$PROFILE_DIR" ]; then
  echo "❌ Profile not found. Run setup-superbot-chrome.sh first."
  exit 1
fi

echo "🤖 Opening Chrome → superbot2 profile..."
open -a "Google Chrome" --args \
  --profile-directory="$PROFILE_NAME" \
  --disable-infobars
