#!/bin/bash
# Uninstall superbot2 heartbeat (macOS: launchd, Linux: cron)
set -euo pipefail

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS: unload launchd
  PLIST_NAME="com.superbot2.heartbeat"
  PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

  if [[ ! -f "$PLIST_PATH" ]]; then
    echo "Heartbeat plist not found at $PLIST_PATH — nothing to uninstall."
    exit 0
  fi

  echo "Unloading heartbeat..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true

  echo "Removing plist..."
  rm "$PLIST_PATH"

  echo "Heartbeat uninstalled."

else
  # Linux: remove cron job
  CRON_TAG="superbot2-heartbeat"

  # Check if cron job exists
  if ! crontab -l 2>/dev/null | grep -q "$CRON_TAG"; then
    echo "Heartbeat cron job not found — nothing to uninstall."
    exit 0
  fi

  echo "Removing heartbeat cron job..."
  crontab -l 2>/dev/null | grep -v "$CRON_TAG" | crontab - 2>/dev/null || true

  echo "Heartbeat uninstalled."
fi
