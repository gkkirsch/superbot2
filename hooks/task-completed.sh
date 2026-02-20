#!/bin/bash
# TaskCompleted hook - Enforces quality gates before a task can be marked done
#
# Receives JSON on stdin with: task_id, task_subject, task_description,
#   teammate_name, team_name, cwd
# Exit 0 = allow completion
# Exit 2 = block completion (stderr message sent back as feedback)

set -uo pipefail

INPUT=$(cat)
TASK_ID=$(echo "$INPUT" | jq -r '.task_id // empty')
TASK_SUBJECT=$(echo "$INPUT" | jq -r '.task_subject // empty')
TEAMMATE=$(echo "$INPUT" | jq -r '.teammate_name // empty')

DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}"
MISSING=()

# --- Find the task file on disk ---
# Search for a task file matching this ID across all spaces/projects
TASK_FILE=""
for task_file in $(find "$DIR"/spaces/*/plans/*/tasks -name "*.json" 2>/dev/null); do
  [[ ! -f "$task_file" ]] && continue
  file_id=$(jq -r '.id // empty' "$task_file" 2>/dev/null)
  if [[ "$file_id" == "$TASK_ID" ]]; then
    TASK_FILE="$task_file"
    break
  fi
done

# If we can't find the task file, this is a Claude Code team task (not a space task)
# Allow it through - we only enforce on space project tasks
if [[ -z "$TASK_FILE" ]]; then
  exit 0
fi

# --- Check 1: Does it have completionNotes? ---
notes=$(jq -r '.completionNotes // empty' "$TASK_FILE" 2>/dev/null)
if [[ -z "$notes" ]]; then
  MISSING+=("Add completionNotes to task '$TASK_SUBJECT' describing what was done, what changed, and any decisions made.")
fi

# --- Check 2: Is completedAt set? ---
completed_at=$(jq -r '.completedAt // empty' "$TASK_FILE" 2>/dev/null)
if [[ -z "$completed_at" ]]; then
  MISSING+=("Set completedAt timestamp on task '$TASK_SUBJECT'.")
fi

# --- Check 3: Are acceptance criteria present? ---
criteria_count=$(jq '.acceptanceCriteria | length' "$TASK_FILE" 2>/dev/null || echo 0)
if [[ "$criteria_count" -gt 0 ]]; then
  # We can't automatically verify criteria, but we can remind the agent
  # Only flag this if completionNotes don't mention the criteria
  if [[ -n "$notes" ]]; then
    notes_length=${#notes}
    if [[ "$notes_length" -lt 20 ]]; then
      MISSING+=("completionNotes are too brief. Describe how acceptance criteria were met for '$TASK_SUBJECT'.")
    fi
  fi
fi

# --- Report ---
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "Before completing this task:" >&2
  for item in "${MISSING[@]}"; do
    echo "- $item" >&2
  done
  exit 2
fi

exit 0
