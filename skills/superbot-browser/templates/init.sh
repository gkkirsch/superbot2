#!/bin/bash
# init.sh — One-time setup for the superbot2 browser profile.
# Creates the profile at ~/.superbot2/browser/Default/ and launches Chrome
# so you can log into the accounts workers will need.
# After this, use setup.sh before each automation session.

set -euo pipefail

BROWSER_DIR="$HOME/.superbot2/browser"
PROFILE_DIR="$BROWSER_DIR/Default"
DOWNLOADS_DIR="$HOME/.superbot2/downloads"
CDP_PORT=9222

echo "🤖 Setting up superbot2 browser profile..."

# Create directories
mkdir -p "$PROFILE_DIR" "$DOWNLOADS_DIR"
echo "✅ Profile: $BROWSER_DIR"

# Write Preferences
cat > "$PROFILE_DIR/Preferences" << EOF
{
  "credentials_enable_service": false,
  "credentials_enable_autosignin": false,
  "download": {
    "prompt_for_download": false,
    "default_directory": "$DOWNLOADS_DIR"
  },
  "intl": { "selected_languages": "en-US,en" },
  "profile": {
    "name": "superbot2",
    "avatar_index": 19,
    "profile_highlight_color": -8635667,
    "default_content_setting_values": {
      "notifications": 2,
      "geolocation": 2,
      "media_stream_camera": 2,
      "media_stream_mic": 2,
      "popups": 2
    }
  },
  "translate": { "enabled": false },
  "browser": {
    "theme": {
      "user_color2": -7558172,
      "color_variant2": 1
    }
  },
  "extensions": {
    "theme": {
      "id": "user_color_theme_id"
    }
  }
}
EOF
echo "✅ Preferences written."

# Launch Chrome with CDP
echo ""
echo "🚀 Launching Chrome on port $CDP_PORT — log into your accounts now."
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$BROWSER_DIR" \
  --remote-debugging-port=$CDP_PORT \
  --no-first-run \
  --no-default-browser-check \
  "about:blank" &

sleep 5

curl -s "http://localhost:$CDP_PORT/json/version" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print('✅ CDP ready:', d['Browser'])"

echo ""
echo "Log into accounts in the Chrome window. Sessions will persist in $BROWSER_DIR."
echo "Next time: bash setup.sh"
