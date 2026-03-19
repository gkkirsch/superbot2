#!/bin/bash
# update-plugin.sh — Propagate a library plugin/skill update to all space copies
#
# Usage:
#   bash ~/.superbot2/scripts/update-plugin.sh <name>
#
# What it does:
#   1. Detects whether <name> is a plugin (in plugin-library) or skill (in skill-library)
#   2. Scans all spaces to find which ones have it installed (filesystem + space.json)
#   3. Re-copies from library to each space's install location, preserving data/ directories
#   4. Reports what was updated
#
# Handles both copy-based installs and legacy symlinks (converts symlinks to copies).

set -euo pipefail

SUPERBOT_DIR="$HOME/.superbot2"
PLUGIN_LIBRARY="$SUPERBOT_DIR/plugin-library"
SKILL_LIBRARY="$SUPERBOT_DIR/skill-library"
SPACES_DIR="$SUPERBOT_DIR/spaces"

# --- Parse arguments ---
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <plugin-or-skill-name>" >&2
  exit 1
fi

NAME="$1"

# --- Detect type: plugin or skill ---
TYPE=""
SOURCE_PATH=""

if [[ -d "$PLUGIN_LIBRARY/$NAME" && -f "$PLUGIN_LIBRARY/$NAME/metadata.json" ]]; then
  TYPE="plugin"
  VERSION=$(jq -r '.version' "$PLUGIN_LIBRARY/$NAME/metadata.json")
  SOURCE_PATH="$PLUGIN_LIBRARY/$NAME/$VERSION"
  if [[ ! -d "$SOURCE_PATH" ]]; then
    echo "ERROR: Plugin version directory not found at $SOURCE_PATH" >&2
    exit 1
  fi
elif [[ -d "$SKILL_LIBRARY/$NAME" ]]; then
  TYPE="skill"
  SOURCE_PATH="$SKILL_LIBRARY/$NAME"
else
  echo "ERROR: '$NAME' not found in plugin-library or skill-library" >&2
  exit 1
fi

echo "Found $TYPE '$NAME' in library at $SOURCE_PATH"

# --- Scan all spaces for installs ---
UPDATED=0
SKIPPED=0

for SPACE_JSON in "$SPACES_DIR"/*/space.json; do
  [[ -f "$SPACE_JSON" ]] || continue

  SPACE_DIR=$(dirname "$SPACE_JSON")
  SPACE_SLUG=$(basename "$SPACE_DIR")

  # Resolve codeDir
  CODE_DIR=$(jq -r '.codeDir // empty' "$SPACE_JSON")
  if [[ -z "$CODE_DIR" ]]; then
    CODE_DIR="$SPACE_DIR/app"
  fi

  # Determine install path based on type
  if [[ "$TYPE" == "plugin" ]]; then
    DEST_PATH="$CODE_DIR/.claude/plugins/cache/local/$NAME/$VERSION"
    # Also check space.json plugins array as fallback
    IN_JSON=$(jq --arg name "$NAME" '.plugins // [] | map(select(. == $name)) | length' "$SPACE_JSON")
  else
    DEST_PATH="$CODE_DIR/.claude/skills/$NAME"
    IN_JSON=$(jq --arg name "$NAME" '.skills // [] | map(select(. == $name)) | length' "$SPACE_JSON")
  fi

  # Check if installed (filesystem or space.json reference)
  INSTALLED=false
  if [[ -e "$DEST_PATH" || -L "$DEST_PATH" ]]; then
    INSTALLED=true
  elif [[ "$IN_JSON" -gt 0 ]]; then
    # In space.json but no filesystem entry — plugin dir might be at a different version
    if [[ "$TYPE" == "plugin" ]]; then
      CACHE_BASE="$CODE_DIR/.claude/plugins/cache/local/$NAME"
      if [[ -d "$CACHE_BASE" ]]; then
        INSTALLED=true
        # Find the actual version dir
        for entry in "$CACHE_BASE"/*/; do
          [[ -e "${entry%/}" ]] && DEST_PATH="${entry%/}" && break
        done
      fi
    else
      INSTALLED=true
    fi
  fi

  [[ "$INSTALLED" == false ]] && continue

  echo ""
  echo "Updating $TYPE '$NAME' in space '$SPACE_SLUG'..."

  # Back up data/ if it exists
  DATA_BACKUP=""
  ACTUAL_DEST="$DEST_PATH"

  # For symlinks, resolve the actual path but we'll replace the symlink
  if [[ -L "$ACTUAL_DEST" ]]; then
    # Check if the symlink target has a data/ dir
    LINK_TARGET=$(readlink "$ACTUAL_DEST")
    if [[ -d "$LINK_TARGET/data" ]]; then
      DATA_BACKUP=$(mktemp -d)
      cp -r "$LINK_TARGET/data" "$DATA_BACKUP/data"
      echo "  Backed up data/ from symlink target"
    fi
    echo "  Replacing legacy symlink with copy"
    rm "$ACTUAL_DEST"
  elif [[ -d "$ACTUAL_DEST" ]]; then
    # Copy-based install — back up data/ if present
    if [[ -d "$ACTUAL_DEST/data" ]]; then
      DATA_BACKUP=$(mktemp -d)
      cp -r "$ACTUAL_DEST/data" "$DATA_BACKUP/data"
      echo "  Backed up data/ directory"
    fi
    rm -rf "$ACTUAL_DEST"
  fi

  # Ensure parent directory exists
  mkdir -p "$(dirname "$ACTUAL_DEST")"

  # Copy fresh from library
  cp -r "$SOURCE_PATH" "$ACTUAL_DEST"

  # Restore data/
  if [[ -n "$DATA_BACKUP" && -d "$DATA_BACKUP/data" ]]; then
    rm -rf "$ACTUAL_DEST/data"
    mv "$DATA_BACKUP/data" "$ACTUAL_DEST/data"
    rm -rf "$DATA_BACKUP"
    echo "  Restored data/ directory"
  fi

  # Ensure data/ exists
  mkdir -p "$ACTUAL_DEST/data"

  echo "  Updated: $ACTUAL_DEST"
  UPDATED=$((UPDATED + 1))
done

# --- Summary ---
echo ""
if [[ $UPDATED -eq 0 ]]; then
  echo "No spaces found with $TYPE '$NAME' installed."
else
  echo "Done. Updated $TYPE '$NAME' in $UPDATED space(s)."
fi
