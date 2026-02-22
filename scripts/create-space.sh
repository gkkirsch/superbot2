#!/bin/bash
# create-space.sh - Scaffold a new space with all required files
# Usage: create-space.sh <slug> <name> [options]
#
# Options:
#   --code-dir <path>    External codebase path (default: spaces/<slug>/app)
#   --description "text"
#
# Examples:
#   create-space.sh myapp "My App" --description "A web application"
#   create-space.sh myapp "My App" --code-dir ~/projects/myapp

set -uo pipefail

SLUG="${1:-}"
NAME="${2:-}"
shift 2 2>/dev/null || true

if [[ -z "$SLUG" || -z "$NAME" ]]; then
  echo "Usage: create-space.sh <slug> <name> [--code-dir <path>] [--description \"text\"]" >&2
  exit 1
fi

CODE_DIR=""
DESCRIPTION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --code-dir) CODE_DIR="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}/spaces/$SLUG"

if [[ -d "$DIR" ]]; then
  echo "Space '$SLUG' already exists at $DIR" >&2
  exit 1
fi

mkdir -p "$DIR"/{knowledge,plans,app}

if [[ -n "$CODE_DIR" ]]; then
  cat > "$DIR/space.json" << EOF
{
  "name": "$NAME",
  "slug": "$SLUG",
  "status": "active",
  "codeDir": "$CODE_DIR"
}
EOF
else
  cat > "$DIR/space.json" << EOF
{
  "name": "$NAME",
  "slug": "$SLUG",
  "status": "active"
}
EOF
fi

if [[ -n "$DESCRIPTION" ]]; then
  cat > "$DIR/OVERVIEW.md" << EOF
# $NAME

$DESCRIPTION
EOF
else
  cat > "$DIR/OVERVIEW.md" << EOF
# $NAME

No description yet.
EOF
fi

for file in conventions decisions patterns; do
  title=$(echo "$file" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')
  cat > "$DIR/knowledge/$file.md" << EOF
# $title

No ${file} recorded yet.
EOF
done

echo "Created space: $SLUG ($DIR)"
