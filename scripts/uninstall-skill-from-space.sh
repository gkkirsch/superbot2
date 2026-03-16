#!/bin/bash
# uninstall-skill-from-space.sh — Remove an installed skill from a space
#
# Usage:
#   bash ~/.superbot2/scripts/uninstall-skill-from-space.sh <skill-name> <space-slug> [--force]
#
# What it does:
#   1. Resolves the space's codeDir from space.json
#   2. Checks if the skill's data/ directory has content
#   3. If data/ has content and --force is not set, warns and refuses to delete
#   4. Removes the skill directory at <codeDir>/.claude/skills/<skill-name>
#   5. Removes the skill from space.json skills array
#   6. Prints confirmation
#
# Data convention:
#   Each installed skill has a data/ subdirectory for per-space runtime data.
#   Use --force to delete a skill that has data.

set -euo pipefail

source "$(dirname "$0")/lock-helper.sh"

SUPERBOT_DIR="$HOME/.superbot2"
SPACES_DIR="$SUPERBOT_DIR/spaces"

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
  echo "Usage: $0 <skill-name> <space-slug> [--force]" >&2
  exit 1
fi

SKILL_NAME="${POSITIONAL[0]}"
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

# --- Remove skill directory ---
SKILL_DIR="$CODE_DIR/.claude/skills/$SKILL_NAME"

if [[ -L "$SKILL_DIR" ]]; then
  # Legacy symlink — just remove it
  rm "$SKILL_DIR"
  echo "Removed legacy symlink: $SKILL_DIR"
elif [[ -d "$SKILL_DIR" ]]; then
  # Check for data/ with content
  DATA_DIR="$SKILL_DIR/data"
  if [[ -d "$DATA_DIR" ]] && [[ -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]]; then
    DATA_SIZE=$(du -sh "$DATA_DIR" 2>/dev/null | cut -f1)
    if [[ "$FORCE" != true ]]; then
      echo "WARNING: Skill '$SKILL_NAME' has data/ with content ($DATA_SIZE)" >&2
      echo "  Path: $DATA_DIR" >&2
      echo "  Use --force to delete anyway" >&2
      exit 1
    fi
    echo "Removing skill with data/ ($DATA_SIZE) — --force specified"
  fi
  rm -rf "$SKILL_DIR"
  echo "Removed skill directory: $SKILL_DIR"
elif [[ -e "$SKILL_DIR" ]]; then
  echo "ERROR: $SKILL_DIR exists but is not a directory or symlink — refusing to remove" >&2
  exit 1
else
  echo "Skill not found at $SKILL_DIR (may already be uninstalled)"
fi

# --- Update space.json skills array ---
HAS_SKILL=$(jq --arg name "$SKILL_NAME" '.skills // [] | map(select(. == $name)) | length' "$SPACE_JSON")
if [[ "$HAS_SKILL" -gt 0 ]]; then
  locked_write "$SPACE_JSON" \
    '.skills = [.skills[] | select(. != $name)]' \
    --arg name "$SKILL_NAME"
fi

echo "Uninstalled '$SKILL_NAME' from space '$SPACE_SLUG'"
