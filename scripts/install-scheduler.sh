#!/bin/bash
# Install superbot2 scheduler as a macOS launchd agent
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO_DIR/scripts/scheduler.sh"
PLIST_NAME="com.superbot2.scheduler"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
SUPERBOT2_HOME="${SUPERBOT2_HOME:-$HOME/.superbot2}"
LOG_DIR="$SUPERBOT2_HOME/logs"

# Resolve node's real binary path and save it for LaunchAgent scripts.
# LaunchAgents run in a minimal environment without the user's shell profile,
# so we capture the real node location now while we have access to it.
# Handles: Homebrew (ARM + Intel), asdf, nvm, volta, fnm, system installs.
REAL_NODE=""
if command -v asdf &>/dev/null; then
  REAL_NODE=$(asdf which node 2>/dev/null)
elif command -v volta &>/dev/null; then
  REAL_NODE=$(volta which node 2>/dev/null)
elif command -v fnm &>/dev/null; then
  REAL_NODE=$(fnm exec --using=default -- which node 2>/dev/null)
fi
if [[ -z "$REAL_NODE" ]]; then
  NODE_BIN=$(command -v node 2>/dev/null)
  [[ -n "$NODE_BIN" ]] && REAL_NODE=$(readlink -f "$NODE_BIN" 2>/dev/null || realpath "$NODE_BIN" 2>/dev/null || echo "$NODE_BIN")
fi
if [[ -n "$REAL_NODE" ]]; then
  echo "$(dirname "$REAL_NODE")" > "$SUPERBOT2_HOME/.node-path"
fi

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Ensure scheduler script is executable
chmod +x "$SCRIPT"

# Unload existing plist if present
if launchctl list "$PLIST_NAME" &>/dev/null; then
  echo "Unloading existing scheduler..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

mkdir -p "$HOME/Library/LaunchAgents"

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
  <integer>60</integer>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/scheduler.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/scheduler.log</string>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
EOF

launchctl load "$PLIST_PATH"

echo "Scheduler installed!"
echo "  Checks every 60 seconds"
echo "  Config: schedule array in $SUPERBOT2_HOME/config.json"
echo "  Log: $LOG_DIR/scheduler.log"
echo "  Plist: $PLIST_PATH"
