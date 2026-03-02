#!/bin/bash
# PreCompact hook - Notifies dashboard chat when context compaction happens
#
# Receives JSON on stdin with: session_id, transcript_path, cwd,
#   permission_mode, hook_event_name, trigger, custom_instructions
# Team hooks also receive: teammate_name, team_name
#
# If teammate_name is present → worker compacting
# If teammate_name is absent → orchestrator/solo agent compacting
#
# Exit 0 always — never block compaction

set -uo pipefail

INPUT=$(cat)
TRIGGER=$(echo "$INPUT" | jq -r '.trigger // "auto"')
TEAMMATE=$(echo "$INPUT" | jq -r '.teammate_name // empty')

DASHBOARD_INBOX="$HOME/.claude/teams/superbot2/inboxes/dashboard-user.json"

# Only write if the inbox file exists (dashboard infrastructure is set up)
if [[ ! -f "$DASHBOARD_INBOX" ]]; then
  exit 0
fi

# Build message text based on who is compacting
if [[ -n "$TEAMMATE" ]]; then
  # Worker/teammate compacting
  TEXT="$TEAMMATE compacting"
else
  # Orchestrator or solo agent compacting
  TEXT="orchestrator compacting"
fi

if [[ "$TRIGGER" == "manual" ]]; then
  TEXT="$TEXT (manual)"
fi

# Append message to dashboard-user inbox using jq
INBOX_TMP="${DASHBOARD_INBOX}.tmp"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq --arg text "$TEXT" --arg ts "$TS" \
  '. + [{from: "system", type: "compact", text: $text, timestamp: $ts, read: false}]' \
  "$DASHBOARD_INBOX" > "$INBOX_TMP" 2>/dev/null && mv "$INBOX_TMP" "$DASHBOARD_INBOX" || true

exit 0
