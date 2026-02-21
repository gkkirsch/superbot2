#!/bin/bash
# portfolio-status.sh - Print a detailed summary of all spaces, projects, tasks, and escalations
# Usage: portfolio-status.sh [--compact]
#
# Default output includes pending/in_progress task subjects.
# Use --compact for counts only (no task details).
#
# Example output:
#   auth:
#     jwt-refresh: 3/5 done, 2 pending
#       → [pending] Implement token blacklist
#       → [pending] Update API docs
#     sso-support: 0 tasks (plan phase)
#
#   api:
#     rate-limiting: 2/4 done, 1 in_progress, 1 pending
#       → [in_progress] Add rate limit headers
#       → [pending] Write load tests
#     user-endpoints: 7/7 done
#
#   Escalations:
#     untriaged: 2
#       → [kidsvids/agent-chat] "Agent chat feature complete — what's next?" (approval, medium)
#       → [api/rate-limiting] "Which rate limit algorithm?" (decision, high)
#     needs_human: 1
#       → [auth/jwt-refresh] "Redis vs Memcached for token store?" (decision, high)

set -uo pipefail

DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}"
SPACES_DIR="$DIR/spaces"
COMPACT=false

if [[ "${1:-}" == "--compact" ]]; then
  COMPACT=true
fi

if [[ ! -d "$SPACES_DIR" ]]; then
  echo "No spaces found."
  exit 0
fi

for space_dir in "$SPACES_DIR"/*/; do
  [[ ! -d "$space_dir" ]] && continue
  slug=$(basename "$space_dir")
  echo "$slug:"

  plans_dir="$space_dir/plans"
  if [[ ! -d "$plans_dir" ]]; then
    echo "  (no projects)"
    echo ""
    continue
  fi

  has_projects=false
  for plan_dir in "$plans_dir"/*/; do
    [[ ! -d "$plan_dir" ]] && continue
    has_projects=true
    project=$(basename "$plan_dir")
    tasks_dir="$plan_dir/tasks"

    if [[ ! -d "$tasks_dir" ]]; then
      echo "  $project: no tasks (plan phase)"
      continue
    fi

    total=0
    completed=0
    in_progress=0
    pending=0
    cancelled=0
    pending_subjects=()
    in_progress_subjects=()

    for task_file in "$tasks_dir"/*.json; do
      [[ ! -f "$task_file" ]] && continue
      total=$((total + 1))
      task_data=$(jq -r '[.status // "pending", .subject // "untitled"] | @tsv' "$task_file" 2>/dev/null)
      status=$(echo "$task_data" | cut -f1)
      subject=$(echo "$task_data" | cut -f2)
      case "$status" in
        completed|complete|done) completed=$((completed + 1)) ;;
        in_progress) in_progress=$((in_progress + 1)); in_progress_subjects+=("$subject") ;;
        cancelled) cancelled=$((cancelled + 1)) ;;
        *) pending=$((pending + 1)); pending_subjects+=("$subject") ;;
      esac
    done

    # Adjust total to exclude cancelled
    active_total=$((total - cancelled))

    if [[ "$active_total" -eq 0 ]]; then
      if [[ "$cancelled" -gt 0 ]]; then
        echo "  $project: $cancelled cancelled"
      else
        echo "  $project: 0 tasks (plan phase)"
      fi
    else
      parts="$completed/$active_total done"
      [[ "$in_progress" -gt 0 ]] && parts="$parts, $in_progress in_progress"
      [[ "$pending" -gt 0 && "$completed" -lt "$active_total" ]] && parts="$parts, $pending pending"
      [[ "$cancelled" -gt 0 ]] && parts="$parts, $cancelled cancelled"
      echo "  $project: $parts"

      # Show task details for non-complete projects (unless --compact)
      if [[ "$COMPACT" == false && "$completed" -lt "$active_total" ]]; then
        for subj in "${in_progress_subjects[@]+"${in_progress_subjects[@]}"}"; do
          echo "    → [in_progress] $subj"
        done
        for subj in "${pending_subjects[@]+"${pending_subjects[@]}"}"; do
          echo "    → [pending] $subj"
        done
      fi
    fi
  done

  if [[ "$has_projects" == false ]]; then
    echo "  (no projects)"
  fi

  echo ""
done

# Escalations summary with details
print_escalations() {
  local esc_dir="$1"
  local label="$2"
  local count
  count=$(find "$esc_dir" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')

  if [[ "$count" -gt 0 ]]; then
    echo "  $label: $count"
    if [[ "$COMPACT" == false ]]; then
      for esc_file in "$esc_dir"/*.json; do
        [[ ! -f "$esc_file" ]] && continue
        esc_data=$(jq -r '[.space // "?", .project // "?", .question // .subject // "?", .type // "?", .priority // "?"] | @tsv' "$esc_file" 2>/dev/null)
        esc_space=$(echo "$esc_data" | cut -f1)
        esc_project=$(echo "$esc_data" | cut -f2)
        esc_question=$(echo "$esc_data" | cut -f3)
        esc_type=$(echo "$esc_data" | cut -f4)
        esc_priority=$(echo "$esc_data" | cut -f5)
        echo "    → [$esc_space/$esc_project] \"$esc_question\" ($esc_type, $esc_priority)"
      done
    fi
  fi
}

untriaged_count=$(find "$DIR/escalations/untriaged" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
needs_human_count=$(find "$DIR/escalations/needs_human" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')

if [[ "$untriaged_count" -gt 0 || "$needs_human_count" -gt 0 ]]; then
  echo "Escalations:"
  print_escalations "$DIR/escalations/untriaged" "untriaged"
  print_escalations "$DIR/escalations/needs_human" "needs_human"
fi
