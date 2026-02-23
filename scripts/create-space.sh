#!/bin/bash
# create-space.sh - Scaffold a new space with all required files
# Usage: create-space.sh <slug> <name> [options]
#
# Options:
#   --code-dir <path>    External codebase path (default: spaces/<slug>/app)
#   --description "text"
#   --dev-server         Add devServer config (auto-assigns port)
#   --port <number>      Dev server port (default: auto-assign next available)
#
# Examples:
#   create-space.sh myapp "My App" --description "A web application"
#   create-space.sh myapp "My App" --code-dir ~/projects/myapp
#   create-space.sh myapp "My App" --dev-server --description "A web app"

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
DEV_SERVER=""
PORT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --code-dir) CODE_DIR="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    --dev-server) DEV_SERVER="1"; shift ;;
    --port) PORT="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# --port implies --dev-server
if [[ -n "$PORT" ]]; then
  DEV_SERVER="1"
fi

DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}/spaces/$SLUG"

if [[ -d "$DIR" ]]; then
  echo "Space '$SLUG' already exists at $DIR" >&2
  exit 1
fi

mkdir -p "$DIR"/{knowledge,plans,app}

# Auto-assign dev server port if --dev-server but no --port
if [[ -n "$DEV_SERVER" && -z "$PORT" ]]; then
  SUPERBOT2_DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}"
  # Collect ports already used by existing spaces
  used_ports=$(for f in "$SUPERBOT2_DIR"/spaces/*/space.json; do
    [[ -f "$f" ]] && jq -r '.devServer.port // empty' "$f" 2>/dev/null
  done | sort -n)
  # Find next available port starting from 5173
  PORT=5173
  while echo "$used_ports" | grep -qw "$PORT" 2>/dev/null; do
    PORT=$((PORT + 1))
  done
fi

# Determine cwd for devServer
if [[ -n "$DEV_SERVER" ]]; then
  if [[ -n "$CODE_DIR" ]]; then
    DEV_CWD="$CODE_DIR"
  else
    DEV_CWD="$DIR/app"
  fi
fi

# Write space.json using python for safe JSON encoding
python3 -c "
import json, sys
space = {
    'name': sys.argv[1],
    'slug': sys.argv[2],
    'status': 'active'
}
if sys.argv[3]:
    space['codeDir'] = sys.argv[3]
if sys.argv[4]:
    space['devServer'] = {
        'command': 'npm run dev',
        'port': int(sys.argv[5]),
        'cwd': sys.argv[6]
    }
json.dump(space, open(sys.argv[7], 'w'), indent=2)
print()
" "$NAME" "$SLUG" "$CODE_DIR" "$DEV_SERVER" "${PORT:-0}" "${DEV_CWD:-}" "$DIR/space.json"

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
