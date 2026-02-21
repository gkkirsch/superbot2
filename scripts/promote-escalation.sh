#!/bin/bash
# promote-escalation.sh - Promote an untriaged escalation to needs_human
# Usage: promote-escalation.sh <escalation-file>
#
# Updates status to "needs_human" and moves file to the needs_human/ directory
# so it appears on the user's dashboard.
#
# Examples:
#   promote-escalation.sh ~/.superbot2/escalations/untriaged/esc-auth-jwt-should-we-use-jwt.json

set -uo pipefail

FILE="${1:-}"

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage: promote-escalation.sh <escalation-file>" >&2
  exit 1
fi

jq '.status = "needs_human"' "$FILE" > "${FILE}.tmp" && mv "${FILE}.tmp" "$FILE"

# Move to needs_human/
DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}"
NEEDS_HUMAN_DIR="$DIR/escalations/needs_human"
mkdir -p "$NEEDS_HUMAN_DIR"
BASENAME=$(basename "$FILE")
mv "$FILE" "$NEEDS_HUMAN_DIR/$BASENAME"

echo "Promoted to needs_human: $NEEDS_HUMAN_DIR/$BASENAME"
