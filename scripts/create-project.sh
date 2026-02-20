#!/bin/bash
# create-project.sh - Scaffold a new project within a space
# Usage: create-project.sh <space-slug> <project-name>
#
# Example: create-project.sh myapp add-auth

set -uo pipefail

SPACE="${1:-}"
PROJECT="${2:-}"

if [[ -z "$SPACE" || -z "$PROJECT" ]]; then
  echo "Usage: create-project.sh <space-slug> <project-name>" >&2
  exit 1
fi

SPACE_DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}/spaces/$SPACE"

if [[ ! -d "$SPACE_DIR" ]]; then
  echo "Space '$SPACE' does not exist at $SPACE_DIR" >&2
  exit 1
fi

PROJECT_DIR="$SPACE_DIR/plans/$PROJECT"

if [[ -d "$PROJECT_DIR" ]]; then
  echo "Project '$PROJECT' already exists in space '$SPACE'" >&2
  exit 1
fi

mkdir -p "$PROJECT_DIR/tasks"

echo "Created project: $SPACE/$PROJECT ($PROJECT_DIR)"
