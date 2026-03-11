#!/bin/bash
# Uninstall superbot2 scheduler (macOS: launchd, Linux: nohup)
set -euo pipefail

SUPERBOT2_HOME="${SUPERBOT2_HOME:-$HOME/.superbot2}"

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS: unload launchd
  PLIST_NAME="com.superbot2.scheduler"
  PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

  if [[ ! -f "$PLIST_PATH" ]]; then
    echo "Scheduler plist not found at $PLIST_PATH — nothing to uninstall."
    exit 0
  fi

  echo "Unloading scheduler..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true

  echo "Removing plist..."
  rm "$PLIST_PATH"

  echo "Scheduler uninstalled."

else
  # Linux: kill nohup process
  PID_FILE="$SUPERBOT2_HOME/.scheduler.pid"

  if [[ ! -f "$PID_FILE" ]]; then
    echo "Scheduler PID file not found at $PID_FILE — nothing to uninstall."
    exit 0
  fi

  OLD_PID=$(cat "$PID_FILE" 2>/dev/null)

  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Stopping scheduler (PID $OLD_PID)..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1

    # Force kill if still running
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "Force killing scheduler..."
      kill -9 "$OLD_PID" 2>/dev/null || true
    fi
  fi

  echo "Removing PID file..."
  rm -f "$PID_FILE"

  echo "Scheduler uninstalled."
fi
