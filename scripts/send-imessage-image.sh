#!/bin/bash
# send-imessage-image.sh — Send an image file as an iMessage attachment via AppleScript
# Usage: send-imessage-image.sh <recipient-phone-or-email> <image-file-path>
# Sends FROM the superbot2 Apple ID account (2nd iMessage account on Mac)
set -euo pipefail

RECIPIENT="$1"
IMAGE_PATH="$2"
CONFIG_FILE="$HOME/.superbot2/config.json"

if [[ -z "$RECIPIENT" || -z "$IMAGE_PATH" ]]; then
  echo "Usage: send-imessage-image.sh <recipient> <image-file-path>" >&2
  exit 1
fi

if [[ ! -f "$IMAGE_PATH" ]]; then
  echo "send-imessage-image: file not found: $IMAGE_PATH" >&2
  exit 1
fi

# Resolve to absolute path
IMAGE_PATH="$(cd "$(dirname "$IMAGE_PATH")" && pwd)/$(basename "$IMAGE_PATH")"

# Read the superbot2 Apple ID from config for service lookup
APPLE_ID=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('imessage',{}).get('appleId',''))" 2>/dev/null || echo "")

# Escape double quotes for AppleScript string
ESCAPED_RECIPIENT="${RECIPIENT//\"/\\\"}"
ESCAPED_IMAGE_PATH="${IMAGE_PATH//\"/\\\"}"

if [[ -n "$APPLE_ID" ]]; then
  # Send FROM the superbot2 account specifically
  ESCAPED_APPLE_ID="${APPLE_ID//\"/\\\"}"
  osascript -e "
tell application \"Messages\"
  set superbot2Service to (first service whose (name contains \"$ESCAPED_APPLE_ID\" or id contains \"$ESCAPED_APPLE_ID\"))
  set targetBuddy to buddy \"$ESCAPED_RECIPIENT\" of superbot2Service
  send POSIX file \"$ESCAPED_IMAGE_PATH\" to targetBuddy
end tell
" 2>/dev/null && exit 0
fi

# Fallback: use default iMessage service
osascript -e "
tell application \"Messages\"
  set targetService to 1st service whose service type = iMessage
  set targetBuddy to buddy \"$ESCAPED_RECIPIENT\" of targetService
  send POSIX file \"$ESCAPED_IMAGE_PATH\" to targetBuddy
end tell
"
