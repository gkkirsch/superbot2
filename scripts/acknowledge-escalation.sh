#!/bin/bash
# acknowledge-escalation.sh - Mark an escalation as acknowledged by the orchestrator
# Usage: acknowledge-escalation.sh <escalation-file>
#
# Sets the acknowledgedAt field to the current ISO timestamp.
# Works on files in any escalation directory (untriaged, needs_human, resolved).
# Modifies the file in-place (no directory move).
#
# Examples:
#   acknowledge-escalation.sh ~/.superbot2/escalations/needs_human/esc-meta-chat-agent-chat-complete.json
#   acknowledge-escalation.sh ~/.superbot2/escalations/untriaged/esc-api-payments-need-stripe-key.json

set -uo pipefail

FILE="${1:-}"

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage: acknowledge-escalation.sh <escalation-file>" >&2
  exit 1
fi

ISO_NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

jq --arg ts "$ISO_NOW" '.acknowledgedAt = $ts' "$FILE" > "${FILE}.tmp" && mv "${FILE}.tmp" "$FILE"

echo "Acknowledged: $FILE (at $ISO_NOW)"
