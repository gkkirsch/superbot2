#!/bin/bash
# list-library.sh — List all skills and plugins in their libraries with install status
#
# Usage:
#   bash ~/.superbot2/scripts/list-library.sh
#
# Output:
#   Skill Library:
#     social-media-approvals  → hostreply, x-authority
#     supercharge-api         → supercharge
#     apple-notes             → (not installed)
#
#   Plugin Library:
#     social-media-approvals  → hostreply, x-authority
#     frontend-slides         → (not installed)

set -euo pipefail

SUPERBOT_DIR="$HOME/.superbot2"
SKILL_LIBRARY_DIR="$SUPERBOT_DIR/skill-library"
PLUGIN_LIBRARY_DIR="$SUPERBOT_DIR/plugin-library"
SPACES_DIR="$SUPERBOT_DIR/spaces"

# --- Helper: find which spaces have an item installed ---
# Args: $1 = type ("skill" or "plugin"), $2 = item name
find_installed_spaces() {
  local item_type="$1"
  local item_name="$2"
  local installed=()

  for space_json in "$SPACES_DIR"/*/space.json; do
    [[ -f "$space_json" ]] || continue
    local slug
    slug=$(basename "$(dirname "$space_json")")

    local code_dir
    code_dir=$(jq -r '.codeDir // empty' "$space_json" 2>/dev/null)
    if [[ -z "$code_dir" ]]; then
      code_dir="$SPACES_DIR/$slug/app"
    fi

    if [[ "$item_type" == "skill" ]]; then
      # Check for symlink in .claude/skills/
      if [[ -L "$code_dir/.claude/skills/$item_name" ]]; then
        installed+=("$slug")
      fi
    elif [[ "$item_type" == "plugin" ]]; then
      # Check for symlink in .claude/plugins/cache/local/<name>/
      local cache_dir="$code_dir/.claude/plugins/cache/local/$item_name"
      if [[ -d "$cache_dir" ]]; then
        # Check if any version symlink exists
        for entry in "$cache_dir"/*/; do
          if [[ -L "${entry%/}" ]]; then
            installed+=("$slug")
            break
          fi
        done
      fi
      # Also check space.json plugins array
      if [[ ${#installed[@]} -eq 0 ]]; then
        local has
        has=$(jq --arg name "$item_name" '.plugins // [] | map(select(. == $name)) | length' "$space_json" 2>/dev/null || echo "0")
        if [[ "$has" -gt 0 ]]; then
          installed+=("$slug")
        fi
      fi
    fi
  done

  if [[ ${#installed[@]} -gt 0 ]]; then
    IFS=', '; echo "${installed[*]}"
  else
    echo "(not installed)"
  fi
}

# --- Skill Library ---
echo "Skill Library:"

if [[ ! -d "$SKILL_LIBRARY_DIR" ]] || [[ -z "$(ls -A "$SKILL_LIBRARY_DIR" 2>/dev/null)" ]]; then
  echo "  (empty)"
else
  SKILLS=()
  MAX_LEN=0
  for skill_dir in "$SKILL_LIBRARY_DIR"/*/; do
    [[ -d "$skill_dir" ]] || continue
    name=$(basename "$skill_dir")
    SKILLS+=("$name")
    [[ ${#name} -gt $MAX_LEN ]] && MAX_LEN=${#name}
  done

  for skill in "${SKILLS[@]}"; do
    spaces_str=$(find_installed_spaces "skill" "$skill")
    printf "  %-${MAX_LEN}s  → %s\n" "$skill" "$spaces_str"
  done
fi

echo ""

# --- Plugin Library ---
echo "Plugin Library:"

if [[ ! -d "$PLUGIN_LIBRARY_DIR" ]] || [[ -z "$(ls -A "$PLUGIN_LIBRARY_DIR" 2>/dev/null)" ]]; then
  echo "  (empty)"
else
  PLUGINS=()
  MAX_LEN=0
  for plugin_dir in "$PLUGIN_LIBRARY_DIR"/*/; do
    [[ -d "$plugin_dir" ]] || continue
    name=$(basename "$plugin_dir")
    PLUGINS+=("$name")
    [[ ${#name} -gt $MAX_LEN ]] && MAX_LEN=${#name}
  done

  if [[ ${#PLUGINS[@]} -eq 0 ]]; then
    echo "  (empty)"
  else
    for plugin in "${PLUGINS[@]}"; do
      # Show version from metadata
      version=""
      meta="$PLUGIN_LIBRARY_DIR/$plugin/metadata.json"
      if [[ -f "$meta" ]]; then
        version=$(jq -r '.version // ""' "$meta")
      fi

      spaces_str=$(find_installed_spaces "plugin" "$plugin")
      version_suffix=""
      [[ -n "$version" ]] && version_suffix=" (v${version})"
      printf "  %-${MAX_LEN}s%-12s → %s\n" "$plugin" "$version_suffix" "$spaces_str"
    done
  fi
fi

echo ""

# --- Global plugins (not in library) ---
GLOBAL_PLUGINS_JSON="$SUPERBOT_DIR/.claude/plugins/installed_plugins.json"
if [[ -f "$GLOBAL_PLUGINS_JSON" ]]; then
  echo "Global Plugins (user-scope, available to all workers):"
  # Extract plugin names with user scope
  GLOBAL_NAMES=()
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    # Check if any entry has user scope
    has_user=$(jq --arg key "$key" \
      '(.plugins[$key] // []) | map(select(.scope == "user")) | length' \
      "$GLOBAL_PLUGINS_JSON")
    if [[ "$has_user" -gt 0 ]]; then
      # Extract display name (before @)
      display_name="${key%%@*}"
      # Skip if it's in the plugin library (it's per-space, not global)
      if [[ ! -d "$PLUGIN_LIBRARY_DIR/$display_name" ]]; then
        GLOBAL_NAMES+=("$display_name")
      fi
    fi
  done < <(jq -r '.plugins | keys[]' "$GLOBAL_PLUGINS_JSON" 2>/dev/null)

  if [[ ${#GLOBAL_NAMES[@]} -eq 0 ]]; then
    echo "  (none)"
  else
    # Deduplicate
    readarray -t UNIQUE_GLOBALS < <(printf '%s\n' "${GLOBAL_NAMES[@]}" | sort -u)
    for name in "${UNIQUE_GLOBALS[@]}"; do
      echo "  $name"
    done
  fi
fi
