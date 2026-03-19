#!/bin/bash
# evaluate-checklist.sh - Evaluate a checklist against a task
#
# Loads and cascades checklists (global → space → project), filters by task
# labels, evaluates each applicable item, and outputs JSON results.
#
# Usage: evaluate-checklist.sh [options]
#   --space <space>           Space slug
#   --project <project>       Project slug
#   --labels <label1,label2>  Comma-separated task labels
#   --transcript <path>       Path to session transcript (for transcript checks)
#   --cwd <dir>               Working directory for command checks (default: pwd)
#
# Output (stdout): JSON object
#   {"passed": true/false, "results": [{"id": "...", "passed": true/false, "output": "...", "skipped": true/false}]}
#
# Exit codes:
#   0 = all required checks passed (or skipped)
#   1 = one or more required checks failed

# Note: -e (errexit) is deliberately omitted — we need to continue after
# individual check failures to collect all results before reporting.
set -uo pipefail

DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}"

# --- Parse arguments ---
SPACE=""
PROJECT=""
LABELS=""
TRANSCRIPT=""
CWD="$(pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --space) SPACE="$2"; shift 2 ;;
    --project) PROJECT="$2"; shift 2 ;;
    --labels) LABELS="$2"; shift 2 ;;
    --transcript) TRANSCRIPT="$2"; shift 2 ;;
    --cwd) CWD="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; shift ;;
  esac
done

# --- Load and cascade checklists ---
# Start with global defaults
GLOBAL_CHECKLIST="$DIR/checklists/defaults.json"
SPACE_CHECKLIST="$DIR/spaces/$SPACE/checklist.json"
PROJECT_CHECKLIST="$DIR/spaces/$SPACE/plans/$PROJECT/checklist.json"

# Build merged items array using jq
# Strategy: start with global, then overlay space items (by id), then project items
MERGED_ITEMS="[]"

if [[ -f "$GLOBAL_CHECKLIST" ]]; then
  MERGED_ITEMS=$(jq '.items // []' "$GLOBAL_CHECKLIST")
fi

if [[ -n "$SPACE" && -f "$SPACE_CHECKLIST" ]]; then
  SPACE_ITEMS=$(jq '.items // []' "$SPACE_CHECKLIST")
  SPACE_DISABLE=$(jq -r '.overrides.disable // [] | .[]' "$SPACE_CHECKLIST" 2>/dev/null)
  # Merge: space items override global items by id, new items are appended
  MERGED_ITEMS=$(echo "$MERGED_ITEMS" | jq --argjson space "$SPACE_ITEMS" '
    # For each space item, replace matching global item or append
    reduce $space[] as $si (.;
      if map(.id) | index($si.id) then
        map(if .id == $si.id then $si else . end)
      else
        . + [$si]
      end
    )
  ')
  # Apply disable overrides
  if [[ -n "$SPACE_DISABLE" ]]; then
    for disabled_id in $SPACE_DISABLE; do
      MERGED_ITEMS=$(echo "$MERGED_ITEMS" | jq --arg id "$disabled_id" 'map(select(.id != $id))')
    done
  fi
fi

if [[ -n "$PROJECT" && -n "$SPACE" && -f "$PROJECT_CHECKLIST" ]]; then
  PROJECT_ITEMS=$(jq '.items // []' "$PROJECT_CHECKLIST")
  PROJECT_DISABLE=$(jq -r '.overrides.disable // [] | .[]' "$PROJECT_CHECKLIST" 2>/dev/null)
  MERGED_ITEMS=$(echo "$MERGED_ITEMS" | jq --argjson proj "$PROJECT_ITEMS" '
    reduce $proj[] as $pi (.;
      if map(.id) | index($pi.id) then
        map(if .id == $pi.id then $pi else . end)
      else
        . + [$pi]
      end
    )
  ')
  if [[ -n "$PROJECT_DISABLE" ]]; then
    for disabled_id in $PROJECT_DISABLE; do
      MERGED_ITEMS=$(echo "$MERGED_ITEMS" | jq --arg id "$disabled_id" 'map(select(.id != $id))')
    done
  fi
fi

# --- Filter items by task labels ---
# An item applies if its appliesTo contains "*" or any of the task labels
IFS=',' read -ra LABEL_ARRAY <<< "$LABELS"

APPLICABLE_ITEMS=$(echo "$MERGED_ITEMS" | jq --arg labels "$LABELS" '
  ($labels | split(",") | map(select(. != ""))) as $task_labels |
  map(select(
    (.appliesTo // ["*"]) as $applies |
    ($applies | index("*")) or
    ($task_labels | any(. as $l | $applies | index($l)))
  ))
')

# --- Auto-detect: skip checks that aren't applicable ---
auto_detect_skip() {
  local item_id="$1"
  local command="$2"
  local cwd="$3"

  case "$item_id" in
    tests-pass)
      # Skip if no package.json or no test script
      if [[ ! -f "$cwd/package.json" ]]; then
        echo "skipped: no package.json found"
        return 0
      fi
      local has_test
      has_test=$(jq -r '.scripts.test // empty' "$cwd/package.json" 2>/dev/null)
      if [[ -z "$has_test" || "$has_test" == "echo \"Error: no test specified\" && exit 1" ]]; then
        echo "skipped: no test script in package.json"
        return 0
      fi
      ;;
    typescript-compiles)
      # Skip if no tsconfig.json
      if [[ ! -f "$cwd/tsconfig.json" ]]; then
        echo "skipped: no tsconfig.json found"
        return 0
      fi
      ;;
  esac

  return 1
}

# --- Evaluate each applicable item ---
RESULTS="[]"
ALL_PASSED=true

ITEM_COUNT=$(echo "$APPLICABLE_ITEMS" | jq 'length')

for (( i=0; i<ITEM_COUNT; i++ )); do
  ITEM=$(echo "$APPLICABLE_ITEMS" | jq ".[$i]")
  ITEM_ID=$(echo "$ITEM" | jq -r '.id')
  ITEM_CHECK=$(echo "$ITEM" | jq -r '.check')
  ITEM_REQUIRED=$(echo "$ITEM" | jq -r '.required')
  ITEM_AUTO=$(echo "$ITEM" | jq -r '.autoDetect // false')
  ITEM_COMMAND=$(echo "$ITEM" | jq -r '.command // empty')
  ITEM_PATTERN=$(echo "$ITEM" | jq -r '.pattern // empty')

  PASSED=false
  OUTPUT=""
  SKIPPED=false

  case "$ITEM_CHECK" in
    command)
      # Auto-detect: check if this command is relevant
      if [[ "$ITEM_AUTO" == "true" ]]; then
        skip_reason=$(auto_detect_skip "$ITEM_ID" "$ITEM_COMMAND" "$CWD")
        if [[ $? -eq 0 && -n "$skip_reason" ]]; then
          PASSED=true
          SKIPPED=true
          OUTPUT="$skip_reason"
        fi
      fi

      if [[ "$SKIPPED" != "true" ]]; then
        # Run the command in the working directory
        OUTPUT=$(cd "$CWD" && eval "$ITEM_COMMAND" 2>&1) && PASSED=true || PASSED=false
        # Truncate long output
        if [[ ${#OUTPUT} -gt 500 ]]; then
          OUTPUT="${OUTPUT:0:500}... (truncated)"
        fi
      fi
      ;;

    transcript)
      if [[ -n "$TRANSCRIPT" && -f "$TRANSCRIPT" ]]; then
        if grep -qE "$ITEM_PATTERN" "$TRANSCRIPT" 2>/dev/null; then
          PASSED=true
          OUTPUT="Pattern found in transcript"
        else
          PASSED=false
          OUTPUT="Pattern '$ITEM_PATTERN' not found in transcript"
        fi
      else
        # No transcript available — skip transcript checks gracefully
        PASSED=true
        SKIPPED=true
        OUTPUT="skipped: no transcript available"
      fi
      ;;

    disk)
      # Disk checks: command field used as a test expression
      if [[ -n "$ITEM_COMMAND" ]]; then
        OUTPUT=$(cd "$CWD" && eval "$ITEM_COMMAND" 2>&1) && PASSED=true || PASSED=false
      else
        PASSED=true
        SKIPPED=true
        OUTPUT="skipped: no disk check command specified"
      fi
      ;;

    *)
      PASSED=true
      SKIPPED=true
      OUTPUT="skipped: unknown check type '$ITEM_CHECK'"
      ;;
  esac

  # Track failures for required items
  if [[ "$PASSED" != "true" && "$ITEM_REQUIRED" == "true" ]]; then
    ALL_PASSED=false
  fi

  # Add result to array
  RESULTS=$(echo "$RESULTS" | jq \
    --arg id "$ITEM_ID" \
    --argjson passed "$PASSED" \
    --arg output "$OUTPUT" \
    --argjson skipped "$SKIPPED" \
    '. + [{"id": $id, "passed": $passed, "output": $output, "skipped": $skipped}]'
  )
done

# --- Output results ---
jq -n \
  --argjson passed "$ALL_PASSED" \
  --argjson results "$RESULTS" \
  '{"passed": $passed, "results": $results}'

if [[ "$ALL_PASSED" == "true" ]]; then
  exit 0
else
  exit 1
fi
