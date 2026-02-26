#!/bin/bash
# setup-superbot-chrome.sh
# Creates the superbot2 Chrome profile with a custom avatar and opens it.
# Run this once. After that, use open-superbot-chrome.sh to launch.
#
# NOTE: Chrome must be fully quit before running this script,
# otherwise Chrome will overwrite the Local State changes.

PROFILE_NAME="superbot2"
CHROME_DIR="/Users/gkkirsch/Library/Application Support/Google/Chrome"
PROFILE_DIR="$CHROME_DIR/$PROFILE_NAME"
LOCAL_STATE="$CHROME_DIR/Local State"
AVATAR_SRC="${SUPERBOT2_APP_DIR:-$HOME/.superbot2-app}/assets/logo.png"
AVATAR_DEST="$PROFILE_DIR/Google Profile Picture.png"

# --- Check Chrome is not running ---
if pgrep -x "Google Chrome" > /dev/null 2>&1; then
  echo "❌ Chrome is currently running. Please quit Chrome first (⌘Q), then re-run this script."
  exit 1
fi

echo "🤖 Setting up Chrome profile: $PROFILE_NAME"

# --- Create profile directory ---
mkdir -p "$PROFILE_DIR"
echo "✅ Profile directory ready."

# --- Copy avatar ---
if [ -f "$AVATAR_SRC" ]; then
  cp "$AVATAR_SRC" "$AVATAR_DEST"
  echo "✅ Avatar copied → Google Profile Picture.png"
else
  echo "⚠️  Avatar not found at: $AVATAR_SRC"
  echo "   Expected: ~/.superbot2-app/assets/logo.png"
fi

# --- Replace tamagotchi avatar (index 46) with SB logo ---
# Chrome caches downloaded avatars in ~/Library/.../Chrome/Avatars/.
# Profile uses avatar_index 46 (tamagotchi). Replacing its cached file
# makes Chrome show the SB logo without needing GAIA picture setup.
AVATARS_DIR="$HOME/Library/Application Support/Google/Chrome/Avatars"
TAMAGOTCHI="$AVATARS_DIR/avatar_illustration_tamagotchi.png"
mkdir -p "$AVATARS_DIR"
if [ -f "$AVATAR_SRC" ]; then
  # Back up original only if .bak doesn't exist yet
  if [ -f "$TAMAGOTCHI" ] && [ ! -f "$TAMAGOTCHI.bak" ]; then
    cp "$TAMAGOTCHI" "$TAMAGOTCHI.bak"
    echo "✅ Tamagotchi avatar backed up"
  fi
  cp "$AVATAR_SRC" "$TAMAGOTCHI"
  echo "✅ Tamagotchi avatar (index 46) replaced with SB logo"
fi

# --- Ensure downloads directory exists ---
DOWNLOADS_DIR="$HOME/.superbot2/downloads"
mkdir -p "$DOWNLOADS_DIR"
echo "✅ Downloads directory ready: $DOWNLOADS_DIR"

# --- Write profile Preferences ---
cat > "$PROFILE_DIR/Preferences" << EOF
{
  "browser": {
    "theme": {
      "color_variant2": 1,
      "user_color2": -65481
    },
    "window_placement": {
      "bottom": 1095,
      "left": 22,
      "maximized": false,
      "right": 1222,
      "top": 55
    }
  },
  "credentials_enable_service": false,
  "credentials_enable_autosignin": false,
  "devtools": {
    "preferences": {
      "currentDockState": "\"undocked\"",
      "releaseNoteVersionSeen": "145"
    }
  },
  "download": {
    "prompt_for_download": false,
    "default_directory": "$DOWNLOADS_DIR"
  },
  "intl": {
    "selected_languages": "en-US,en"
  },
  "profile": {
    "name": "superbot2",
    "avatar_index": 46,
    "using_default_avatar": false,
    "using_gaia_avatar": false,
    "default_content_setting_values": {
      "notifications": 2,
      "geolocation": 2,
      "media_stream_camera": 2,
      "media_stream_mic": 2,
      "popups": 2
    }
  },
  "session": {
    "restore_on_startup": 5
  },
  "spellcheck": {
    "dictionaries": ["en-US"]
  },
  "translate": {
    "enabled": false
  },
  "user_experience_metrics": {
    "reporting_enabled": false
  }
}
EOF
echo "✅ Profile Preferences written."

# --- Update Local State (adds profile to Chrome's known profiles) ---
python3 << PYEOF
import json, sys

local_state_path = "$LOCAL_STATE"

with open(local_state_path, 'r') as f:
    state = json.load(f)

# Ensure info_cache exists
if 'profile' not in state:
    state['profile'] = {}
if 'info_cache' not in state['profile']:
    state['profile']['info_cache'] = {}

# Add or update the superbot2 entry
state['profile']['info_cache']['$PROFILE_NAME'] = {
    "name": "superbot2",
    "avatar_icon": "chrome://theme/IDR_PROFILE_AVATAR_26",
    "default_avatar_fill_color": -14277082,
    "default_avatar_stroke_color": -1,
    "gaia_picture_file_name": "Google Profile Picture.png",
    "is_consented_primary_account": False,
    "is_ephemeral": False,
    "is_managed": 0,
    "is_using_default_avatar": False,
    "is_using_default_name": False,
    "is_using_new_placeholder_avatar_icon": False
}

with open(local_state_path, 'w') as f:
    json.dump(state, f, separators=(',', ':'))

print("✅ Local State updated — superbot2 profile registered.")
PYEOF

# --- Launch Chrome ---
echo ""
echo "🚀 Launching Chrome with superbot2 profile..."
open -a "Google Chrome" --args --profile-directory="$PROFILE_NAME"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Done! Chrome should open with the superbot2 profile"
echo "   and your custom avatar."
echo ""
echo "🔐 Next: log into any accounts superbot2 needs"
echo "   (Facebook as Tami, Instagram, etc.)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
