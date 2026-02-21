#!/bin/bash
# write-session.sh - Write a session summary for the dashboard Recent Activity feed
# Usage: write-session.sh <space> <project> <worker> --summary "what was done" [options]
#
# Options:
#   --summary "brief description" (required)
#   --files "path/to/file1,path/to/file2" (comma-separated, optional)
#
# Examples:
#   write-session.sh auth jwt-refresh auth-worker \
#     --summary "Implemented token blacklist using Redis. Added tests." \
#     --files "src/auth/blacklist.ts,src/auth/__tests__/blacklist.test.ts"

set -uo pipefail

SPACE="${1:-}"
PROJECT="${2:-}"
WORKER="${3:-}"
shift 3 2>/dev/null || true

if [[ -z "$SPACE" || -z "$PROJECT" || -z "$WORKER" ]]; then
  echo "Usage: write-session.sh <space> <project> <worker> --summary \"...\" [--files \"...\"]" >&2
  exit 1
fi

SUMMARY=""
FILES=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --summary) SUMMARY="$2"; shift 2 ;;
    --files) FILES="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$SUMMARY" ]]; then
  echo "Error: --summary is required" >&2
  exit 1
fi

DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}"
SESSIONS_DIR="$DIR/sessions"
mkdir -p "$SESSIONS_DIR"

TIMESTAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
ISO_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
FILE="$SESSIONS_DIR/session-${TIMESTAMP}.json"

# Build files array
if [[ -n "$FILES" ]]; then
  FILES_JSON=$(echo "$FILES" | tr ',' '\n' | jq -R . | jq -s .)
else
  FILES_JSON="[]"
fi

jq -n \
  --arg id "session-${TIMESTAMP}" \
  --arg space "$SPACE" \
  --arg project "$PROJECT" \
  --arg summary "$SUMMARY" \
  --argjson filesChanged "$FILES_JSON" \
  --arg completedAt "$ISO_TIMESTAMP" \
  --arg worker "$WORKER" \
  '{
    id: $id,
    space: $space,
    project: $project,
    summary: $summary,
    filesChanged: $filesChanged,
    completedAt: $completedAt,
    worker: $worker
  }' > "$FILE"

echo "Wrote session: $FILE"
