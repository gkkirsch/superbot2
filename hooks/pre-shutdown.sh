#!/bin/bash
# Pre-shutdown hook
# Runs before shutdown for both orchestrator and workers.
#
# Exit 0 = allow shutdown
# Exit 2 = keep working (stderr message sent back as feedback)

set -uo pipefail

INPUT=$(cat)
DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}"
MISSING=()

# --- Check 1: Any unreviewed draft escalations? ---
draft_count=$(find "$DIR/escalations/untriaged" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
if [[ "$draft_count" -gt 0 ]]; then
  MISSING+=("$draft_count untriaged escalation(s) in escalations/untriaged/. Promote them to escalations/needs_human/ for the user. Do NOT resolve them yourself.")
fi

# --- Check 2: Any orphaned in_progress tasks? ---
orphaned=0
for task_file in $(find "$DIR"/spaces/*/plans/*/tasks -name "*.json" 2>/dev/null); do
  [[ ! -f "$task_file" ]] && continue
  status=$(jq -r '.status // empty' "$task_file" 2>/dev/null)
  if [[ "$status" == "in_progress" ]]; then
    orphaned=$((orphaned + 1))
  fi
done

if [[ "$orphaned" -gt 0 ]]; then
  MISSING+=("$orphaned task(s) still marked in_progress. Update their status to pending (with a note) or completed.")
fi

# --- Report ---
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "Before shutting down:" >&2
  for item in "${MISSING[@]}"; do
    echo "- $item" >&2
  done
  exit 2
fi

exit 0
