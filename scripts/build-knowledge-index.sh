#!/bin/bash
# build-knowledge-index.sh — Generate INDEX.md for a space's knowledge directory
#
# Usage:
#   build-knowledge-index.sh <space>
#
# Generates a knowledge/INDEX.md listing every .md file with its size and first
# non-heading line as a summary. Workers read INDEX.md at startup instead of
# loading all files, saving potentially 100K+ tokens of context.

set -euo pipefail

SPACE="${1:-}"
if [[ -z "$SPACE" ]]; then
  echo "Usage: build-knowledge-index.sh <space>" >&2
  exit 1
fi

KNOWLEDGE_DIR="$HOME/.superbot2/spaces/$SPACE/knowledge"
if [[ ! -d "$KNOWLEDGE_DIR" ]]; then
  echo "ERROR: Knowledge directory not found: $KNOWLEDGE_DIR" >&2
  exit 1
fi

INDEX_FILE="$KNOWLEDGE_DIR/INDEX.md"

# Build index
{
  echo "# Knowledge Index — $SPACE"
  echo ""
  echo "Use this index to find relevant knowledge files without reading everything."
  echo "Read specific files on-demand when a task requires that domain knowledge."
  echo ""
  echo "| File | Size | Summary |"
  echo "|------|------|---------|"

  find "$KNOWLEDGE_DIR" -maxdepth 1 -name "*.md" -not -name "INDEX.md" -type f | sort | while read -r file; do
    filename=$(basename "$file")
    size=$(wc -c < "$file" | tr -d ' ')

    # Human-readable size
    if (( size > 1024 )); then
      hr_size="$(( size / 1024 ))KB"
    else
      hr_size="${size}B"
    fi

    # Extract summary: first heading text, or first content line
    summary=$(grep -m1 '^# ' "$file" 2>/dev/null | sed 's/^# //' | head -c 80 || true)
    if [[ -z "$summary" ]]; then
      summary=$(grep -m1 -v '^$\|^---\|^|' "$file" 2>/dev/null | sed 's/^#* //' | head -c 80 || echo "(no summary)")
    fi
    summary="${summary//|/—}"  # Escape pipe chars for table

    echo "| \`$filename\` | $hr_size | $summary |"
  done

  # Note any non-markdown files
  non_md=$(find "$KNOWLEDGE_DIR" -maxdepth 1 -type f -not -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  if (( non_md > 0 )); then
    echo ""
    echo "**Also contains $non_md non-markdown files** (images, etc.) — read only when needed."
  fi

  # Note subdirectories
  subdirs=$(find "$KNOWLEDGE_DIR" -maxdepth 1 -type d -not -path "$KNOWLEDGE_DIR" 2>/dev/null | wc -l | tr -d ' ')
  if (( subdirs > 0 )); then
    echo ""
    echo "**Contains $subdirs subdirectories** — browse only when needed."
  fi

} > "$INDEX_FILE"

echo "Generated $INDEX_FILE"
wc -c "$INDEX_FILE"
