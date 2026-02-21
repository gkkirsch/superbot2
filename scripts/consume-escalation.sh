#!/bin/bash
# consume-escalation.sh - Mark a resolved escalation as consumed
# Usage: consume-escalation.sh <escalation-file>
#
# Sets consumedAt timestamp so the heartbeat stops flagging the project.
#
# Examples:
#   consume-escalation.sh ~/.superbot2/escalations/resolved/esc-2026-02-15T10-30-45Z.json

set -uo pipefail

FILE="${1:-}"

if [[ -z "$FILE" ]]; then
  echo "Usage: consume-escalation.sh <escalation-file>" >&2
  exit 1
fi

if [[ ! -f "$FILE" ]]; then
  echo "Escalation not found: $FILE" >&2
  exit 1
fi

ISO_NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

jq --arg ts "$ISO_NOW" '.consumedAt = $ts' "$FILE" > "${FILE}.tmp" && mv "${FILE}.tmp" "$FILE"

echo "Consumed escalation: $(basename "$FILE")"
