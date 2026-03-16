#!/bin/bash
# install-skill-to-space.sh — Symlink a skill from the library into a space
#
# Usage:
#   bash ~/.superbot2/scripts/install-skill-to-space.sh <skill-name> <space-slug>
#
# What it does:
#   1. Validates the skill exists in ~/.superbot2/skill-library/<skill-name>/
#   2. Resolves the space's codeDir from space.json (or defaults to <space-dir>/app)
#   3. Creates <codeDir>/.claude/skills/ if needed
#   4. Symlinks <codeDir>/.claude/skills/<skill-name> → library path
#   5. Updates space.json skills array
#   6. Prints confirmation

set -euo pipefail

source "$(dirname "$0")/lock-helper.sh"

SUPERBOT_DIR="$HOME/.superbot2"
LIBRARY_DIR="$SUPERBOT_DIR/skill-library"
SPACES_DIR="$SUPERBOT_DIR/spaces"

# --- Parse arguments ---
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <skill-name> <space-slug>" >&2
  exit 1
fi

SKILL_NAME="$1"
SPACE_SLUG="$2"

# --- Validate skill exists in library ---
SKILL_PATH="$LIBRARY_DIR/$SKILL_NAME"
if [[ ! -d "$SKILL_PATH" ]]; then
  echo "ERROR: Skill '$SKILL_NAME' not found in library at $SKILL_PATH" >&2
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

# --- Create skills directory if needed ---
SKILLS_DIR="$CODE_DIR/.claude/skills"
mkdir -p "$SKILLS_DIR"

# --- Check if already installed ---
LINK_PATH="$SKILLS_DIR/$SKILL_NAME"
if [[ -L "$LINK_PATH" ]]; then
  echo "Skill '$SKILL_NAME' is already installed in space '$SPACE_SLUG'"
  exit 0
fi
if [[ -e "$LINK_PATH" ]]; then
  echo "ERROR: $LINK_PATH already exists and is not a symlink" >&2
  exit 1
fi

# --- Create symlink (absolute path) ---
ln -s "$SKILL_PATH" "$LINK_PATH"

# --- Update space.json skills array ---
# Add skill name if not already present
HAS_SKILL=$(jq --arg name "$SKILL_NAME" '.skills // [] | map(select(. == $name)) | length' "$SPACE_JSON")
if [[ "$HAS_SKILL" -eq 0 ]]; then
  locked_write "$SPACE_JSON" \
    'if .skills then .skills += [$name] else .skills = [$name] end' \
    --arg name "$SKILL_NAME"
fi

echo "Installed '$SKILL_NAME' → space '$SPACE_SLUG' ($LINK_PATH → $SKILL_PATH)"
