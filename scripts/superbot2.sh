#!/bin/bash
# superbot2 - Launch the orchestrator with restart support
set -euo pipefail
shopt -s nullglob

# Enable agent teams
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

DIR="$HOME/.superbot2"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$DIR/templates/orchestrator-system-prompt-override.md"
RESTART_FLAG="$DIR/.restart"
LAUNCHER_PID=$$
LAUNCHER_PID_FILE="$DIR/.launcher.pid"
echo "$LAUNCHER_PID" > "$LAUNCHER_PID_FILE"
DASHBOARD_PID=""

# Check for required files
if [[ ! -d "$DIR" ]]; then
  echo "Error: ~/.superbot2 directory not found. Run setup first."
  exit 1
fi

# Assemble the system prompt from template + user context
assemble_prompt() {
  local prompt
  prompt=$(cat "$TEMPLATE")

  # Substitute identity
  if [[ -f "$DIR/IDENTITY.md" ]]; then
    local identity
    identity=$(cat "$DIR/IDENTITY.md")
    prompt="${prompt//\{\{IDENTITY\}\}/$identity}"
  else
    prompt="${prompt//\{\{IDENTITY\}\}/No identity configured yet.}"
  fi

  # Substitute user profile
  if [[ -f "$DIR/USER.md" ]]; then
    local user
    user=$(cat "$DIR/USER.md")
    prompt="${prompt//\{\{USER\}\}/$user}"
  else
    prompt="${prompt//\{\{USER\}\}/No user profile configured yet.}"
  fi

  # Substitute memory
  if [[ -f "$DIR/MEMORY.md" ]]; then
    local memory
    memory=$(cat "$DIR/MEMORY.md")
    prompt="${prompt//\{\{MEMORY\}\}/$memory}"
  else
    prompt="${prompt//\{\{MEMORY\}\}/No memory yet.}"
  fi

  # --- Pre-load context ---

  # Orchestrator guide
  if [[ -f "$DIR/ORCHESTRATOR_GUIDE.md" ]]; then
    prompt+=$'\n\n## Orchestrator Guide\n\n'
    prompt+=$(cat "$DIR/ORCHESTRATOR_GUIDE.md")
  fi

  # Knowledge files
  local kfiles=("$DIR"/knowledge/*)
  if [[ ${#kfiles[@]} -gt 0 ]]; then
    prompt+=$'\n\n## Knowledge\n'
    for f in "${kfiles[@]}"; do
      [[ -f "$f" ]] || continue
      prompt+=$'\n### '"$(basename "$f")"$'\n\n'
      prompt+=$(cat "$f")
    done
  fi

  # Space configs
  local sfiles=("$DIR"/spaces/*/space.json)
  if [[ ${#sfiles[@]} -gt 0 ]]; then
    prompt+=$'\n\n## Spaces\n'
    for f in "${sfiles[@]}"; do
      [[ -f "$f" ]] || continue
      local slug
      slug=$(basename "$(dirname "$f")")
      prompt+=$'\n### '"$slug"$'\n\n```json\n'
      prompt+=$(cat "$f")
      prompt+=$'\n```\n'
    done
  fi

  # Pending escalations
  local pfiles=("$DIR"/escalations/pending/*.json)
  if [[ ${#pfiles[@]} -gt 0 ]]; then
    prompt+=$'\n\n## Pending Escalations\n'
    for f in "${pfiles[@]}"; do
      [[ -f "$f" ]] || continue
      prompt+=$'\n### '"$(basename "$f")"$'\n\n```json\n'
      prompt+=$(cat "$f")
      prompt+=$'\n```\n'
    done
  fi

  # Draft escalations
  local dfiles=("$DIR"/escalations/draft/*.json)
  if [[ ${#dfiles[@]} -gt 0 ]]; then
    prompt+=$'\n\n## Draft Escalations\n'
    for f in "${dfiles[@]}"; do
      [[ -f "$f" ]] || continue
      prompt+=$'\n### '"$(basename "$f")"$'\n\n```json\n'
      prompt+=$(cat "$f")
      prompt+=$'\n```\n'
    done
  fi

  echo "$prompt"
}

# --- Session ID: always generate fresh on startup ---
TEAM_DIR="$HOME/.claude/teams/superbot2"
SESSION_FILE="$DIR/.orchestrator-session"
SESSION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
echo "$SESSION_ID" > "$SESSION_FILE"
echo "Generated session ID: $SESSION_ID"

# Update team config with current session ID
if [[ -f "$TEAM_DIR/config.json" ]] && command -v jq &>/dev/null; then
  jq --arg sid "$SESSION_ID" '.leadSessionId = $sid' \
    "$TEAM_DIR/config.json" > "$TEAM_DIR/config.json.tmp" \
    && mv "$TEAM_DIR/config.json.tmp" "$TEAM_DIR/config.json"
fi

# --- Main loop with restart support ---
rm -f "$RESTART_FLAG"
IS_RESTART=false

# Ensure heartbeat is running
if ! launchctl list com.superbot2.heartbeat &>/dev/null; then
  echo "Installing heartbeat..."
  bash "$SCRIPT_DIR/install-heartbeat.sh"
fi

# Ensure scheduler is running
if ! launchctl list com.superbot2.scheduler &>/dev/null; then
  echo "Installing scheduler..."
  bash "$SCRIPT_DIR/install-scheduler.sh"
fi

# --- Start dashboard server ---
start_dashboard() {
  # Kill any existing dashboard on port 3274
  lsof -ti:3274 | xargs kill 2>/dev/null || true

  echo "Starting dashboard server on http://localhost:3274 ..."
  node "$REPO_DIR/dashboard/server.js" &
  DASHBOARD_PID=$!
  echo "Dashboard server started (PID $DASHBOARD_PID)"
}

stop_dashboard() {
  if [[ -n "$DASHBOARD_PID" ]]; then
    kill "$DASHBOARD_PID" 2>/dev/null
    wait "$DASHBOARD_PID" 2>/dev/null || true
    echo "Dashboard server stopped."
    DASHBOARD_PID=""
  fi
}

# Clean up dashboard on exit
trap 'stop_dashboard; rm -f "$LAUNCHER_PID_FILE"' EXIT

start_dashboard

# Start iMessage watcher (self-exits if not configured)
bash "$SCRIPT_DIR/imessage-watcher.sh" &

echo "Starting superbot2 orchestrator..."

while true; do
  # Assemble fresh context each iteration
  PROMPT=$(assemble_prompt)

  # Start watchdog: monitors for restart flag, kills claude when found
  (
    while true; do
      sleep 1
      if [[ -f "$RESTART_FLAG" ]]; then
        # Kill only the claude child process (NOT the launcher bash — that must stay alive to restart)
        pkill -TERM -P "$LAUNCHER_PID" 2>/dev/null || true
        # Wait 3 seconds then SIGKILL if still alive
        sleep 3
        pkill -KILL -P "$LAUNCHER_PID" 2>/dev/null || true
        exit 0
      fi
    done
  ) &
  WATCHDOG_PID=$!

  # Build claude args with team registration
  CLAUDE_ARGS=(
    --system-prompt "$PROMPT"
    --session-id "$SESSION_ID"
    --team-name superbot2
    --agent-name team-lead
    --agent-id team-lead@superbot2
    --mcp-config "$DIR/mcp-config.json"
    --strict-mcp-config
    --dangerously-skip-permissions
    --no-chrome
  )

  if [[ "$IS_RESTART" == true ]]; then
    CLAUDE_ARGS+=(--resume "$SESSION_ID")
    INITIAL_MSG="Session restarted with fresh context. Begin your cycle."
  else
    INITIAL_MSG="Begin your cycle."
  fi

  # Trigger heartbeat to seed inbox — Claude Code delivers it automatically
  bash "$SCRIPT_DIR/heartbeat-cron.sh" &

  # || true: bypass set -e so bash continues to the restart check even when claude
  # exits with a non-zero code (e.g. 143 from SIGTERM). Without this, set -e would
  # kill the bash script before the restart loop runs.
  claude "${CLAUDE_ARGS[@]}" "$INITIAL_MSG" || true

  # Claude exited — clean up watchdog
  kill $WATCHDOG_PID 2>/dev/null
  wait $WATCHDOG_PID 2>/dev/null

  # Check if this was a restart request
  if [[ -f "$RESTART_FLAG" ]]; then
    rm -f "$RESTART_FLAG"
    IS_RESTART=true

    echo ""
    echo "Superbot2 restarting — resuming session $SESSION_ID"
    echo ""
    continue
  fi

  # Normal exit
  break
done

echo "Superbot2 orchestrator stopped."
