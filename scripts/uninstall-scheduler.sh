#!/bin/bash
# Uninstall superbot2 scheduler launchd agent
set -euo pipefail

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
