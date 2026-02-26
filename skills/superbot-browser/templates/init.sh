#!/bin/bash
# init.sh — One-time setup for the superbot2 browser profile.
# Run this ONCE to create the profile at ~/.superbot2/browser/Default/
# After that, use setup.sh before each automation session.
#
# If a "superbot2" profile already exists inside Chrome's own directory,
# this will migrate the sessions from it automatically.

set -euo pipefail

BROWSER_DIR="$HOME/.superbot2/browser"
PROFILE_DIR="$BROWSER_DIR/Default"
DOWNLOADS_DIR="$HOME/.superbot2/downloads"
CDP_PORT=9222

# Old Chrome-managed profile location (for migration if it exists)
OLD_CHROME_PROFILE="$HOME/Library/Application Support/Google/Chrome/superbot2"

echo "🤖 Setting up superbot2 browser profile at: $BROWSER_DIR"
echo ""

# Quit Chrome if running
if pgrep -x "Google Chrome" > /dev/null 2>&1; then
  echo "🔄 Chrome is running — quitting first..."
  osascript -e 'quit app "Google Chrome"'
  sleep 3
fi

# Migrate from old Chrome-managed profile if it exists and we haven't set up yet
if [ -d "$OLD_CHROME_PROFILE" ] && [ ! -d "$PROFILE_DIR" ]; then
  echo "📋 Found existing Chrome superbot2 profile — migrating sessions..."
  mkdir -p "$PROFILE_DIR"
  cp -r "$OLD_CHROME_PROFILE/." "$PROFILE_DIR/"
  echo "✅ Sessions migrated from: $OLD_CHROME_PROFILE"
else
  mkdir -p "$PROFILE_DIR"
  echo "✅ Profile directory ready."
fi

# Ensure downloads directory exists
mkdir -p "$DOWNLOADS_DIR"
echo "✅ Downloads directory: $DOWNLOADS_DIR"

# Write profile Preferences
cat > "$PROFILE_DIR/Preferences" << EOF
{
  "credentials_enable_service": false,
  "credentials_enable_autosignin": false,
  "download": {
    "prompt_for_download": false,
    "default_directory": "$DOWNLOADS_DIR"
  },
  "intl": {
    "selected_languages": "en-US,en"
  },
  "profile": {
    "name": "superbot2",
    "default_content_setting_values": {
      "notifications": 2,
      "geolocation": 2,
      "media_stream_camera": 2,
      "media_stream_mic": 2,
      "popups": 2
    }
  },
  "translate": {
    "enabled": false
  }
}
EOF
echo "✅ Profile Preferences written."

# Launch Chrome with CDP so you can log into accounts
echo ""
echo "🚀 Launching Chrome with CDP on port $CDP_PORT..."
echo "   Log into any accounts you need (the sessions will persist)."
echo ""
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$BROWSER_DIR" \
  --remote-debugging-port=$CDP_PORT \
  --no-first-run \
  --no-default-browser-check \
  "about:blank" &

sleep 5

curl -s "http://localhost:$CDP_PORT/json/version" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print('✅ CDP ready:', d['Browser'])" \
  || echo "⚠️  CDP check failed — Chrome may still be starting up"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup complete! Profile: $BROWSER_DIR"
echo "   Log into accounts now."
echo "   Next time, run: bash setup.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
