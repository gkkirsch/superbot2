#!/bin/bash
# send-imessage.sh — Send an iMessage via AppleScript
# Usage: send-imessage.sh <recipient-phone-or-email> <message>
# Sends FROM the garrettsuperbot2@gmail.com account (2nd iMessage account on Mac)
set -euo pipefail

RECIPIENT="$1"
MESSAGE="$2"
CONFIG_FILE="$HOME/.superbot2/config.json"
SENT_LOG="$HOME/.superbot2/imessage-sent.log"

if [[ -z "$RECIPIENT" || -z "$MESSAGE" ]]; then
  echo "Usage: send-imessage.sh <recipient> <message>" >&2
  exit 1
fi

# Log sent message for dedup (prevents watcher from re-processing our own messages)
log_sent_message() {
  local hash
  hash=$(echo -n "$MESSAGE" | md5)
  echo "$(date +%s)|$hash" >> "$SENT_LOG"
}

# Read the superbot2 Apple ID from config for service lookup
APPLE_ID=$(jq -r '.imessage.appleId // ""' "$CONFIG_FILE" 2>/dev/null || echo "")

# Escape backslashes and double quotes for AppleScript string
ESCAPED_MESSAGE="${MESSAGE//\\/\\\\}"
ESCAPED_MESSAGE="${ESCAPED_MESSAGE//\"/\\\"}"
ESCAPED_RECIPIENT="${RECIPIENT//\"/\\\"}"

if [[ -n "$APPLE_ID" ]]; then
  # Send FROM the superbot2 account specifically
  ESCAPED_APPLE_ID="${APPLE_ID//\"/\\\"}"
  if osascript -e "
tell application \"Messages\"
  set superbot2Service to (first service whose (name contains \"$ESCAPED_APPLE_ID\" or id contains \"$ESCAPED_APPLE_ID\"))
  set targetBuddy to buddy \"$ESCAPED_RECIPIENT\" of superbot2Service
  send \"$ESCAPED_MESSAGE\" to targetBuddy
end tell
" 2>/dev/null; then
    log_sent_message
    exit 0
  fi
fi

# Fallback: use default iMessage service
osascript -e "
tell application \"Messages\"
  set targetService to 1st service whose service type = iMessage
  set targetBuddy to buddy \"$ESCAPED_RECIPIENT\" of targetService
  send \"$ESCAPED_MESSAGE\" to targetBuddy
end tell
"
log_sent_message
