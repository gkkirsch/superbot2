#!/bin/bash
# list-library.sh — List all skills in the skill library with install status
#
# Usage:
#   bash ~/.superbot2/scripts/list-library.sh
#
# Output:
#   Skill Library:
#     social-media-approvals  → hostreply, x-authority
#     supercharge-api         → supercharge
#     apple-notes             → (not installed)

set -euo pipefail

SUPERBOT_DIR="$HOME/.superbot2"
LIBRARY_DIR="$SUPERBOT_DIR/skill-library"
SPACES_DIR="$SUPERBOT_DIR/spaces"

if [[ ! -d "$LIBRARY_DIR" ]]; then
  echo "Skill library not found at $LIBRARY_DIR"
  exit 1
fi

# Get all library skills
SKILLS=()
for skill_dir in "$LIBRARY_DIR"/*/; do
  [[ -d "$skill_dir" ]] || continue
  SKILLS+=("$(basename "$skill_dir")")
done

if [[ ${#SKILLS[@]} -eq 0 ]]; then
  echo "Skill Library: (empty)"
  exit 0
fi

# Find the longest skill name for alignment
MAX_LEN=0
for skill in "${SKILLS[@]}"; do
  [[ ${#skill} -gt $MAX_LEN ]] && MAX_LEN=${#skill}
done

echo "Skill Library:"

for skill in "${SKILLS[@]}"; do
  # Find which spaces have this skill installed (symlink in .claude/skills/)
  INSTALLED_SPACES=()

  for space_json in "$SPACES_DIR"/*/space.json; do
    [[ -f "$space_json" ]] || continue
    SPACE_SLUG=$(basename "$(dirname "$space_json")")

    # Resolve codeDir
    CODE_DIR=$(jq -r '.codeDir // empty' "$space_json" 2>/dev/null)
    if [[ -z "$CODE_DIR" ]]; then
      CODE_DIR="$SPACES_DIR/$SPACE_SLUG/app"
    fi

    # Check for symlink
    if [[ -L "$CODE_DIR/.claude/skills/$skill" ]]; then
      INSTALLED_SPACES+=("$SPACE_SLUG")
    fi
  done

  # Format output
  PADDING=$((MAX_LEN - ${#skill} + 2))
  SPACES_STR=""
  if [[ ${#INSTALLED_SPACES[@]} -gt 0 ]]; then
    SPACES_STR=$(IFS=', '; echo "${INSTALLED_SPACES[*]}")
  else
    SPACES_STR="(not installed)"
  fi

  printf "  %-${MAX_LEN}s  → %s\n" "$skill" "$SPACES_STR"
done
