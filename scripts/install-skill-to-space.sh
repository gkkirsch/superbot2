#!/bin/bash
# install-skill-to-space.sh — Copy a skill from the library into a space
#
# Usage:
#   bash ~/.superbot2/scripts/install-skill-to-space.sh <skill-name> <space-slug>
#
# What it does:
#   1. Validates the skill exists in ~/.superbot2/skill-library/<skill-name>/
#   2. Resolves the space's codeDir from space.json (or defaults to <space-dir>/app)
#   3. Creates <codeDir>/.claude/skills/ if needed
#   4. Copies the skill directory into the space (each space gets its own copy)
#   5. Creates a data/ directory inside the copied skill for per-space data
#   6. Updates space.json skills array
#   7. Prints confirmation
#
# Data convention:
#   Each installed skill has a data/ subdirectory at <codeDir>/.claude/skills/<skill-name>/data/
#   This directory is for per-space runtime data and is preserved across re-installs.

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

# --- Install (copy) ---
DEST_PATH="$SKILLS_DIR/$SKILL_NAME"

if [[ -d "$DEST_PATH" ]]; then
  # Already installed — re-install: preserve data/, overwrite code
  echo "Skill '$SKILL_NAME' already installed in space '$SPACE_SLUG' — re-installing (preserving data/)"

  # Back up data/ if it exists and has content
  DATA_BACKUP=""
  if [[ -d "$DEST_PATH/data" ]]; then
    DATA_BACKUP=$(mktemp -d)
    cp -r "$DEST_PATH/data" "$DATA_BACKUP/data"
  fi

  # Remove old copy and replace with fresh library copy
  rm -rf "$DEST_PATH"
  cp -r "$SKILL_PATH" "$DEST_PATH"

  # Restore data/
  if [[ -n "$DATA_BACKUP" && -d "$DATA_BACKUP/data" ]]; then
    rm -rf "$DEST_PATH/data"
    mv "$DATA_BACKUP/data" "$DEST_PATH/data"
    rm -rf "$DATA_BACKUP"
    echo "Preserved existing data/ directory"
  fi
elif [[ -L "$DEST_PATH" ]]; then
  # Legacy symlink — remove and replace with copy
  echo "Replacing legacy symlink with copy"
  rm "$DEST_PATH"
  cp -r "$SKILL_PATH" "$DEST_PATH"
else
  # Fresh install
  cp -r "$SKILL_PATH" "$DEST_PATH"
fi

# --- Ensure data/ directory exists ---
mkdir -p "$DEST_PATH/data"

# --- Update space.json skills array ---
# Add skill name if not already present
HAS_SKILL=$(jq --arg name "$SKILL_NAME" '.skills // [] | map(select(. == $name)) | length' "$SPACE_JSON")
if [[ "$HAS_SKILL" -eq 0 ]]; then
  locked_write "$SPACE_JSON" \
    'if .skills then .skills += [$name] else .skills = [$name] end' \
    --arg name "$SKILL_NAME"
fi

echo "Installed '$SKILL_NAME' → space '$SPACE_SLUG' ($DEST_PATH, copied from $SKILL_PATH)"
