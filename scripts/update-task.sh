#!/bin/bash
# update-task.sh - Update a task's status and metadata
# Usage: update-task.sh <space> <project> <task-id> --status <status> [options]
#
# Options:
#   --status pending|in_progress|completed (required)
#   --notes "completion notes or status update"
#
# Examples:
#   update-task.sh auth jwt-refresh task-2026-02-15T10-30-45Z --status in_progress
#
#   update-task.sh auth jwt-refresh task-2026-02-15T10-30-45Z --status completed \
#     --notes "Implemented token blacklist using Redis. Added tests for expiry."
#
#   update-task.sh auth jwt-refresh task-2026-02-15T10-30-45Z --status pending \
#     --notes "Blocked on Redis credentials"

set -uo pipefail

SPACE="${1:-}"
PROJECT="${2:-}"
TASK_ID="${3:-}"
shift 3 2>/dev/null || true

if [[ -z "$SPACE" || -z "$PROJECT" || -z "$TASK_ID" ]]; then
  echo "Usage: update-task.sh <space> <project> <task-id> --status <status> [options]" >&2
  exit 1
fi

TASKS_DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}/spaces/$SPACE/plans/$PROJECT/tasks"
FILE="$TASKS_DIR/$TASK_ID.json"

if [[ ! -f "$FILE" ]]; then
  echo "Task not found: $FILE" >&2
  exit 1
fi

# Parse options
STATUS=""
NOTES=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --status) STATUS="$2"; shift 2 ;;
    --notes) NOTES="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$STATUS" ]]; then
  echo "Error: --status is required" >&2
  exit 1
fi

if [[ "$STATUS" != "pending" && "$STATUS" != "in_progress" && "$STATUS" != "completed" ]]; then
  echo "Error: --status must be pending, in_progress, or completed" >&2
  exit 1
fi

ISO_NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Build update
if [[ "$STATUS" == "completed" ]]; then
  if [[ -n "$NOTES" ]]; then
    jq --arg s "$STATUS" --arg t "$ISO_NOW" --arg n "$NOTES" \
      '.status=$s | .updatedAt=$t | .completedAt=$t | .completionNotes=$n' \
      "$FILE" > "${FILE}.tmp" && mv "${FILE}.tmp" "$FILE"
  else
    jq --arg s "$STATUS" --arg t "$ISO_NOW" \
      '.status=$s | .updatedAt=$t | .completedAt=$t' \
      "$FILE" > "${FILE}.tmp" && mv "${FILE}.tmp" "$FILE"
  fi
elif [[ -n "$NOTES" ]]; then
  jq --arg s "$STATUS" --arg t "$ISO_NOW" --arg n "$NOTES" \
    '.status=$s | .updatedAt=$t | .completionNotes=$n' \
    "$FILE" > "${FILE}.tmp" && mv "${FILE}.tmp" "$FILE"
else
  jq --arg s "$STATUS" --arg t "$ISO_NOW" \
    '.status=$s | .updatedAt=$t' \
    "$FILE" > "${FILE}.tmp" && mv "${FILE}.tmp" "$FILE"
fi

echo "Updated $TASK_ID → $STATUS"
