#!/bin/bash
# uninstall-plugin-from-space.sh — Remove a plugin from a space
#
# Usage:
#   bash ~/.superbot2/scripts/uninstall-plugin-from-space.sh <plugin-name> <space-slug>
#
# What it does:
#   1. Resolves the space's codeDir from space.json
#   2. Removes the symlink at <codeDir>/.claude/plugins/cache/local/<plugin-name>/<version>
#   3. Removes the project-scope entry from global installed_plugins.json
#   4. Removes enabledPlugins entry from project-level <codeDir>/.claude/settings.json
#   5. Removes the plugin from space.json plugins array
#   6. Prints confirmation

set -euo pipefail

source "$(dirname "$0")/lock-helper.sh"

SUPERBOT_DIR="$HOME/.superbot2"
LIBRARY_DIR="$SUPERBOT_DIR/plugin-library"
SPACES_DIR="$SUPERBOT_DIR/spaces"
GLOBAL_PLUGINS_JSON="$SUPERBOT_DIR/.claude/plugins/installed_plugins.json"

# --- Parse arguments ---
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <plugin-name> <space-slug>" >&2
  exit 1
fi

PLUGIN_NAME="$1"
SPACE_SLUG="$2"

# --- Validate space exists ---
SPACE_DIR="$SPACES_DIR/$SPACE_SLUG"
SPACE_JSON="$SPACE_DIR/space.json"
if [[ ! -f "$SPACE_JSON" ]]; then
  echo "ERROR: Space '$SPACE_SLUG' not found (no space.json at $SPACE_JSON)" >&2
  exit 1
fi

# --- Resolve codeDir ---
CODE_DIR=$(jq -r '.codeDir // empty' "$SPACE_JSON")
if [[ -z "$CODE_DIR" ]]; then
  CODE_DIR="$SPACE_DIR/app"
fi

# --- Read metadata for version (if library entry exists) ---
METADATA_FILE="$LIBRARY_DIR/$PLUGIN_NAME/metadata.json"
# Read marketplace from metadata for correct plugin key (never use @local)
MARKETPLACE=$(jq -r '.marketplace // "local"' "$METADATA_FILE" 2>/dev/null || echo "local")
PLUGIN_KEY="${PLUGIN_NAME}@${MARKETPLACE}"
if [[ -f "$METADATA_FILE" ]]; then
  VERSION=$(jq -r '.version' "$METADATA_FILE")
  KEY_FROM_META=$(jq -r '.pluginKey // empty' "$METADATA_FILE")
  if [[ -n "$KEY_FROM_META" ]]; then
    PLUGIN_KEY="$KEY_FROM_META"
  fi
else
  VERSION=""
fi

# --- Remove symlink(s) ---
CACHE_BASE="$CODE_DIR/.claude/plugins/cache/local/$PLUGIN_NAME"
if [[ -d "$CACHE_BASE" ]]; then
  # Remove version symlinks
  for entry in "$CACHE_BASE"/*/; do
    [[ -L "${entry%/}" ]] && rm "${entry%/}" && echo "Removed symlink: ${entry%/}"
  done
  # If version was known, try direct removal
  if [[ -n "$VERSION" && -L "$CACHE_BASE/$VERSION" ]]; then
    rm "$CACHE_BASE/$VERSION" 2>/dev/null && echo "Removed symlink: $CACHE_BASE/$VERSION"
  fi
  # Remove empty directories
  rmdir "$CACHE_BASE" 2>/dev/null || true
fi

# --- Remove project-scope entry from global installed_plugins.json ---
if [[ -f "$GLOBAL_PLUGINS_JSON" ]]; then
  # Remove entries matching this space's codeDir for any key containing the plugin name
  # Try both the specific pluginKey and common variants
  for KEY in "$PLUGIN_KEY" "${PLUGIN_NAME}@local" "${PLUGIN_NAME}@superbot-marketplace"; do
    HAS_ENTRY=$(jq --arg key "$KEY" --arg path "$CODE_DIR" \
      '(.plugins[$key] // []) | map(select(.scope == "project" and .projectPath == $path)) | length' \
      "$GLOBAL_PLUGINS_JSON" 2>/dev/null || echo "0")

    if [[ "$HAS_ENTRY" -gt 0 ]]; then
      locked_write "$GLOBAL_PLUGINS_JSON" \
        '.plugins[$key] = [(.plugins[$key] // [])[] | select(.scope != "project" or .projectPath != $path)]
         | if (.plugins[$key] | length) == 0 then del(.plugins[$key]) else . end' \
        --arg key "$KEY" \
        --arg path "$CODE_DIR"
      echo "Removed project-scope entry for '$KEY' from installed_plugins.json"
    fi
  done
fi

# --- Remove enabledPlugins entry from project-level settings.json ---
PROJECT_SETTINGS="$CODE_DIR/.claude/settings.json"
if [[ -f "$PROJECT_SETTINGS" ]]; then
  for KEY in "$PLUGIN_KEY" "${PLUGIN_NAME}@local" "${PLUGIN_NAME}@superbot-marketplace"; do
    HAS_ENABLED=$(jq --arg key "$KEY" '.enabledPlugins[$key] // null' "$PROJECT_SETTINGS" 2>/dev/null)
    if [[ "$HAS_ENABLED" == "true" ]]; then
      locked_write "$PROJECT_SETTINGS" \
        'del(.enabledPlugins[$key])' \
        --arg key "$KEY"
      echo "Removed '$KEY' from enabledPlugins in $PROJECT_SETTINGS"
    fi
  done
fi

# --- Update space.json plugins array ---
HAS_PLUGIN=$(jq --arg name "$PLUGIN_NAME" '.plugins // [] | map(select(. == $name)) | length' "$SPACE_JSON")
if [[ "$HAS_PLUGIN" -gt 0 ]]; then
  locked_write "$SPACE_JSON" \
    '.plugins = [(.plugins // [])[] | select(. != $name)]' \
    --arg name "$PLUGIN_NAME"
fi

echo "Uninstalled plugin '$PLUGIN_NAME' from space '$SPACE_SLUG'"
