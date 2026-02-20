#!/bin/bash
# TeammateIdle hook - Enforces PM discipline before a space worker can go idle
#
# Checks are scoped to the CURRENT WORK CYCLE (since last team-lead message)
# so that teammates who get woken up multiple times aren't blocked by stale state.
#
# Disk checks (current state):
#   1. No tasks still marked in_progress
#   2. All tasks complete → plan.md must have "Next Steps" section
#   3. Blocked tasks have escalations filed
#
# Transcript checks (scoped to current cycle):
#   4. Reported results to orchestrator (SendMessage)
#   5. Verified work (ran test/build commands)
#   6. Distilled knowledge (wrote to knowledge/)
#   7. Completion keyword (IDLE_CHECKLIST_COMPLETE)
#
# Receives JSON on stdin with: teammate_name, team_name, cwd, transcript_path
# Exit 0 = allow idle
# Exit 2 = keep working (stderr message sent back as feedback)

set -uo pipefail

INPUT=$(cat)
TEAMMATE=$(echo "$INPUT" | jq -r '.teammate_name // empty')
TEAM=$(echo "$INPUT" | jq -r '.team_name // empty')
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // empty')

DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}"
MISSING=()

# --- Determine which space/project this teammate is working on ---
# Primary: extract from transcript (worker prompt always starts with "# <space> / <project>")
SPACE=""
PROJECT=""

if [[ -n "$TRANSCRIPT" && -f "$TRANSCRIPT" ]]; then
  header=$(grep -m1 '^# [a-z]' "$TRANSCRIPT" 2>/dev/null || true)
  if [[ "$header" =~ ^#\ ([a-zA-Z0-9_-]+)\ /\ ([a-zA-Z0-9_-]+) ]]; then
    SPACE="${BASH_REMATCH[1]}"
    PROJECT="${BASH_REMATCH[2]}"
  fi
fi

# Fallback: check cwd against space codeDirs
if [[ -z "$SPACE" ]]; then
  CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
  if [[ -n "$CWD" ]]; then
    for space_dir in "$DIR"/spaces/*/; do
      [[ ! -d "$space_dir" ]] && continue
      slug=$(basename "$space_dir")
      code_dir=$(jq -r '.codeDir // empty' "$space_dir/space.json" 2>/dev/null)
      code_dir="${code_dir/#\~/$HOME}"
      if [[ -n "$code_dir" && "$CWD" == "$code_dir"* ]]; then
        SPACE="$slug"
        # Find project by most recently modified tasks
        latest_proj=""
        latest_time=0
        for plan_dir in "$space_dir"plans/*/; do
          [[ ! -d "$plan_dir" ]] && continue
          proj=$(basename "$plan_dir")
          mod_time=$(stat -f %m "$plan_dir" 2>/dev/null || echo 0)
          if [[ "$mod_time" -gt "$latest_time" ]]; then
            latest_time="$mod_time"
            latest_proj="$proj"
          fi
        done
        if [[ -n "$latest_proj" ]]; then
          PROJECT="$latest_proj"
        fi
        break
      fi
    done
  fi
fi

# If we couldn't identify the space, allow idle
if [[ -z "$SPACE" || -z "$PROJECT" ]]; then
  exit 0
fi

SPACE_DIR="$DIR/spaces/$SPACE"
PLAN_DIR="$SPACE_DIR/plans/$PROJECT"

# --- Scope transcript to current work cycle ---
# Use the full transcript but write it to a temp file for grep.
# Hook feedback appears as user messages but the worker's actual work
# (SendMessage, knowledge writes, etc.) appears throughout the transcript.
# We check the entire session since teammates get one briefing per session.
RECENT_FILE=""
if [[ -n "$TRANSCRIPT" && -f "$TRANSCRIPT" ]]; then
  RECENT_FILE=$(mktemp)
  trap "rm -f '$RECENT_FILE'" EXIT
  cp "$TRANSCRIPT" "$RECENT_FILE"
fi

# ============================================================
# DISK CHECKS (current state, no scoping needed)
# ============================================================

# --- Check 1: No hanging in_progress tasks ---
in_progress=$(grep -rl '"status".*"in_progress"' "$PLAN_DIR/tasks/" 2>/dev/null | wc -l | tr -d ' ')
if [[ "$in_progress" -gt 0 ]]; then
  MISSING+=("You have $in_progress task(s) still marked in_progress. Update them to completed or back to pending with a note about what's blocking them.")
fi

# --- Check 2: All tasks complete → plan.md must document next steps ---
all_tasks=$(find "$PLAN_DIR/tasks/" -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
completed_tasks=$(grep -rl '"status".*"completed"' "$PLAN_DIR/tasks/" 2>/dev/null | wc -l | tr -d ' ')
pending_or_ip=$(( all_tasks - completed_tasks ))
if [[ "$all_tasks" -gt 0 && "$pending_or_ip" -eq 0 ]]; then
  PLAN_FILE="$PLAN_DIR/plan.md"
  if [[ -f "$PLAN_FILE" ]]; then
    if ! grep -qiE '(## *Next Steps|## *What.s Next|## *Future Work|## *Follow.up|## *Proposed Next)' "$PLAN_FILE" 2>/dev/null; then
      MISSING+=("All tasks in $PROJECT are complete but plan.md has no 'Next Steps' section. Add a '## Next Steps' section to plan.md with concrete proposals: follow-up features, improvements, deployment steps, tech debt, etc. Include these suggestions in your message to team-lead too.")
    fi
  fi
fi

# --- Check 3: Blocked tasks have escalations ---
pending_tasks=$(grep -rl '"status".*"pending"' "$PLAN_DIR/tasks/" 2>/dev/null || true)
if [[ -n "$pending_tasks" ]]; then
  for task_file in $pending_tasks; do
    blocked_by=$(jq -r '.blockedBy | length' "$task_file" 2>/dev/null || echo 0)
    if [[ "$blocked_by" -gt 0 ]]; then
      task_id=$(jq -r '.id' "$task_file" 2>/dev/null)
      has_escalation=$(grep -rl "$task_id" "$DIR/escalations/untriaged/" "$DIR/escalations/needs_human/" 2>/dev/null | head -1 || true)
      if [[ -z "$has_escalation" ]]; then
        MISSING+=("Task $task_id is blocked but has no escalation. Create an escalation or remove the blocker.")
        break
      fi
    fi
  done
fi

# ============================================================
# TRANSCRIPT CHECKS (scoped to current work cycle)
# ============================================================

if [[ -n "$RECENT_FILE" && -f "$RECENT_FILE" ]]; then

  # --- Check 4: Reported results to orchestrator ---
  if ! grep -q 'SendMessage' "$RECENT_FILE" 2>/dev/null; then
    MISSING+=("Send a summary message to team-lead: tasks completed, new tasks created, escalations, plan status, blockers, and suggested next steps.")
  fi

  # --- Check 5: Verified work ---
  if ! grep -qE 'npm test|npm run|npx |pytest|cargo test|go test|make test|verification-before-completion|curl |open http' "$RECENT_FILE" 2>/dev/null; then
    MISSING+=("Verify your work. Run tests, build commands, or use the verification-before-completion skill to confirm your changes work correctly.")
  fi

  # --- Check 5b: Code review for implementation tasks ---
  # If the worker completed implementation tasks, they must have dispatched a code-reviewer subagent
  completed_impl=0
  if [[ -d "$PLAN_DIR/tasks" ]]; then
    for task_file in "$PLAN_DIR"/tasks/*.json; do
      [[ ! -f "$task_file" ]] && continue
      status=$(jq -r '.status' "$task_file" 2>/dev/null)
      labels=$(jq -r '.labels[]?' "$task_file" 2>/dev/null)
      if [[ "$status" == "completed" ]] && echo "$labels" | grep -qi 'implementation'; then
        completed_impl=$((completed_impl + 1))
      fi
    done
  fi
  if [[ "$completed_impl" -gt 0 ]]; then
    if ! grep -qiE 'code.review|code-reviewer|code_reviewer|superpowers:code-reviewer' "$RECENT_FILE" 2>/dev/null; then
      MISSING+=("You completed $completed_impl implementation task(s) but never dispatched a code review. Use the code-reviewer subagent (superpowers:code-reviewer) to review your implementation before going idle.")
    fi
  fi

  # --- Check 6: Distilled knowledge ---
  if ! grep -q 'knowledge/' "$RECENT_FILE" 2>/dev/null; then
    MISSING+=("Distill any conventions, patterns, or decisions learned this cycle to your space's knowledge/ directory.")
  fi

  # --- Check 7: Completion keyword ---
  if ! grep -q 'IDLE_CHECKLIST_COMPLETE' "$RECENT_FILE" 2>/dev/null; then
    MISSING+=("When you have completed all checklist items above, output the phrase IDLE_CHECKLIST_COMPLETE to confirm.")
  fi

fi

# --- Report ---
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "Before going idle, complete these items:" >&2
  for item in "${MISSING[@]}"; do
    echo "- $item" >&2
  done
  exit 2
fi

# --- Auto-write session summary ---
# Worker passed all checks. Write a session summary so the dashboard
# Recent Activity section stays up to date.
SESSIONS_DIR="$DIR/sessions"
mkdir -p "$SESSIONS_DIR"
TIMESTAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
SESSION_FILE="$SESSIONS_DIR/session-${TIMESTAMP}.json"

# Only write if we haven't already (avoid duplicates on re-idle)
existing=$(find "$SESSIONS_DIR" -name "*.json" -newer "$PLAN_DIR/plan.md" 2>/dev/null | head -1)
if [[ -z "$existing" ]]; then
  # Extract summary from the worker's SendMessage in transcript
  SUMMARY=""
  if [[ -n "$RECENT_FILE" && -f "$RECENT_FILE" ]]; then
    # Grab the last substantial text block sent via SendMessage (worker's completion report)
    SUMMARY=$(grep -A2 'SendMessage' "$RECENT_FILE" 2>/dev/null | grep -i 'task.*complete\|what was done\|completed\|summary' | head -1 | sed 's/^[[:space:]]*//' | cut -c1-200)
  fi
  if [[ -z "$SUMMARY" ]]; then
    SUMMARY="Worker $TEAMMATE completed work on $SPACE/$PROJECT"
  fi

  # Write session JSON
  cat > "$SESSION_FILE" << ENDSESSION
{
  "id": "session-${TIMESTAMP}",
  "space": "$SPACE",
  "project": "$PROJECT",
  "summary": "$(echo "$SUMMARY" | sed 's/"/\\"/g')",
  "filesChanged": [],
  "completedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "worker": "$TEAMMATE"
}
ENDSESSION

  # Also post to dashboard chat inbox
  DASHBOARD_INBOX="$HOME/.claude/teams/superbot2/inboxes/dashboard-user.json"
  if [[ -f "$DASHBOARD_INBOX" ]]; then
    # Append message using python for safe JSON manipulation
    python3 -c "
import json, os
from datetime import datetime, timezone
inbox_path = '$DASHBOARD_INBOX'
msgs = json.load(open(inbox_path)) if os.path.exists(inbox_path) else []
msgs.append({
    'from': 'team-lead',
    'text': 'Worker completed: $SPACE/$PROJECT — $(echo "$SUMMARY" | sed "s/'/\\\\'/g" | cut -c1-150)',
    'timestamp': datetime.now(timezone.utc).isoformat(),
    'read': False
})
json.dump(msgs, open(inbox_path, 'w'), indent=2)
" 2>/dev/null || true
  fi
fi

exit 0
