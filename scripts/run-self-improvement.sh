#!/bin/bash
# run-self-improvement.sh - Self-improvement analysis pipeline
# Orchestrates: metrics extraction → Claude analysis → escalation creation → snapshot
#
# Usage: run-self-improvement.sh [--days N] [--dry-run]
#
# Options:
#   --days N      Number of days to analyze (default: 30)
#   --dry-run     Run extraction and analysis but don't create escalations

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPERBOT_DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}"
HISTORY_DIR="$SUPERBOT_DIR/analysis-history"
ESCALATION_DIR="$SUPERBOT_DIR/escalations/untriaged"
PROMPT_TEMPLATE="$SCRIPT_DIR/improvement-prompt.md"
EXTRACT_SCRIPT="$SCRIPT_DIR/extract-metrics.mjs"

DAYS=30
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --days) DAYS="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Ensure directories exist
mkdir -p "$HISTORY_DIR" "$ESCALATION_DIR"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
METRICS_FILE=$(mktemp)
RESPONSE_FILE=$(mktemp)
trap 'rm -f "$METRICS_FILE" "$RESPONSE_FILE"' EXIT

echo "[$TIMESTAMP] Starting self-improvement analysis (last $DAYS days)..." >&2

# ── Step 1: Extract metrics ──
echo "  Step 1: Extracting metrics from conversation logs..." >&2
if ! node "$EXTRACT_SCRIPT" --days "$DAYS" --output "$METRICS_FILE" 2>&1; then
  echo "ERROR: Metrics extraction failed" >&2
  exit 1
fi

METRICS_SIZE=$(wc -c < "$METRICS_FILE" | tr -d ' ')
echo "  Metrics extracted: ${METRICS_SIZE} bytes" >&2

# ── Step 2: Build prompt ──
echo "  Step 2: Building analysis prompt..." >&2
METRICS_JSON=$(cat "$METRICS_FILE")
PROMPT=$(cat "$PROMPT_TEMPLATE")
PROMPT="${PROMPT//\{\{METRICS\}\}/$METRICS_JSON}"
PROMPT="${PROMPT//\{\{DAYS\}\}/$DAYS}"

# ── Step 3: Send to Claude for analysis ──
echo "  Step 3: Sending metrics to Claude for analysis..." >&2
if ! echo "$PROMPT" | claude -p \
  --model sonnet \
  --no-session-persistence \
  --output-format text \
  --allowedTools "" \
  > "$RESPONSE_FILE" 2>/dev/null; then
  echo "ERROR: Claude analysis failed" >&2
  exit 1
fi

echo "  Claude response received ($(wc -c < "$RESPONSE_FILE" | tr -d ' ') bytes)" >&2

# ── Step 4: Parse suggestions ──
echo "  Step 4: Parsing improvement suggestions..." >&2

# Extract JSON array from response (Claude might wrap it in markdown code blocks)
SUGGESTIONS_JSON=$(sed -n '/^\[/,/^\]/p' "$RESPONSE_FILE")
if [[ -z "$SUGGESTIONS_JSON" ]]; then
  # Try extracting from code block
  SUGGESTIONS_JSON=$(sed -n '/```json/,/```/{/```/d;p}' "$RESPONSE_FILE")
fi
if [[ -z "$SUGGESTIONS_JSON" ]]; then
  # Try the whole response as JSON
  SUGGESTIONS_JSON=$(cat "$RESPONSE_FILE")
fi

# Validate JSON
if ! echo "$SUGGESTIONS_JSON" | jq empty 2>/dev/null; then
  echo "ERROR: Could not parse suggestions as JSON" >&2
  echo "Raw response:" >&2
  head -20 "$RESPONSE_FILE" >&2
  exit 1
fi

SUGGESTION_COUNT=$(echo "$SUGGESTIONS_JSON" | jq 'length')
echo "  Found $SUGGESTION_COUNT improvement suggestions" >&2

# ── Step 5: Create escalations (unless dry-run) ──
CREATED=0
SKIPPED=0

if [[ "$DRY_RUN" == "true" ]]; then
  echo "  DRY RUN: Skipping escalation creation" >&2
  echo "$SUGGESTIONS_JSON" | jq -r '.[] | "  [\(.priority)] \(.category): \(.title)"'
else
  echo "  Step 5: Creating improvement escalations..." >&2

  for i in $(seq 0 $((SUGGESTION_COUNT - 1))); do
    SUGGESTION=$(echo "$SUGGESTIONS_JSON" | jq ".[$i]")
    TITLE=$(echo "$SUGGESTION" | jq -r '.title')
    DESCRIPTION=$(echo "$SUGGESTION" | jq -r '.description')
    RATIONALE=$(echo "$SUGGESTION" | jq -r '.rationale')
    PRIORITY=$(echo "$SUGGESTION" | jq -r '.priority')
    CATEGORY=$(echo "$SUGGESTION" | jq -r '.category')
    ACTION=$(echo "$SUGGESTION" | jq -r '.suggested_action')

    # Generate escalation ID to check for duplicates
    DESCRIPTOR=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | cut -c1-40 | sed 's/-$//')
    ESC_ID="esc-meta-self-improvement-${DESCRIPTOR}"

    # Check for duplicates across all escalation directories
    if [[ -f "$ESCALATION_DIR/$ESC_ID.json" ]] || \
       [[ -f "$SUPERBOT_DIR/escalations/needs_human/$ESC_ID.json" ]] || \
       [[ -f "$SUPERBOT_DIR/escalations/resolved/$ESC_ID.json" ]]; then
      SKIPPED=$((SKIPPED + 1))
      echo "    SKIP (exists): $TITLE" >&2
      continue
    fi

    CONTEXT="[$CATEGORY] $RATIONALE"
    OPTION_1="Implement|$ACTION"
    OPTION_2="Defer|Not a priority right now"
    OPTION_3="Reject|This suggestion doesn't apply"

    bash "$SCRIPT_DIR/create-escalation.sh" improvement meta self-improvement \
      "$TITLE" \
      --context "$CONTEXT" \
      --option "$OPTION_1" \
      --option "$OPTION_2" \
      --option "$OPTION_3" \
      --priority "$PRIORITY" 2>&1 | sed 's/^/    /' >&2

    CREATED=$((CREATED + 1))
  done

  echo "  Created $CREATED escalations, skipped $SKIPPED duplicates" >&2
fi

# ── Step 6: Save snapshot ──
echo "  Step 6: Saving analysis snapshot..." >&2

SNAPSHOT_FILE="$HISTORY_DIR/$TIMESTAMP.json"

# Build stats
STATS=$(echo "$SUGGESTIONS_JSON" | jq '{
  total: length,
  byCategory: (group_by(.category) | map({key: .[0].category, value: length}) | from_entries),
  byPriority: (group_by(.priority) | map({key: .[0].priority, value: length}) | from_entries)
}')

jq -n \
  --arg timestamp "$TIMESTAMP" \
  --arg days "$DAYS" \
  --argjson metrics "$(cat "$METRICS_FILE")" \
  --argjson suggestions "$SUGGESTIONS_JSON" \
  --argjson stats "$STATS" \
  --arg created "$CREATED" \
  --arg skipped "$SKIPPED" \
  '{
    timestamp: $timestamp,
    daysAnalyzed: ($days | tonumber),
    metrics: $metrics,
    suggestions: $suggestions,
    stats: ($stats + { escalationsCreated: ($created | tonumber), duplicatesSkipped: ($skipped | tonumber) })
  }' > "$SNAPSHOT_FILE"

echo "  Snapshot saved: $SNAPSHOT_FILE" >&2
echo "" >&2
echo "Self-improvement analysis complete." >&2
echo "  Suggestions: $SUGGESTION_COUNT" >&2
echo "  Escalations created: $CREATED" >&2
echo "  Duplicates skipped: $SKIPPED" >&2
echo "  Snapshot: $SNAPSHOT_FILE" >&2
