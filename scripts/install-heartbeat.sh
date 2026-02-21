#!/bin/bash
# Install superbot2 heartbeat as a macOS launchd agent
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO_DIR/scripts/heartbeat-cron.sh"
PLIST_NAME="com.superbot2.heartbeat"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
SUPERBOT2_HOME="${SUPERBOT2_HOME:-$HOME/.superbot2}"
CONFIG_FILE="$SUPERBOT2_HOME/config.json"
LOG_DIR="$SUPERBOT2_HOME/logs"

# Default interval: 30 minutes (1800 seconds)
INTERVAL=1800

# Read interval from config if available
if [[ -f "$CONFIG_FILE" ]] && command -v jq &>/dev/null; then
  configured_minutes=$(jq -r '.heartbeat.intervalMinutes // empty' "$CONFIG_FILE" 2>/dev/null || true)
  if [[ -n "$configured_minutes" ]]; then
    INTERVAL=$((configured_minutes * 60))
    echo "Using configured interval: ${configured_minutes} minutes"
  fi
fi

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Ensure heartbeat script is executable
chmod +x "$SCRIPT"

# Unload existing plist if present
if launchctl list "$PLIST_NAME" &>/dev/null; then
  echo "Unloading existing heartbeat..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

# Write plist
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_NAME</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT</string>
  </array>
  <key>StartInterval</key>
  <integer>$INTERVAL</integer>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/heartbeat.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/heartbeat.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SUPERBOT2_HOME</key>
    <string>$SUPERBOT2_HOME</string>
    <key>SUPERBOT2_NAME</key>
    <string>${SUPERBOT2_NAME:-superbot2}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
EOF

# Load plist
launchctl load "$PLIST_PATH"

echo "Heartbeat installed and loaded."
echo "  Plist: $PLIST_PATH"
echo "  Script: $SCRIPT"
echo "  Interval: $((INTERVAL / 60)) minutes"
echo "  Logs: $LOG_DIR/heartbeat.log"
