#!/bin/bash
# create-escalation.sh - Create an untriaged escalation
# Usage: create-escalation.sh <type> <space> <project> <question> [options]
#
# Types: decision, blocker, question, approval, improvement
#
# Options:
#   --context "why this matters"
#   --priority high|medium|low (default: medium)
#   --option "Label|Description" (repeatable, for decision/question types)
#   --blocks-task "path/to/task.json"
#   --blocks-project
#   --suggested-auto-rule "rule text" (REQUIRED for decision/question types)
#
# Examples:
#   create-escalation.sh decision auth add-auth \
#     "Should we use JWT or session-based auth?" \
#     --context "Need to pick auth strategy before implementation" \
#     --option "JWT|Stateless, scales well, standard for APIs" \
#     --option "Sessions|Simpler, built-in revocation, server-side state" \
#     --priority high
#
#   create-escalation.sh blocker api payments \
#     "Need Stripe API key for payment integration" \
#     --context "Cannot test payment flow without credentials" \
#     --blocks-project
#
#   create-escalation.sh question web dashboard \
#     "Should the dashboard support mobile?" \
#     --option "Yes|Responsive design, wider reach" \
#     --option "No|Desktop only, faster to build"

set -uo pipefail

TYPE="${1:-}"
SPACE="${2:-}"
PROJECT="${3:-}"
QUESTION="${4:-}"
shift 4 2>/dev/null || true

if [[ -z "$TYPE" || -z "$SPACE" || -z "$PROJECT" || -z "$QUESTION" ]]; then
  echo "Usage: create-escalation.sh <type> <space> <project> <question> [options]" >&2
  echo "Types: decision, blocker, question, approval" >&2
  exit 1
fi

# Validate type
case "$TYPE" in
  decision|blocker|question|approval|improvement|agent_plan) ;;
  *) echo "Invalid type: $TYPE. Must be: decision, blocker, question, approval, improvement, agent_plan" >&2; exit 1 ;;
esac

# Parse options
CONTEXT=""
PRIORITY="medium"
OPTIONS=()
BLOCKS_TASK="null"
BLOCKS_PROJECT="false"
SUGGESTED_AUTO_RULE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --context) CONTEXT="$2"; shift 2 ;;
    --priority) PRIORITY="$2"; shift 2 ;;
    --option) OPTIONS+=("$2"); shift 2 ;;
    --blocks-task) BLOCKS_TASK="\"$2\""; shift 2 ;;
    --blocks-project) BLOCKS_PROJECT="true"; shift ;;
    --suggested-auto-rule) SUGGESTED_AUTO_RULE="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Enforce --suggested-auto-rule for decision/question types
if [[ "$TYPE" == "decision" || "$TYPE" == "question" ]] && [[ -z "$SUGGESTED_AUTO_RULE" ]]; then
  echo "Error: --suggested-auto-rule is required for decision and question type escalations." >&2
  echo "Provide a plain English rule that could auto-resolve similar future escalations." >&2
  echo "Example: --suggested-auto-rule \"When choosing between X and Y, default to X because...\"" >&2
  exit 1
fi

# Generate ID
DESCRIPTOR=$(echo "$QUESTION" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | cut -c1-40 | sed 's/-$//')
ID="esc-${SPACE}-${PROJECT}-${DESCRIPTOR}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}/escalations/untriaged"
FILE="$DIR/$ID.json"

# Build suggested answers JSON
ANSWERS_JSON="[]"
if [[ ${#OPTIONS[@]} -gt 0 ]]; then
  ANSWERS_JSON="["
  for i in "${!OPTIONS[@]}"; do
    LABEL="${OPTIONS[$i]%%|*}"
    DESC="${OPTIONS[$i]#*|}"
    if [[ $i -gt 0 ]]; then ANSWERS_JSON+=","; fi
    ANSWERS_JSON+="$(jq -n --arg l "$LABEL" --arg d "$DESC" '{"label":$l,"description":$d}')"
  done
  ANSWERS_JSON+="]"
fi

# Build suggestedAutoRule JSON value
if [[ -n "$SUGGESTED_AUTO_RULE" ]]; then
  RULE_JSON=$(jq -n --arg r "$SUGGESTED_AUTO_RULE" '$r')
else
  RULE_JSON="null"
fi

# Write escalation JSON
jq -n \
  --arg id "$ID" \
  --arg type "$TYPE" \
  --arg space "$SPACE" \
  --arg project "$PROJECT" \
  --arg question "$QUESTION" \
  --arg context "$CONTEXT" \
  --argjson suggestedAnswers "$ANSWERS_JSON" \
  --arg priority "$PRIORITY" \
  --argjson blocksTask "$BLOCKS_TASK" \
  --argjson blocksProject "$BLOCKS_PROJECT" \
  --argjson suggestedAutoRule "$RULE_JSON" \
  --arg timestamp "$TIMESTAMP" \
  '{
    id: $id,
    type: $type,
    space: $space,
    project: $project,
    question: $question,
    context: $context,
    suggestedAnswers: $suggestedAnswers,
    suggestedAutoRule: $suggestedAutoRule,
    escalatedBy: ($space + "-worker"),
    escalationPath: [($space + "-worker")],
    priority: $priority,
    blocksTask: $blocksTask,
    blocksProject: $blocksProject,
    createdAt: $timestamp,
    status: "untriaged",
    resolution: null,
    resolvedBy: null,
    resolvedAt: null
  }' > "$FILE"

echo "Created escalation: $FILE"
