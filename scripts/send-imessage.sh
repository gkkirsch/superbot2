#!/bin/bash
# send-imessage.sh — Send an iMessage via AppleScript
# Usage: send-imessage.sh <apple-id-or-phone> <message>
set -euo pipefail

RECIPIENT="$1"
MESSAGE="$2"

if [[ -z "$RECIPIENT" || -z "$MESSAGE" ]]; then
  echo "Usage: send-imessage.sh <apple-id-or-phone> <message>" >&2
  exit 1
fi

# Escape backslashes and double quotes for AppleScript string
ESCAPED_MESSAGE="${MESSAGE//\\/\\\\}"
ESCAPED_MESSAGE="${ESCAPED_MESSAGE//\"/\\\"}"

osascript -e "
tell application \"Messages\"
  set targetService to 1st service whose service type = iMessage
  set targetBuddy to buddy \"$RECIPIENT\" of targetService
  send \"$ESCAPED_MESSAGE\" to targetBuddy
end tell
"
