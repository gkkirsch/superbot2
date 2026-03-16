#!/bin/bash
# spawn-worker.sh — Spawn a Claude Code teammate in a custom working directory
#
# Replicates the Task tool's teammate spawning but allows setting a custom cwd,
# so workers discover .claude/skills/ from their space directory.
#
# Usage:
#   spawn-worker.sh --name "my-worker" --team "superbot2" --prompt "Do stuff"
#
# Required: --name, --team, --prompt
# Optional: --cwd (default: parent cwd), --type (default: space-worker),
#           --model (default: opus), --color (auto-assigned)
#
# Environment:
#   CLAUDE_CODE_TEAMMATE_COMMAND — override claude binary path
#   CLAUDE_CONFIG_DIR            — custom config dir (forwarded to teammate)

set -uo pipefail

source "$(dirname "$0")/lock-helper.sh"

# --- Color palette (round-robin) ---
COLORS=(red green blue yellow cyan magenta orange purple pink teal)

# --- Parse arguments ---
NAME=""
TEAM=""
PROMPT=""
CWD=""
AGENT_TYPE="space-worker"
MODEL="opus"
COLOR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)   NAME="$2";       shift 2 ;;
    --team)   TEAM="$2";       shift 2 ;;
    --prompt) PROMPT="$2";     shift 2 ;;
    --cwd)    CWD="$2";        shift 2 ;;
    --type)   AGENT_TYPE="$2"; shift 2 ;;
    --model)  MODEL="$2";      shift 2 ;;
    --color)  COLOR="$2";      shift 2 ;;
    *) echo "ERROR: Unknown option: $1" >&2; exit 1 ;;
  esac
done

# --- Validate required args ---
if [[ -z "$NAME" ]]; then
  echo "ERROR: --name is required" >&2; exit 1
fi
if [[ -z "$TEAM" ]]; then
  echo "ERROR: --team is required" >&2; exit 1
fi
if [[ -z "$PROMPT" ]]; then
  echo "ERROR: --prompt is required" >&2; exit 1
fi

# --- Default cwd to parent's cwd ---
if [[ -z "$CWD" ]]; then
  CWD="$(pwd)"
fi

# --- Check tmux is available ---
if ! command -v tmux &>/dev/null; then
  echo "ERROR: tmux is not installed" >&2; exit 1
fi

# --- Check tmux session exists ---
TMUX_SESSION=""
if [[ -n "${TMUX:-}" ]]; then
  TMUX_SESSION=$(tmux display-message -p '#{session_name}' 2>/dev/null)
fi
if [[ -z "$TMUX_SESSION" ]]; then
  # Try to find a running session
  TMUX_SESSION=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | head -1)
fi
if [[ -z "$TMUX_SESSION" ]]; then
  echo "ERROR: No tmux session found" >&2; exit 1
fi

# --- Resolve config dir ---
CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

# --- Read team config ---
TEAM_CONFIG="$CONFIG_DIR/teams/$TEAM/config.json"
if [[ ! -f "$TEAM_CONFIG" ]]; then
  echo "ERROR: Team config not found at $TEAM_CONFIG" >&2; exit 1
fi

# --- Sanitize name: replace @ with - ---
SANITIZED_NAME=$(echo "$NAME" | sed 's/@/-/g')

# --- Deduplicate name ---
# Check existing members for conflicts, append -2, -3 etc.
EXISTING_NAMES=$(jq -r '.members[].name' "$TEAM_CONFIG" 2>/dev/null)
DEDUPED_NAME="$SANITIZED_NAME"
SUFFIX=2
while echo "$EXISTING_NAMES" | grep -qx "$DEDUPED_NAME"; do
  DEDUPED_NAME="${SANITIZED_NAME}-${SUFFIX}"
  SUFFIX=$((SUFFIX + 1))
done
SANITIZED_NAME="$DEDUPED_NAME"

# --- Generate agent ID ---
AGENT_ID="${SANITIZED_NAME}@${TEAM}"

# --- Assign color ---
if [[ -z "$COLOR" ]]; then
  MEMBER_COUNT=$(jq '.members | length' "$TEAM_CONFIG" 2>/dev/null || echo "0")
  COLOR_INDEX=$((MEMBER_COUNT % ${#COLORS[@]}))
  COLOR="${COLORS[$COLOR_INDEX]}"
fi

# --- Get leader session ID ---
LEADER_SESSION_ID=$(jq -r '.leadSessionId // empty' "$TEAM_CONFIG")
if [[ -z "$LEADER_SESSION_ID" ]]; then
  echo "ERROR: No leadSessionId in team config" >&2; exit 1
fi

# --- Resolve claude binary path ---
if [[ -n "${CLAUDE_CODE_TEAMMATE_COMMAND:-}" ]]; then
  CLAUDE_BIN="$CLAUDE_CODE_TEAMMATE_COMMAND"
elif [[ -x "$HOME/.local/bin/claude" ]]; then
  CLAUDE_BIN="$HOME/.local/bin/claude"
else
  CLAUDE_BIN=$(command -v claude 2>/dev/null)
fi

if [[ -z "$CLAUDE_BIN" || ! -x "$CLAUDE_BIN" ]]; then
  echo "ERROR: Cannot find claude binary" >&2; exit 1
fi

# --- Timestamp ---
JOINED_AT=$(date +%s)000
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# --- Step 1: Write member to team config (BEFORE creating pane) ---
MEMBER_JSON=$(jq -n \
  --arg agentId "$AGENT_ID" \
  --arg name "$SANITIZED_NAME" \
  --arg agentType "$AGENT_TYPE" \
  --arg model "$MODEL" \
  --arg prompt "$PROMPT" \
  --arg color "$COLOR" \
  --argjson joinedAt "$JOINED_AT" \
  --arg cwd "$CWD" \
  '{
    agentId: $agentId,
    name: $name,
    agentType: $agentType,
    model: $model,
    prompt: $prompt,
    color: $color,
    planModeRequired: false,
    joinedAt: $joinedAt,
    tmuxPaneId: "pending",
    cwd: $cwd,
    subscriptions: [],
    backendType: "tmux"
  }')

locked_write "$TEAM_CONFIG" '.members += [$member]' \
  --argjson member "$MEMBER_JSON"

if [[ $? -ne 0 ]]; then
  echo "ERROR: Failed to write team config" >&2; exit 1
fi

# --- Step 2: Write initial prompt to inbox ---
INBOX_DIR="$CONFIG_DIR/teams/$TEAM/inboxes"
mkdir -p "$INBOX_DIR"
INBOX_FILE="$INBOX_DIR/${SANITIZED_NAME}.json"

# Get leader color (if available)
LEADER_COLOR=$(jq -r '.members[] | select(.name == "team-lead") | .color // "blue"' "$TEAM_CONFIG" 2>/dev/null)
if [[ -z "$LEADER_COLOR" ]]; then
  LEADER_COLOR="blue"
fi

INBOX_MSG=$(jq -n \
  --arg text "$PROMPT" \
  --arg timestamp "$TIMESTAMP" \
  --arg color "$LEADER_COLOR" \
  '{
    from: "team-lead",
    text: $text,
    timestamp: $timestamp,
    color: $color
  }')

# Create or append to inbox
if [[ -f "$INBOX_FILE" ]]; then
  locked_write "$INBOX_FILE" '. + [$msg]' \
    --argjson msg "$INBOX_MSG"
else
  echo "[$INBOX_MSG]" > "${INBOX_FILE}.tmp.$$"
  mv "${INBOX_FILE}.tmp.$$" "$INBOX_FILE"
fi

# --- Step 3: Create tmux pane ---
# Get existing panes to determine split direction
PANE_LIST=$(tmux list-panes -t "$TMUX_SESSION" -F '#{pane_id}' 2>/dev/null)
PANE_COUNT=$(echo "$PANE_LIST" | wc -l | tr -d ' ')

# Alternating vertical/horizontal splits
if (( PANE_COUNT % 2 == 1 )); then
  SPLIT_DIR="-v"
else
  SPLIT_DIR="-h"
fi

# Target pane for split
TARGET_PANE=$(echo "$PANE_LIST" | sed -n "$(( (PANE_COUNT - 1) / 2 + 1 ))p")
if [[ -z "$TARGET_PANE" ]]; then
  TARGET_PANE=$(echo "$PANE_LIST" | tail -1)
fi

PANE_ID=$(tmux split-window -t "$TARGET_PANE" $SPLIT_DIR -P -F '#{pane_id}' 2>/dev/null)
if [[ -z "$PANE_ID" ]]; then
  echo "ERROR: Failed to create tmux pane" >&2
  # Rollback: remove member from config
  locked_write "$TEAM_CONFIG" '.members = [.members[] | select(.agentId == $agentId | not)]' \
    --arg agentId "$AGENT_ID"
  exit 1
fi

# Set pane border style and title
tmux set-option -p -t "$PANE_ID" pane-border-style "fg=$COLOR" 2>/dev/null
tmux set-option -p -t "$PANE_ID" pane-border-format " #{pane_title} " 2>/dev/null
tmux select-pane -t "$PANE_ID" -T "$SANITIZED_NAME" 2>/dev/null

# Rebalance with tiled layout
tmux select-layout -t "$TMUX_SESSION" tiled 2>/dev/null

# --- Step 4: Update team config with actual pane ID ---
locked_write "$TEAM_CONFIG" \
  '.members = [.members[] | if .agentId == $agentId then .tmuxPaneId = $paneId else . end]' \
  --arg agentId "$AGENT_ID" \
  --arg paneId "$PANE_ID"

# --- Step 5: Build and send command ---

# Build env vars
ENV_VARS="CLAUDECODE=1 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1"

# Conditionally forward env vars from parent
for VAR in CLAUDE_CONFIG_DIR CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX CLAUDE_CODE_USE_FOUNDRY ANTHROPIC_BASE_URL; do
  VAL="${!VAR:-}"
  if [[ -n "$VAL" ]]; then
    ENV_VARS="$ENV_VARS $VAR=$(printf '%q' "$VAL")"
  fi
done

# Shell-escape paths for the tmux command
ESC_CWD=$(printf '%q' "$CWD")
ESC_CLAUDE=$(printf '%q' "$CLAUDE_BIN")

# Build the full command
CMD="cd ${ESC_CWD} && env ${ENV_VARS} ${ESC_CLAUDE}"
CMD="$CMD --agent-id $(printf '%q' "$AGENT_ID")"
CMD="$CMD --agent-name $(printf '%q' "$SANITIZED_NAME")"
CMD="$CMD --team-name $(printf '%q' "$TEAM")"
CMD="$CMD --agent-color $(printf '%q' "$COLOR")"
CMD="$CMD --parent-session-id $(printf '%q' "$LEADER_SESSION_ID")"
CMD="$CMD --agent-type $(printf '%q' "$AGENT_TYPE")"
CMD="$CMD --dangerously-skip-permissions"
CMD="$CMD --model $(printf '%q' "$MODEL")"

# Send command to pane
tmux send-keys -t "$PANE_ID" "$CMD" Enter

# --- Output ---
echo "paneId=$PANE_ID"
echo "agentId=$AGENT_ID"
echo "name=$SANITIZED_NAME"
echo "color=$COLOR"
