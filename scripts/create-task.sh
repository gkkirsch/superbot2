#!/bin/bash
# create-task.sh - Create a task in a project
# Usage: create-task.sh <space> <project> <subject> [options]
#
# Options:
#   --description "what needs to be done"
#   --priority critical|high|medium|low (default: medium)
#   --criteria "acceptance criterion" (repeatable)
#   --label "label" (repeatable, default: implementation)
#   --blocked-by "task-id" (repeatable)
#   --blocks "task-id" (repeatable)
#
# Examples:
#   create-task.sh auth add-auth "Implement login endpoint" \
#     --description "POST /auth/login with email and password" \
#     --criteria "Returns JWT on valid credentials" \
#     --criteria "Returns 401 on invalid credentials" \
#     --criteria "Tests cover happy path and errors" \
#     --priority high
#
#   create-task.sh web dashboard "Add loading states" \
#     --description "Show skeleton UI while data loads" \
#     --priority low \
#     --blocked-by "task-2026-02-15T10-30-45Z"

set -uo pipefail

SPACE="${1:-}"
PROJECT="${2:-}"
SUBJECT="${3:-}"
shift 3 2>/dev/null || true

if [[ -z "$SPACE" || -z "$PROJECT" || -z "$SUBJECT" ]]; then
  echo "Usage: create-task.sh <space> <project> <subject> [options]" >&2
  exit 1
fi

TASKS_DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}/spaces/$SPACE/plans/$PROJECT/tasks"

if [[ ! -d "$TASKS_DIR" ]]; then
  echo "Project '$PROJECT' in space '$SPACE' does not exist ($TASKS_DIR)" >&2
  exit 1
fi

# Parse options
DESCRIPTION=""
PRIORITY="medium"
CRITERIA=()
LABELS=()
BLOCKED_BY=()
BLOCKS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --description) DESCRIPTION="$2"; shift 2 ;;
    --priority) PRIORITY="$2"; shift 2 ;;
    --criteria) CRITERIA+=("$2"); shift 2 ;;
    --label) LABELS+=("$2"); shift 2 ;;
    --blocked-by) BLOCKED_BY+=("$2"); shift 2 ;;
    --blocks) BLOCKS+=("$2"); shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Default label
if [[ ${#LABELS[@]} -eq 0 ]]; then
  LABELS=("implementation")
fi

# Generate timestamp ID
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
ID="task-${TIMESTAMP}"
ISO_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
FILE="$TASKS_DIR/$ID.json"

# Build JSON arrays
to_json_array() {
  local arr=("$@")
  if [[ ${#arr[@]} -eq 0 ]]; then
    echo "[]"
  else
    printf '%s\n' "${arr[@]}" | jq -R . | jq -s .
  fi
}

CRITERIA_JSON=$(to_json_array "${CRITERIA[@]+"${CRITERIA[@]}"}")
LABELS_JSON=$(to_json_array "${LABELS[@]}")
BLOCKED_BY_JSON=$(to_json_array "${BLOCKED_BY[@]+"${BLOCKED_BY[@]}"}")
BLOCKS_JSON=$(to_json_array "${BLOCKS[@]+"${BLOCKS[@]}"}")

jq -n \
  --arg id "$ID" \
  --arg subject "$SUBJECT" \
  --arg description "$DESCRIPTION" \
  --argjson acceptanceCriteria "$CRITERIA_JSON" \
  --arg priority "$PRIORITY" \
  --argjson labels "$LABELS_JSON" \
  --argjson blocks "$BLOCKS_JSON" \
  --argjson blockedBy "$BLOCKED_BY_JSON" \
  --arg createdAt "$ISO_TIMESTAMP" \
  '{
    id: $id,
    subject: $subject,
    description: $description,
    acceptanceCriteria: $acceptanceCriteria,
    status: "pending",
    priority: $priority,
    labels: $labels,
    blocks: $blocks,
    blockedBy: $blockedBy,
    createdAt: $createdAt,
    updatedAt: $createdAt,
    completedAt: null,
    completionNotes: null
  }' > "$FILE"

echo "Created task: $ID ($FILE)"
