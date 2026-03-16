#!/bin/bash
# uninstall-plugin-from-space.sh — Remove a plugin from a space
#
# Usage:
#   bash ~/.superbot2/scripts/uninstall-plugin-from-space.sh <plugin-name> <space-slug> [--force]
#
# What it does:
#   1. Resolves the space's codeDir from space.json
#   2. Checks if the plugin's data/ directory has content
#   3. If data/ has content and --force is not set, warns and refuses to delete
#   4. Removes the plugin directory at <codeDir>/.claude/plugins/cache/local/<plugin-name>/
#   5. Removes the project-scope entry from global installed_plugins.json
#   6. Removes enabledPlugins entry from project-level <codeDir>/.claude/settings.json
#   7. Removes the plugin from space.json plugins array
#   8. Prints confirmation
#
# Data convention:
#   Each installed plugin version has a data/ subdirectory for per-space runtime data.
#   Use --force to delete a plugin that has data.

set -euo pipefail

source "$(dirname "$0")/lock-helper.sh"

SUPERBOT_DIR="$HOME/.superbot2"
LIBRARY_DIR="$SUPERBOT_DIR/plugin-library"
SPACES_DIR="$SUPERBOT_DIR/spaces"
GLOBAL_PLUGINS_JSON="$SUPERBOT_DIR/.claude/plugins/installed_plugins.json"

# --- Parse arguments ---
FORCE=false
POSITIONAL=()
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    *) POSITIONAL+=("$arg") ;;
  esac
done

if [[ ${#POSITIONAL[@]} -lt 2 ]]; then
  echo "Usage: $0 <plugin-name> <space-slug> [--force]" >&2
  exit 1
fi

PLUGIN_NAME="${POSITIONAL[0]}"
SPACE_SLUG="${POSITIONAL[1]}"

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

# --- Check for data/ content and remove plugin directory ---
CACHE_BASE="$CODE_DIR/.claude/plugins/cache/local/$PLUGIN_NAME"
if [[ -d "$CACHE_BASE" ]]; then
  # Check for data/ with content in any version subdirectory
  HAS_DATA=false
  TOTAL_DATA_SIZE=""
  for version_dir in "$CACHE_BASE"/*/; do
    [[ -d "$version_dir" ]] || continue
    DATA_DIR="${version_dir}data"
    if [[ -d "$DATA_DIR" ]] && [[ -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]]; then
      HAS_DATA=true
      TOTAL_DATA_SIZE=$(du -sh "$DATA_DIR" 2>/dev/null | cut -f1)
      break
    fi
  done

  if [[ "$HAS_DATA" == true ]]; then
    if [[ "$FORCE" != true ]]; then
      echo "WARNING: Plugin '$PLUGIN_NAME' has data/ with content ($TOTAL_DATA_SIZE)" >&2
      echo "  Path: $CACHE_BASE" >&2
      echo "  Use --force to delete anyway" >&2
      exit 1
    fi
    echo "Removing plugin with data/ ($TOTAL_DATA_SIZE) — --force specified"
  fi

  rm -rf "$CACHE_BASE"
  echo "Removed plugin directory: $CACHE_BASE"
else
  echo "Plugin directory not found at $CACHE_BASE (may already be uninstalled)"
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
