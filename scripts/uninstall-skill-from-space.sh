#!/bin/bash
# uninstall-skill-from-space.sh — Remove a skill symlink from a space
#
# Usage:
#   bash ~/.superbot2/scripts/uninstall-skill-from-space.sh <skill-name> <space-slug>
#
# What it does:
#   1. Resolves the space's codeDir from space.json
#   2. Removes the symlink at <codeDir>/.claude/skills/<skill-name>
#   3. Removes the skill from space.json skills array
#   4. Prints confirmation

set -euo pipefail

source "$(dirname "$0")/lock-helper.sh"

SUPERBOT_DIR="$HOME/.superbot2"
SPACES_DIR="$SUPERBOT_DIR/spaces"

# --- Parse arguments ---
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <skill-name> <space-slug>" >&2
  exit 1
fi

SKILL_NAME="$1"
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

# --- Remove symlink ---
LINK_PATH="$CODE_DIR/.claude/skills/$SKILL_NAME"
if [[ -L "$LINK_PATH" ]]; then
  rm "$LINK_PATH"
  echo "Removed symlink: $LINK_PATH"
elif [[ -e "$LINK_PATH" ]]; then
  echo "ERROR: $LINK_PATH exists but is not a symlink — refusing to remove" >&2
  exit 1
else
  echo "Symlink not found at $LINK_PATH (may already be uninstalled)"
fi

# --- Update space.json skills array ---
HAS_SKILL=$(jq --arg name "$SKILL_NAME" '.skills // [] | map(select(. == $name)) | length' "$SPACE_JSON")
if [[ "$HAS_SKILL" -gt 0 ]]; then
  locked_write "$SPACE_JSON" \
    '.skills = [.skills[] | select(. != $name)]' \
    --arg name "$SKILL_NAME"
fi

echo "Uninstalled '$SKILL_NAME' from space '$SPACE_SLUG'"
