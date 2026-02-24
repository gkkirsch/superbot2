#!/bin/bash
# send-imessage.sh — Send an iMessage via AppleScript
# Usage: send-imessage.sh <recipient-phone-or-email> <message>
# Sends FROM the garrettsuperbot2@gmail.com account (2nd iMessage account on Mac)
set -euo pipefail

RECIPIENT="$1"
MESSAGE="$2"
CONFIG_FILE="$HOME/.superbot2/config.json"

if [[ -z "$RECIPIENT" || -z "$MESSAGE" ]]; then
  echo "Usage: send-imessage.sh <recipient> <message>" >&2
  exit 1
fi

# Read the superbot2 Apple ID from config for service lookup
APPLE_ID=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('imessage',{}).get('appleId',''))" 2>/dev/null || echo "")

# Escape backslashes and double quotes for AppleScript string
ESCAPED_MESSAGE="${MESSAGE//\\/\\\\}"
ESCAPED_MESSAGE="${ESCAPED_MESSAGE//\"/\\\"}"
ESCAPED_RECIPIENT="${RECIPIENT//\"/\\\"}"

if [[ -n "$APPLE_ID" ]]; then
  # Send FROM the superbot2 account specifically
  ESCAPED_APPLE_ID="${APPLE_ID//\"/\\\"}"
  osascript -e "
tell application \"Messages\"
  set superbot2Service to (first service whose (name contains \"$ESCAPED_APPLE_ID\" or id contains \"$ESCAPED_APPLE_ID\"))
  set targetBuddy to buddy \"$ESCAPED_RECIPIENT\" of superbot2Service
  send \"$ESCAPED_MESSAGE\" to targetBuddy
end tell
" 2>/dev/null && exit 0
fi

# Fallback: use default iMessage service
osascript -e "
tell application \"Messages\"
  set targetService to 1st service whose service type = iMessage
  set targetBuddy to buddy \"$ESCAPED_RECIPIENT\" of targetService
  send \"$ESCAPED_MESSAGE\" to targetBuddy
end tell
"
