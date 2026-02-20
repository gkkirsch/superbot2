#!/bin/bash
# superbot2 heartbeat — detect changes, build actionable message for orchestrator
set -eo pipefail
shopt -s nullglob

# Source file locking helper for safe concurrent inbox writes
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lock-helper.sh"

DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}"
FINGERPRINT_FILE="$DIR/.heartbeat-last-fingerprint"
INBOX="$HOME/.claude/teams/superbot2/inboxes/team-lead.json"
ACTIVITY_LOG="$DIR/logs/heartbeat-activity.json"
KNOWLEDGE_HASH_FILE="$DIR/.heartbeat-knowledge-hashes"

# --- Activity tracker ---
log_activity() {
  local changed="$1"
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  mkdir -p "$DIR/logs"
  if [[ ! -f "$ACTIVITY_LOG" ]]; then
    echo "[]" > "$ACTIVITY_LOG"
  fi
  # Append entry and keep last 48 entries
  if command -v jq &>/dev/null; then
    jq --arg ts "$ts" --argjson changed "$changed" \
      '. + [{"ts": $ts, "changed": $changed}] | .[-48:]' \
      "$ACTIVITY_LOG" > "${ACTIVITY_LOG}.tmp" && mv "${ACTIVITY_LOG}.tmp" "$ACTIVITY_LOG"
  fi
}

# --- Collect current state file lists ---
untriaged_files=("$DIR"/escalations/untriaged/*.json)
pending_files=("$DIR"/escalations/needs_human/*.json)
resolved_files=("$DIR"/escalations/resolved/*.json)
knowledge_files=("$DIR"/knowledge/*)
memory_file="$DIR/MEMORY.md"

# --- Compute fingerprint from file contents ---
compute_fingerprint() {
  local hash_input=""

  for f in "${untriaged_files[@]}"; do
    [[ -f "$f" ]] && hash_input+="untriaged:$(md5 -q "$f")"
  done

  for f in "${pending_files[@]}"; do
    [[ -f "$f" ]] && hash_input+="needs_human:$(md5 -q "$f")"
  done

  for f in "${resolved_files[@]}"; do
    [[ -f "$f" ]] && hash_input+="resolved:$(md5 -q "$f")"
  done

  for f in "${knowledge_files[@]}"; do
    [[ -f "$f" ]] && hash_input+="knowledge:$(md5 -q "$f")"
  done

  if [[ -f "$memory_file" ]]; then
    hash_input+="memory:$(md5 -q "$memory_file")"
  fi

  # Include task files in fingerprint so task changes trigger heartbeat
  for space_dir in "$DIR"/spaces/*/; do
    [[ -d "$space_dir" ]] || continue
    for project_dir in "$space_dir"plans/*/; do
      [[ -d "$project_dir" ]] || continue
      for tf in "$project_dir"tasks/*.json; do
        [[ -f "$tf" ]] && hash_input+="task:$(md5 -q "$tf")"
      done
    done
  done

  if [[ -z "$hash_input" ]]; then
    echo "empty"
    return
  fi

  echo -n "$hash_input" | md5
}

# --- Scan all projects for task status ---
# Builds arrays of ready / blocked / needs-planning projects
scan_projects() {
  projects_ready_text=""
  projects_blocked_text=""
  projects_planning_text=""
  projects_ready_count=0
  projects_blocked_count=0
  projects_planning_count=0

  # Build a list of space/project pairs that have blocking needs_human escalations
  # (bash 3.2 compatible — no associative arrays)
  local _blocked_keys=""
  for pf in "${pending_files[@]}"; do
    if [[ -f "$pf" ]]; then
      pf_space=$(jq -r '.space // ""' "$pf" 2>/dev/null)
      pf_project=$(jq -r '.project // ""' "$pf" 2>/dev/null)
      pf_blocks=$(jq -r '.blocksProject // false' "$pf" 2>/dev/null)
      if [[ "$pf_blocks" == "true" && -n "$pf_space" && -n "$pf_project" ]]; then
        _blocked_keys+="${pf_space}/${pf_project}"$'\n'
      fi
    fi
  done

  # Build a list of space/project pairs that have unconsumed resolved escalations
  local _resolved_keys=""
  for rf in "${resolved_files[@]}"; do
    if [[ -f "$rf" ]]; then
      rf_space=$(jq -r '.space // ""' "$rf" 2>/dev/null)
      rf_project=$(jq -r '.project // ""' "$rf" 2>/dev/null)
      rf_consumed=$(jq -r '.consumedAt // "null"' "$rf" 2>/dev/null)
      if [[ -n "$rf_space" && -n "$rf_project" && "$rf_consumed" == "null" ]]; then
        _resolved_keys+="${rf_space}/${rf_project}"$'\n'
      fi
    fi
  done

  for space_dir in "$DIR"/spaces/*/; do
    [[ -d "$space_dir" ]] || continue
    local space_slug
    space_slug=$(basename "$space_dir")

    for project_dir in "$space_dir"plans/*/; do
      [[ -d "$project_dir" ]] || continue
      local project_name
      project_name=$(basename "$project_dir")
      local tasks_dir="$project_dir/tasks"
      local sp_key="${space_slug}/${project_name}"

      local p_count=0 ip_count=0 c_count=0 total=0
      local highest_priority="" task_lines=""

      # Priority ranking for comparison
      _priority_rank() {
        case "$1" in
          critical) echo 4 ;;
          high)     echo 3 ;;
          medium)   echo 2 ;;
          low)      echo 1 ;;
          *)        echo 0 ;;
        esac
      }

      local highest_rank=0

      if [[ -d "$tasks_dir" ]]; then
        for tf in "$tasks_dir"/*.json; do
          [[ -f "$tf" ]] || continue
          local status priority subject
          status=$(jq -r '.status // ""' "$tf" 2>/dev/null)
          priority=$(jq -r '.priority // "medium"' "$tf" 2>/dev/null)
          subject=$(jq -r '.subject // "unnamed"' "$tf" 2>/dev/null | head -c 100)
          ((total++)) || true

          case "$status" in
            pending)
              ((p_count++)) || true
              local rank
              rank=$(_priority_rank "$priority")
              if (( rank > highest_rank )); then
                highest_rank=$rank
                highest_priority="$priority"
              fi
              task_lines+="  - [${priority^^}] ${subject}"$'\n'
              ;;
            in_progress)
              ((ip_count++)) || true
              ;;
            completed)
              ((c_count++)) || true
              ;;
          esac
        done
      fi

      local human_blockers
      human_blockers=$(echo "$_blocked_keys" | grep -c "^${sp_key}$" 2>/dev/null || echo 0)

      if [[ "$p_count" -gt 0 && "$ip_count" -eq 0 && "$human_blockers" -eq 0 ]]; then
        # Ready for work: has pending tasks, no active worker, no blocking escalations
        projects_ready_text+="- ${sp_key}: ${p_count} pending (${c_count}/${total} done)"$'\n'
        projects_ready_text+="${task_lines}"
        ((projects_ready_count++)) || true
      elif [[ "$p_count" -gt 0 && "$human_blockers" -gt 0 ]]; then
        # Blocked: has pending tasks but needs_human escalations block it
        projects_blocked_text+="- ${sp_key}: ${p_count} pending, blocked by ${human_blockers} needs_human escalation(s)"$'\n'
        ((projects_blocked_count++)) || true
      elif [[ "$total" -eq 0 ]] && echo "$_resolved_keys" | grep -q "^${sp_key}$" 2>/dev/null; then
        # Needs planning: unconsumed resolved escalations but no tasks created yet
        projects_planning_text+="- ${sp_key}: 0 tasks, escalations resolved (unconsumed) — consider brainstorming"$'\n'
        ((projects_planning_count++)) || true
      fi
    done
  done
}

# --- Main ---

current_fingerprint=$(compute_fingerprint)

if [[ -f "$FINGERPRINT_FILE" ]]; then
  previous_fingerprint=$(cat "$FINGERPRINT_FILE")
else
  previous_fingerprint=""
fi

is_first_run=false
if [[ -z "$previous_fingerprint" ]]; then
  is_first_run=true
fi

if [[ "$current_fingerprint" == "$previous_fingerprint" ]]; then
  echo "heartbeat: no changes, skipping"
  log_activity false
  exit 0
fi

echo "heartbeat: changes detected"

# --- Compute per-file knowledge hashes for change tracking ---
new_k_hashes=""
for f in "${knowledge_files[@]}"; do
  [[ -f "$f" ]] && new_k_hashes+="$(md5 -q "$f")  $(basename "$f")"$'\n'
done

# --- Dedup: skip if unread heartbeat already in inbox ---
if [[ -f "$INBOX" ]]; then
  if command -v jq &>/dev/null; then
    unread_count=$(jq '[.[] | select(.type == "heartbeat" and .read == false)] | length' "$INBOX" 2>/dev/null || echo "0")
    if [[ "$unread_count" -gt 0 ]]; then
      echo "heartbeat: unread heartbeat already in inbox, skipping"
      echo "$current_fingerprint" > "$FINGERPRINT_FILE"
      echo -n "$new_k_hashes" > "$KNOWLEDGE_HASH_FILE"
      log_activity true
      exit 0
    fi
  fi
else
  echo '[]' > "$INBOX"
fi

# --- Gather counts ---
untriaged_count=${#untriaged_files[@]}
pending_count=${#pending_files[@]}
resolved_count=${#resolved_files[@]}

timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# --- Scan all projects ---
if command -v jq &>/dev/null; then
  scan_projects
else
  projects_ready_count=0
  projects_blocked_count=0
  projects_planning_count=0
  projects_ready_text=""
  projects_blocked_text=""
  projects_planning_text=""
fi

# --- Build actionable message ---
# The message tells the orchestrator exactly what to do, not just what changed.

actions=()
action_details=""

# First-run annotation
if [[ "$is_first_run" == true ]]; then
  action_details+="(First heartbeat — current state snapshot)"$'\n'
fi

# 1. Untriaged escalations → triage them
if [[ "$untriaged_count" -gt 0 ]]; then
  actions+=("TRIAGE: ${untriaged_count} untriaged escalation(s)")
  action_details+=$'\n## Triage These Escalations\n'
  action_details+="Read each file in $DIR/escalations/untriaged/ and move to resolved/ or needs_human/."$'\n'
  for f in "${untriaged_files[@]}"; do
    if [[ -f "$f" ]] && command -v jq &>/dev/null; then
      space=$(jq -r '.space // "unknown"' "$f" 2>/dev/null)
      project=$(jq -r '.project // "unknown"' "$f" 2>/dev/null)
      question=$(jq -r '.question // "unknown"' "$f" 2>/dev/null | head -c 120)
      esc_type=$(jq -r '.type // "question"' "$f" 2>/dev/null)
      blocks_project=$(jq -r '.blocksProject // false' "$f" 2>/dev/null)
      blocks_task=$(jq -r '.blocksTask // "null"' "$f" 2>/dev/null)
      blocking=""
      [[ "$blocks_project" == "true" ]] && blocking=" (BLOCKS PROJECT)"
      [[ "$blocks_task" != "null" ]] && blocking=" (blocks task: $blocks_task)"
      action_details+="- [${space}/${project}] ${esc_type}: \"${question}\"${blocking}"$'\n'
    fi
  done
fi

# 1b. Recently resolved escalations (unconsumed) → spawn workers
resolved_unconsumed_count=0
resolved_unconsumed_text=""
for rf in "${resolved_files[@]}"; do
  if [[ -f "$rf" ]] && command -v jq &>/dev/null; then
    rf_consumed=$(jq -r '.consumedAt // "null"' "$rf" 2>/dev/null)
    if [[ "$rf_consumed" == "null" ]]; then
      ((resolved_unconsumed_count++)) || true
      rf_space=$(jq -r '.space // "unknown"' "$rf" 2>/dev/null)
      rf_project=$(jq -r '.project // "unknown"' "$rf" 2>/dev/null)
      rf_question=$(jq -r '.question // "unknown"' "$rf" 2>/dev/null | head -c 120)
      rf_resolved_by=$(jq -r '.resolvedBy // "user"' "$rf" 2>/dev/null)
      resolved_unconsumed_text+="- RESOLVED: [${rf_space}/${rf_project}] escalation \"${rf_question}\" resolved by ${rf_resolved_by} — spawn worker to continue"$'\n'
    fi
  fi
done

if [[ "$resolved_unconsumed_count" -gt 0 ]]; then
  actions+=("RESOLVED: ${resolved_unconsumed_count} escalation(s) resolved, unconsumed")
  action_details+=$'\n## Resolved Escalations — Spawn Workers\n'
  action_details+="These escalations were resolved but no worker has consumed them yet. Spawn workers for affected projects."$'\n'
  action_details+="$resolved_unconsumed_text"
fi

# 2. Projects ready for work
if [[ "$projects_ready_count" -gt 0 ]]; then
  actions+=("READY: ${projects_ready_count} project(s) with pending tasks")
  action_details+=$'\n## Projects Ready for Work\n'
  action_details+="Projects with pending tasks, no active worker, no blocking escalations."$'\n'
  action_details+="$projects_ready_text"
fi

# 3. Projects blocked by needs_human escalations
if [[ "$projects_blocked_count" -gt 0 ]]; then
  actions+=("BLOCKED: ${projects_blocked_count} project(s) waiting on user")
  action_details+=$'\n## Still Blocked\n'
  action_details+="Projects with pending tasks but blocked by needs_human escalations."$'\n'
  action_details+="$projects_blocked_text"
fi

# 4. Projects needing planning
if [[ "$projects_planning_count" -gt 0 ]]; then
  actions+=("PLAN: ${projects_planning_count} project(s) need planning")
  action_details+=$'\n## Needs Planning\n'
  action_details+="Projects with resolved escalations but no tasks created yet."$'\n'
  action_details+="$projects_planning_text"
fi

# 5. Needs-human escalations waiting on user
if [[ "$pending_count" -gt 0 ]]; then
  waiting_detail=""
  first_question=""
  for pf in "${pending_files[@]}"; do
    if [[ -f "$pf" ]] && command -v jq &>/dev/null; then
      pf_space=$(jq -r '.space // "unknown"' "$pf" 2>/dev/null)
      pf_project=$(jq -r '.project // "unknown"' "$pf" 2>/dev/null)
      pf_question=$(jq -r '.question // "unknown"' "$pf" 2>/dev/null | head -c 120)
      pf_type=$(jq -r '.type // "question"' "$pf" 2>/dev/null)
      pf_priority=$(jq -r '.priority // "medium"' "$pf" 2>/dev/null)
      pf_blocks_project=$(jq -r '.blocksProject // false' "$pf" 2>/dev/null)
      blocking=""
      [[ "$pf_blocks_project" == "true" ]] && blocking=" (BLOCKS PROJECT)"
      waiting_detail+="- [${pf_space}/${pf_project}] ${pf_type}: \"${pf_question}\" [${pf_priority}]${blocking}"$'\n'
      [[ -z "$first_question" ]] && first_question="$pf_question"
    fi
  done

  # Make action line specific: include question for single, count for multiple
  if [[ "$pending_count" -eq 1 && -n "$first_question" ]]; then
    short_q=$(echo "$first_question" | head -c 80)
    actions+=("WAITING: \"${short_q}\"")
  else
    actions+=("WAITING: ${pending_count} escalations need input")
  fi
  action_details+=$'\n## Escalations Waiting on User\n'
  action_details+="These need your decision in the dashboard or via escalation files."$'\n'
  action_details+="$waiting_detail"
fi

# 6. Knowledge files → review for cross-space patterns
knowledge_updated=false
k_changed_names=""

if [[ -n "$previous_fingerprint" ]]; then
  # Load previous per-file hashes (one "hash  filename" per line)
  prev_k_hashes=""
  if [[ -f "$KNOWLEDGE_HASH_FILE" ]]; then
    prev_k_hashes=$(cat "$KNOWLEDGE_HASH_FILE")
  fi

  k_changed_details=""
  k_changed_count=0

  for f in "${knowledge_files[@]}"; do
    if [[ -f "$f" ]]; then
      fname=$(basename "$f")
      fhash=$(md5 -q "$f")

      # Look up previous hash for this file
      prev_hash=""
      if [[ -n "$prev_k_hashes" ]]; then
        prev_hash=$(echo "$prev_k_hashes" | grep "  ${fname}$" | head -1 | awk '{print $1}')
      fi

      if [[ -z "$prev_hash" ]]; then
        # New file
        ((k_changed_count++)) || true
        knowledge_updated=true
        headings=""
        if grep -q '^### ' "$f" 2>/dev/null; then
          headings=$(grep '^### ' "$f" | sed 's/^### //' | tail -3 | tr '\n' ',' | sed 's/,$//; s/,/, /g')
        elif grep -q '^## ' "$f" 2>/dev/null; then
          headings=$(grep '^## ' "$f" | sed 's/^## //' | tail -3 | tr '\n' ',' | sed 's/,$//; s/,/, /g')
        fi
        if [[ -n "$headings" ]]; then
          k_changed_details+="- ${fname} (NEW): ${headings}"$'\n'
        else
          k_changed_details+="- ${fname} (NEW)"$'\n'
        fi
        k_changed_names+="${fname}, "
      elif [[ "$fhash" != "$prev_hash" ]]; then
        # Updated file
        ((k_changed_count++)) || true
        knowledge_updated=true
        headings=""
        if grep -q '^### ' "$f" 2>/dev/null; then
          headings=$(grep '^### ' "$f" | sed 's/^### //' | tail -3 | tr '\n' ',' | sed 's/,$//; s/,/, /g')
        elif grep -q '^## ' "$f" 2>/dev/null; then
          headings=$(grep '^## ' "$f" | sed 's/^## //' | tail -3 | tr '\n' ',' | sed 's/,$//; s/,/, /g')
        fi
        if [[ -n "$headings" ]]; then
          k_changed_details+="- ${fname} (UPDATED): ${headings}"$'\n'
        else
          k_changed_details+="- ${fname} (UPDATED)"$'\n'
        fi
        k_changed_names+="${fname}, "
      fi
    fi
  done

  if [[ "$k_changed_count" -gt 0 ]]; then
    # Trim trailing ", " from names
    k_changed_names=$(echo "$k_changed_names" | sed 's/, $//')
    actions+=("REVIEW: ${k_changed_names} updated")
    action_details+=$'\n## Review Knowledge Changes\n'
    action_details+="Knowledge files in $DIR/knowledge/ updated. Check for cross-space patterns to promote."$'\n'
    action_details+="$k_changed_details"
  fi
fi

# --- Build final message text ---
if [[ ${#actions[@]} -eq 0 ]]; then
  action_text="State changed but no actions required."
else
  action_text=""
  for a in "${actions[@]}"; do
    action_text+="- ${a}"$'\n'
  done
  action_text+="$action_details"
fi

summary=$(IFS=', '; echo "${actions[*]}")
[[ -z "$summary" ]] && summary="state changed, no actions needed"

# --- Write message to team-lead inbox ---
# Escape the action text for JSON
json_text=$(echo -n "$action_text" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo "\"$action_text\"")

message=$(jq -n \
  --arg from "heartbeat" \
  --arg type "heartbeat" \
  --argjson text "$json_text" \
  --arg summary "$summary" \
  --arg timestamp "$timestamp" \
  --argjson untriaged "$untriaged_count" \
  --argjson needs_human "$pending_count" \
  --argjson resolved "$resolved_count" \
  --argjson knowledge "$knowledge_updated" \
  --argjson projectsReady "$projects_ready_count" \
  --argjson projectsBlocked "$projects_blocked_count" \
  --argjson projectsNeedPlanning "$projects_planning_count" \
  --argjson resolvedUnconsumed "$resolved_unconsumed_count" \
  '{
    from: $from,
    type: $type,
    text: $text,
    summary: $summary,
    metadata: {
      untriagedEscalations: $untriaged,
      needsHumanEscalations: $needs_human,
      resolvedEscalations: $resolved,
      resolvedUnconsumed: $resolvedUnconsumed,
      knowledgeUpdated: $knowledge,
      projectsReady: $projectsReady,
      projectsBlocked: $projectsBlocked,
      projectsNeedPlanning: $projectsNeedPlanning
    },
    timestamp: $timestamp,
    read: false
  }')

# Append message to inbox array (using locked_write for safe concurrent access)
locked_write "$INBOX" '. += [$msg]' --argjson msg "$message"

echo "heartbeat: message written to $INBOX"
echo "heartbeat: actions: $summary"

# --- Save new fingerprint and knowledge hashes ---
echo "$current_fingerprint" > "$FINGERPRINT_FILE"
echo -n "$new_k_hashes" > "$KNOWLEDGE_HASH_FILE"
echo "heartbeat: fingerprint saved"
log_activity true
