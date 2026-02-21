#!/bin/bash
# resolve-escalation.sh - Resolve an escalation and move it to resolved/
# Usage: resolve-escalation.sh <escalation-file> --resolution "answer" [--resolved-by "who"]
#
# Options:
#   --resolution "the answer/decision" (required)
#   --resolved-by "orchestrator"|"user" (default: orchestrator)
#
# Examples:
#   resolve-escalation.sh ~/.superbot2/escalations/untriaged/esc-auth-jwt-should-we-use-jwt.json \
#     --resolution "Use JWT with Redis blacklist for revocation" \
#     --resolved-by orchestrator
#
#   resolve-escalation.sh ~/.superbot2/escalations/needs_human/esc-api-payments-need-stripe-key.json \
#     --resolution "Key added to .env — sk_test_abc123" \
#     --resolved-by user

set -uo pipefail

FILE="${1:-}"
shift 1 2>/dev/null || true

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage: resolve-escalation.sh <escalation-file> --resolution \"...\" [--resolved-by \"...\"]" >&2
  exit 1
fi

RESOLUTION=""
RESOLVED_BY="orchestrator"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --resolution) RESOLUTION="$2"; shift 2 ;;
    --resolved-by) RESOLVED_BY="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$RESOLUTION" ]]; then
  echo "Error: --resolution is required" >&2
  exit 1
fi

ISO_NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

jq --arg res "$RESOLUTION" --arg by "$RESOLVED_BY" --arg ts "$ISO_NOW" \
  '.status = "resolved" | .resolution = $res | .resolvedBy = $by | .resolvedAt = $ts' \
  "$FILE" > "${FILE}.tmp" && mv "${FILE}.tmp" "$FILE"

# Move to resolved/
DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}"
RESOLVED_DIR="$DIR/escalations/resolved"
mkdir -p "$RESOLVED_DIR"
BASENAME=$(basename "$FILE")
mv "$FILE" "$RESOLVED_DIR/$BASENAME"

echo "Resolved: $RESOLVED_DIR/$BASENAME"
