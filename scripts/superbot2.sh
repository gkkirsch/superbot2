#!/bin/bash
# superbot2 - Launch the orchestrator with restart support
set -euo pipefail
shopt -s nullglob

# Enable agent teams
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# Trigger context compaction at 50% instead of 95% to reduce context overflow crashes
export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50

DIR="$HOME/.superbot2"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$DIR/templates/orchestrator-system-prompt-override.md"
RESTART_FLAG="$DIR/.restart"
DASHBOARD_PID=""

# Singleton guard — kill any existing superbot2 orchestrator before starting
PID_FILE="$DIR/.pids/superbot2.pid"
mkdir -p "$(dirname "$PID_FILE")"
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null)
  if [[ "$OLD_PID" =~ ^[0-9]+$ ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Killing existing superbot2 orchestrator (PID $OLD_PID)"
    kill "$OLD_PID"
    sleep 1
    # Force kill if still alive
    if kill -0 "$OLD_PID" 2>/dev/null; then
      kill -9 "$OLD_PID" 2>/dev/null || true
      sleep 1
    fi
  fi
  rm -f "$PID_FILE"
fi
echo $$ > "$PID_FILE.$$"
mv "$PID_FILE.$$" "$PID_FILE"

LAUNCHER_PID=$$
LAUNCHER_PID_FILE="$DIR/.launcher.pid"
echo "$LAUNCHER_PID" > "$LAUNCHER_PID_FILE"

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

# --- Session ID: reuse on restart, generate fresh on first start ---
TEAM_DIR="$HOME/.claude/teams/superbot2"
SESSION_FILE="$DIR/.orchestrator-session"

if [[ -f "$SESSION_FILE" ]]; then
  # Reuse existing session — enables --resume to preserve conversation context
  SESSION_ID=$(cat "$SESSION_FILE")
  IS_RESTART=true
  echo "Resuming session ID: $SESSION_ID"
else
  # First-ever start — generate fresh UUID
  SESSION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  echo "$SESSION_ID" > "$SESSION_FILE"
  IS_RESTART=false
  echo "Generated session ID: $SESSION_ID"
fi

# Update team config with current session ID and clean stale members
if [[ -f "$TEAM_DIR/config.json" ]] && command -v jq &>/dev/null; then
  jq --arg sid "$SESSION_ID" '
    .leadSessionId = $sid |
    .members = [.members[] | select(.name == "team-lead" or .name == "heartbeat")]
  ' "$TEAM_DIR/config.json" > "$TEAM_DIR/config.json.tmp" \
    && mv "$TEAM_DIR/config.json.tmp" "$TEAM_DIR/config.json"

  # Verify config update succeeded
  UPDATED_SID=$(jq -r '.leadSessionId' "$TEAM_DIR/config.json" 2>/dev/null)
  if [[ "$UPDATED_SID" != "$SESSION_ID" ]]; then
    echo "ERROR: Failed to update leadSessionId in config.json (expected $SESSION_ID, got $UPDATED_SID)"
    exit 1
  fi
fi

# --- Restart tracking ---
RESTART_LOG="$DIR/logs/restart.log"
mkdir -p "$(dirname "$RESTART_LOG")"
RESTART_COUNT=0
BACKOFF_SECS=1
MAX_BACKOFF=60
MAX_FAST_CRASHES=5
CRASH_WINDOW=300  # 5 minutes in seconds
STOP_FLAG="$DIR/.stop"

log_restart() {
  local reason="$1"
  local exit_code="$2"
  echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') exit_code=$exit_code restart_count=$RESTART_COUNT reason=$reason" >> "$RESTART_LOG"
}

# --- Main loop with restart support ---
rm -f "$RESTART_FLAG"
rm -f "$STOP_FLAG"

# Detect OS
detect_os() {
  case "$(uname -s)" in
    Darwin)  echo "macos" ;;
    Linux)   echo "linux" ;;
    *)       echo "unknown" ;;
  esac
}

OS_TYPE=$(detect_os)

# Ensure heartbeat is running
install_heartbeat() {
  echo "Installing heartbeat..."
  bash "$SCRIPT_DIR/install-heartbeat.sh"
}

if [[ "$OS_TYPE" == "macos" ]]; then
  if ! launchctl list com.superbot2.heartbeat &>/dev/null; then
    install_heartbeat
  fi
elif [[ "$OS_TYPE" == "linux" ]]; then
  # For Linux, check if cron job exists
  if ! crontab -l 2>/dev/null | grep -q "superbot2-heartbeat"; then
    install_heartbeat
  fi
fi

# Ensure scheduler is running
install_scheduler() {
  echo "Installing scheduler..."
  bash "$SCRIPT_DIR/install-scheduler.sh"
}

if [[ "$OS_TYPE" == "macos" ]]; then
  if ! launchctl list com.superbot2.scheduler &>/dev/null; then
    install_scheduler
  fi
elif [[ "$OS_TYPE" == "linux" ]]; then
  # For Linux, check if scheduler process is running
  SCHED_PID_FILE="$DIR/.scheduler.pid"
  if [[ ! -f "$SCHED_PID_FILE" ]] || ! kill -0 "$(cat "$SCHED_PID_FILE" 2>/dev/null)" 2>/dev/null; then
    install_scheduler
  fi
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
trap 'stop_dashboard; rm -f "$LAUNCHER_PID_FILE"; rm -f "$PID_FILE"' EXIT

start_dashboard

# Open dashboard in browser (after a short delay to let server start)
open_browser() {
  if [[ "$OS_TYPE" == "macos" ]]; then
    open "http://localhost:3274"
  elif [[ "$OS_TYPE" == "linux" ]]; then
    if command -v xdg-open &>/dev/null; then
      xdg-open "http://localhost:3274" 2>/dev/null &
    elif command -v gnome-open &>/dev/null; then
      gnome-open "http://localhost:3274" 2>/dev/null &
    else
      echo "Dashboard running at http://localhost:3274"
    fi
  fi
}
sleep 1 && open_browser &

# Start iMessage watcher (self-exits if not configured, has its own singleton guard)
# Only on macOS
if [[ "$OS_TYPE" == "macos" ]]; then
  bash "$SCRIPT_DIR/imessage-watcher.sh" &
fi

echo "Starting superbot2 orchestrator..."

while true; do
  # Assemble fresh context each iteration
  PROMPT=$(assemble_prompt)

  # Start watchdog: monitors for restart/stop flags, kills claude when found
  (
    while true; do
      sleep 1
      if [[ -f "$RESTART_FLAG" ]] || [[ -f "$STOP_FLAG" ]]; then
        # Kill only the claude child process (NOT the launcher bash — that must stay alive)
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
    --team-name superbot2
    --agent-name team-lead
    --agent-id team-lead@superbot2
    --mcp-config "$DIR/mcp-config.json"
    --strict-mcp-config
    --dangerously-skip-permissions
    --no-chrome
  )

  # On restart, use --resume (which identifies the session by itself).
  # Do NOT combine --session-id with --resume (Claude Code rejects this
  # unless --fork-session is also specified).
  if [[ "$IS_RESTART" == true ]]; then
    CLAUDE_ARGS+=(--resume "$SESSION_ID")
    INITIAL_MSG="Session restarted with fresh context. Begin your cycle."
  else
    CLAUDE_ARGS+=(--session-id "$SESSION_ID")
    INITIAL_MSG="Begin your cycle."
  fi

  # Trigger heartbeat to seed inbox — Claude Code delivers it automatically
  bash "$SCRIPT_DIR/heartbeat-cron.sh" &

  # Capture exit code without letting set -e kill the launcher.
  # "|| true" would swallow $?, so we use "cmd && ... || ..." instead.
  RUN_START=$(date +%s)
  ENABLE_CLAUDEAI_MCP_SERVERS=false claude "${CLAUDE_ARGS[@]}" "$INITIAL_MSG" && CLAUDE_EXIT=0 || CLAUDE_EXIT=$?
  RUN_DURATION=$(( $(date +%s) - RUN_START ))

  # Claude exited — clean up watchdog
  kill $WATCHDOG_PID 2>/dev/null
  wait $WATCHDOG_PID 2>/dev/null

  # Check for explicit stop request
  if [[ -f "$STOP_FLAG" ]]; then
    rm -f "$STOP_FLAG"
    log_restart "stop_flag" "$CLAUDE_EXIT"
    echo "Superbot2 stopped by .stop flag."
    break
  fi

  # Determine restart reason
  if [[ -f "$RESTART_FLAG" ]]; then
    rm -f "$RESTART_FLAG"
    RESTART_COUNT=0
    BACKOFF_SECS=1
    IS_RESTART=true
    log_restart "restart_flag" "$CLAUDE_EXIT"
    echo ""
    echo "Superbot2 restarting (manual) — resuming session $SESSION_ID"
    echo ""
    continue
  fi

  # Unexpected exit — auto-restart with backoff
  RESTART_COUNT=$((RESTART_COUNT + 1))
  IS_RESTART=true

  # Reset backoff if the run lasted longer than the crash window (healthy run)
  if [[ $RUN_DURATION -ge $CRASH_WINDOW ]]; then
    RESTART_COUNT=1
    BACKOFF_SECS=1
  fi

  # Crash loop protection: if too many fast crashes, stop
  if [[ $RESTART_COUNT -ge $MAX_FAST_CRASHES ]]; then
    log_restart "crash_loop_halt" "$CLAUDE_EXIT"
    echo ""
    echo "ERROR: $RESTART_COUNT consecutive crashes within ${CRASH_WINDOW}s. Stopping to prevent crash loop."
    echo "Check $RESTART_LOG for details. Remove $STOP_FLAG and restart manually."
    echo ""
    break
  fi

  log_restart "unexpected_exit" "$CLAUDE_EXIT"
  echo ""
  echo "Superbot2 crashed (exit=$CLAUDE_EXIT, run=${RUN_DURATION}s). Restart $RESTART_COUNT/$MAX_FAST_CRASHES in ${BACKOFF_SECS}s..."
  echo ""
  sleep "$BACKOFF_SECS"

  # Exponential backoff: 1, 2, 4, 8, 16, 32, 60(max)
  BACKOFF_SECS=$((BACKOFF_SECS * 2))
  if [[ $BACKOFF_SECS -gt $MAX_BACKOFF ]]; then
    BACKOFF_SECS=$MAX_BACKOFF
  fi
done

echo "Superbot2 orchestrator stopped."
