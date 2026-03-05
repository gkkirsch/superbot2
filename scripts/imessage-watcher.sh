#!/bin/bash
# imessage-watcher.sh — Poll iMessage chat.db for new messages and inject into superbot2 inbox
set -euo pipefail

# Singleton guard — kill any existing iMessage watcher before starting
PID_FILE="$HOME/.superbot2/.pids/imessage-watcher.pid"
mkdir -p "$(dirname "$PID_FILE")"
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Killing existing imessage-watcher (PID $OLD_PID)"
    kill "$OLD_PID"
    sleep 1
    if kill -0 "$OLD_PID" 2>/dev/null; then
      kill -9 "$OLD_PID" 2>/dev/null || true
      sleep 1
    fi
  fi
  rm -f "$PID_FILE"
fi
echo $$ > "$PID_FILE"
trap "rm -f '$PID_FILE'" EXIT

CONFIG_FILE="$HOME/.superbot2/config.json"
ROWID_FILE="$HOME/.superbot2/imessage-last-rowid.txt"
CHAT_DB="$HOME/Library/Messages/chat.db"
API_URL="http://localhost:3274/api/messages"
POLL_INTERVAL=5

# Read config
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "imessage-watcher: config.json not found, exiting." >&2
  exit 0
fi

ENABLED=$(jq -r '.imessage.enabled // false' "$CONFIG_FILE" 2>/dev/null || echo "false")
if [[ "$ENABLED" != "true" ]]; then
  echo "imessage-watcher: iMessage not enabled, exiting."
  exit 0
fi

APPLE_ID=$(jq -r '.imessage.appleId // ""' "$CONFIG_FILE" 2>/dev/null || echo "")
if [[ -z "$APPLE_ID" || "$APPLE_ID" == "YOUR_SUPERBOT2_APPLE_ID" ]]; then
  echo "imessage-watcher: Apple ID not configured, exiting." >&2
  exit 0
fi

# Check chat.db exists
if [[ ! -f "$CHAT_DB" ]]; then
  echo "imessage-watcher: chat.db not found at $CHAT_DB, exiting." >&2
  exit 0
fi

# Initialize last rowid
if [[ -f "$ROWID_FILE" ]]; then
  LAST_ROWID=$(cat "$ROWID_FILE")
else
  # Start from current max rowid (don't process historical messages)
  LAST_ROWID=$(sqlite3 -readonly "$CHAT_DB" "SELECT COALESCE(MAX(rowid), 0) FROM message;" 2>/dev/null || echo "0")
  echo "$LAST_ROWID" > "$ROWID_FILE"
fi

echo "imessage-watcher: started (Apple ID: $APPLE_ID, last rowid: $LAST_ROWID)"

while true; do
  # Query for new messages in the chat with the superbot2 Apple ID
  RESULTS=$(sqlite3 -readonly -separator '|' "$CHAT_DB" "
    SELECT m.rowid, m.text, m.date
    FROM message m
    JOIN chat_message_join cmj ON cmj.message_id = m.rowid
    JOIN chat c ON c.rowid = cmj.chat_id
    WHERE m.rowid > $LAST_ROWID
      AND m.is_from_me = 0
      AND m.text IS NOT NULL
      AND m.text != ''
      AND m.account LIKE '%$APPLE_ID%'
      AND c.chat_identifier != '$APPLE_ID'
    ORDER BY m.rowid ASC
    LIMIT 50;
  " 2>/dev/null || echo "")

  if [[ -n "$RESULTS" ]]; then
    while IFS='|' read -r ROWID TEXT DATE_VAL; do
      [[ -z "$ROWID" ]] && continue

      echo "imessage-watcher: new message (rowid=$ROWID): ${TEXT:0:50}..."

      # POST to dashboard API
      # Use jq for proper JSON escaping
      PAYLOAD=$(jq -cn --arg text "$TEXT" '{"text": $text}' 2>/dev/null)

      HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" 2>/dev/null || echo "000")

      if [[ "$HTTP_CODE" == "200" ]]; then
        echo "imessage-watcher: message injected (rowid=$ROWID)"
      else
        echo "imessage-watcher: failed to inject message (HTTP $HTTP_CODE)" >&2
      fi

      LAST_ROWID="$ROWID"
    done <<< "$RESULTS"

    # Update last rowid file
    echo "$LAST_ROWID" > "$ROWID_FILE"
  fi

  sleep "$POLL_INTERVAL"
done
