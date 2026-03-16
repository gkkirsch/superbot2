#!/bin/bash
# install-plugin-to-space.sh — Install a plugin from the library into a space
#
# Usage:
#   bash ~/.superbot2/scripts/install-plugin-to-space.sh <plugin-name> <space-slug>
#
# What it does:
#   1. Validates the plugin exists in ~/.superbot2/plugin-library/<plugin-name>/
#   2. Reads metadata.json for version/marketplace info
#   3. Resolves the space's codeDir from space.json (or defaults to <space-dir>/app)
#   4. Symlinks <codeDir>/.claude/plugins/cache/local/<plugin-name>/<version> → library path
#   5. Adds a project-scope entry to the global installed_plugins.json
#   6. Updates space.json plugins array
#   7. Prints confirmation

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

# --- Validate plugin exists in library ---
PLUGIN_DIR="$LIBRARY_DIR/$PLUGIN_NAME"
METADATA_FILE="$PLUGIN_DIR/metadata.json"
if [[ ! -f "$METADATA_FILE" ]]; then
  echo "ERROR: Plugin '$PLUGIN_NAME' not found in library at $PLUGIN_DIR" >&2
  exit 1
fi

# --- Read metadata ---
VERSION=$(jq -r '.version' "$METADATA_FILE")
MARKETPLACE=$(jq -r '.marketplace // "local"' "$METADATA_FILE")
PLUGIN_KEY=$(jq -r '.pluginKey // empty' "$METADATA_FILE")
if [[ -z "$PLUGIN_KEY" ]]; then
  PLUGIN_KEY="${PLUGIN_NAME}@local"
fi

LIBRARY_CACHE="$PLUGIN_DIR/$VERSION"
if [[ ! -d "$LIBRARY_CACHE" ]]; then
  echo "ERROR: Plugin cache not found at $LIBRARY_CACHE" >&2
  exit 1
fi

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

# --- Create plugin cache directory if needed ---
CACHE_DIR="$CODE_DIR/.claude/plugins/cache/local/$PLUGIN_NAME"
mkdir -p "$CACHE_DIR"

# --- Check if already installed ---
LINK_PATH="$CACHE_DIR/$VERSION"
if [[ -L "$LINK_PATH" ]]; then
  echo "Plugin '$PLUGIN_NAME' is already installed in space '$SPACE_SLUG'"
  exit 0
fi
if [[ -e "$LINK_PATH" ]]; then
  echo "ERROR: $LINK_PATH already exists and is not a symlink" >&2
  exit 1
fi

# --- Create symlink (absolute path) ---
ln -s "$LIBRARY_CACHE" "$LINK_PATH"

# --- Add project-scope entry to global installed_plugins.json ---
INSTALL_PATH="$LINK_PATH"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

if [[ ! -f "$GLOBAL_PLUGINS_JSON" ]]; then
  echo '{"version":2,"plugins":{}}' > "$GLOBAL_PLUGINS_JSON"
fi

# Check if a project-scope entry already exists for this space
HAS_ENTRY=$(jq --arg key "$PLUGIN_KEY" --arg path "$CODE_DIR" \
  '(.plugins[$key] // []) | map(select(.scope == "project" and .projectPath == $path)) | length' \
  "$GLOBAL_PLUGINS_JSON")

if [[ "$HAS_ENTRY" -eq 0 ]]; then
  locked_write "$GLOBAL_PLUGINS_JSON" \
    '.plugins[$key] = ((.plugins[$key] // []) + [{
      scope: "project",
      projectPath: $path,
      installPath: $installPath,
      version: $ver,
      installedAt: $now,
      lastUpdated: $now
    }])' \
    --arg key "$PLUGIN_KEY" \
    --arg path "$CODE_DIR" \
    --arg installPath "$INSTALL_PATH" \
    --arg ver "$VERSION" \
    --arg now "$NOW"
fi

# --- Update space.json plugins array ---
HAS_PLUGIN=$(jq --arg name "$PLUGIN_NAME" '.plugins // [] | map(select(. == $name)) | length' "$SPACE_JSON")
if [[ "$HAS_PLUGIN" -eq 0 ]]; then
  locked_write "$SPACE_JSON" \
    'if .plugins then .plugins += [$name] else .plugins = [$name] end' \
    --arg name "$PLUGIN_NAME"
fi

echo "Installed plugin '$PLUGIN_NAME' → space '$SPACE_SLUG' ($LINK_PATH → $LIBRARY_CACHE)"
