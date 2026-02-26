#!/bin/bash
# Switch between isolated Chrome profile and user's authenticated Chrome
# Usage: bash switch-browser-mode.sh <isolated|authenticated>

set -euo pipefail

CDP_PORT=9222
PROFILE_DIR="$HOME/.superbot2/chrome-profile"
MODE="${1:?Usage: bash switch-browser-mode.sh <isolated|authenticated>}"

# Kill whatever Chrome is currently on the CDP port
kill_cdp_chrome() {
  local pids
  pids=$(lsof -ti :$CDP_PORT 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "Killing Chrome on port $CDP_PORT (PIDs: $pids)..."
    echo "$pids" | xargs kill 2>/dev/null || true
    sleep 2
  fi
}

case "$MODE" in
  isolated)
    echo "Switching to isolated Chrome profile..."
    kill_cdp_chrome
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      --user-data-dir="$PROFILE_DIR" \
      --remote-debugging-port=$CDP_PORT \
      --no-first-run \
      --no-default-browser-check \
      "about:blank" &
    disown 2>/dev/null || true
    sleep 3
    if lsof -i :$CDP_PORT > /dev/null 2>&1; then
      echo "Isolated Chrome running on port $CDP_PORT (profile: $PROFILE_DIR)"
    else
      echo "ERROR: Failed to launch isolated Chrome"
      exit 1
    fi
    ;;

  authenticated)
    echo "Switching to user's authenticated Chrome..."
    kill_cdp_chrome
    # Launch user's main Chrome with CDP enabled (uses default profile)
    open -a "Google Chrome" --args --remote-debugging-port=$CDP_PORT
    sleep 3
    if lsof -i :$CDP_PORT > /dev/null 2>&1; then
      echo "User's Chrome running on port $CDP_PORT (with existing sessions)"
    else
      echo "ERROR: Chrome didn't start with CDP on port $CDP_PORT"
      echo "If Chrome was already running, you may need to quit it first (Cmd+Q) and re-run this script."
      exit 1
    fi
    ;;

  *)
    echo "Unknown mode: $MODE"
    echo "Usage: bash switch-browser-mode.sh <isolated|authenticated>"
    exit 1
    ;;
esac
