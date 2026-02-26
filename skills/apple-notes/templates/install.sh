#!/usr/bin/env bash
set -euo pipefail

# Install notes-cli for the apple-notes skill.
# Creates a Python venv, installs dependencies, and sets up the executable wrapper.

APP_DIR="$HOME/.superbot2/spaces/apple-notes/app"
VENV_DIR="$APP_DIR/.venv"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$SCRIPT_DIR/bin/notes-cli.py"

echo "Installing notes-cli..."

# Verify source exists
if [ ! -f "$SOURCE" ]; then
    echo "Error: notes-cli.py not found at $SOURCE" >&2
    exit 1
fi

# Create app directory
mkdir -p "$APP_DIR"

# Create venv if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating Python venv at $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
fi

# Install dependencies
echo "Installing dependencies (click)..."
"$VENV_DIR/bin/pip" install --quiet --upgrade pip
"$VENV_DIR/bin/pip" install --quiet click

# Copy the source script
cp "$SOURCE" "$APP_DIR/notes-cli.py"
chmod +x "$APP_DIR/notes-cli.py"

# Create the wrapper script that auto-activates the venv
cat > "$APP_DIR/notes-cli" << 'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$SCRIPT_DIR/.venv/bin/python3" "$SCRIPT_DIR/notes-cli.py" "$@"
WRAPPER

chmod +x "$APP_DIR/notes-cli"

echo "notes-cli installed at $APP_DIR/notes-cli"
echo "Test with: $APP_DIR/notes-cli folders"
