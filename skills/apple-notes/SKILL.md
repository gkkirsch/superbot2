---
name: apple-notes
description: >
  Read and write Apple Notes programmatically via CLI.
  Two layers: SQLite+protobuf for fast reads, AppleScript for CloudKit-safe writes.
  Use when you need to create, read, search, update, or delete Apple Notes.
  Supports rich text (bold, italic, headings, lists, tables, links, code blocks) via HTML body.
  Triggers: "apple notes", "create a note", "read my notes", "search notes", "add to note",
  "list notes", "note attachments", "checklists", "move note", "delete note".
  NOT for: iCloud web API, third-party note apps, iOS-only features.
---

# Apple Notes CLI

Read and write Apple Notes from the command line. Used by superbot2 agents to interact with the user's local Apple Notes database.

## Architecture

- **Read layer**: Direct SQLite + protobuf parsing. Opens `NoteStore.sqlite` in read-only mode, decompresses gzipped protobuf blobs, extracts text, formatting, checklists, and attachment metadata. Fast and reliable.
- **Write layer**: AppleScript via `osascript`. Creates/modifies notes through Notes.app for CloudKit-safe syncing. Slower but required — never write directly to SQLite.

## Setup

The CLI is ready to use. No setup needed.

```
Tool location: /Users/jeff/.superbot2/spaces/apple-notes/app/notes-cli
```

- Embedded Python venv at `/Users/jeff/.superbot2/spaces/apple-notes/app/.venv/`
- Auto-activates on run — just call the binary directly
- All output is JSON by default (for agent consumption)
- Errors go to stderr as `{"error": "message"}`

For all examples below, use the full path:

```bash
NOTES=/Users/jeff/.superbot2/spaces/apple-notes/app/notes-cli
```

## Command Reference

### Reading Commands

#### `list` — List notes

```bash
$NOTES list                          # All notes (JSON)
$NOTES list --human                  # Human-readable table
$NOTES list --folder "Work"          # Filter by folder
$NOTES list --limit 10               # Limit results
$NOTES list --pinned                 # Pinned notes only
$NOTES list --include-deleted        # Include Recently Deleted
```

#### `read` — Read a note's content

Accepts both integer Z_PK and UUID identifiers (auto-detected).

```bash
$NOTES read 42                       # By integer ID (JSON with metadata + content)
$NOTES read "ABC-DEF-123"            # By UUID
$NOTES read 42 --format text         # Plain text only
$NOTES read 42 --format markdown     # Markdown
$NOTES read 42 --format html         # HTML
```

#### `search` — Search notes by text

```bash
$NOTES search "meeting agenda"                    # Search all notes
$NOTES search "project" --folder "Work"           # Search within folder
$NOTES search "old stuff" --include-deleted        # Include deleted notes
```

#### `folders` — List all folders

```bash
$NOTES folders
```

#### `attachments` — List attachments for a note

```bash
$NOTES attachments 42               # List all attachments on note 42
```

Returns type (image, audio, PDF, etc.), filename, and identifier for each attachment.

#### `extract` — Extract an attachment to disk

```bash
$NOTES extract "ATTACHMENT-UUID"                      # Extract to current directory
$NOTES extract "ATTACHMENT-UUID" --output /tmp/photo.jpg   # Extract to specific path
```

#### `checklists` — Show checklist items with completion status

```bash
$NOTES checklists 42                # Show all checklist items for note 42
```

Returns each item's text and done/not-done state. Items are grouped by checklist UUID.

### Writing Commands

All write commands use AppleScript and require macOS Automation permission for Notes.app (already granted).

#### `create` — Create a new note

```bash
$NOTES create --folder "Work" --title "Meeting Notes" --body "Discussion points for Monday"
$NOTES create --folder "Work" --title "Status" --body "<h1>Status</h1><p><b>On track</b></p>" --format html
$NOTES create --folder "Personal" --title "Ideas" --body "# Big Idea\n\n- Point one\n- Point two" --format markdown
```

The `--format` flag controls how the body is interpreted: `text` (default), `html`, or `markdown`.

#### `append` — Append content to an existing note

```bash
$NOTES append 42 --body "New paragraph added at the bottom"
$NOTES append 42 --body "<p><b>Important update</b></p>" --format html
```

#### `move` — Move a note to a different folder

```bash
$NOTES move 42 --folder "Archive"
```

#### `delete` — Delete a note (moves to Recently Deleted)

```bash
$NOTES delete 42
```

The note is not permanently destroyed — it moves to Recently Deleted where Apple auto-purges it after 30 days.

## Rich Text via HTML Body

When using `--format html` with `create` or `append`, Apple Notes renders a subset of HTML natively. This is the primary way to create formatted notes.

### What Works

| HTML | Result |
|------|--------|
| `<b>text</b>` | **Bold** |
| `<i>text</i>` | *Italic* |
| `<u>text</u>` | Underline |
| `<s>text</s>` | Strikethrough |
| `<b><i>text</i></b>` | Bold-italic (combined) |
| `<code>text</code>` | Monospace (Courier font) |
| `<h1>`, `<h2>`, `<h3>` | Headings (the first `<h1>` becomes the note title) |
| `<ul><li>` | Bullet list |
| `<ol><li>` | Numbered list |
| `<a href="url">text</a>` | Hyperlink |
| `<table><tr><td>` | Native Notes table |
| `<span style="color: red;">` | Colored text |
| `<span style="font-size: 24px;">` | Font size |
| `<pre><code>` | Code block (Courier 12pt) |
| `<hr>` | Horizontal rule |

Mixed inline formatting works: `<p><b>Bold</b> and <i>italic</i> in one line</p>`

### What Does NOT Work

- **Checklists** — `<input type="checkbox">` does NOT create native checklists. Renders as text without checkbox functionality. Native checklists require protobuf-level checklist UUIDs and cannot be created via HTML.
- **Block quotes** — `<blockquote>` renders as plain text with no indentation.
- **Background highlights** — `background-color` style has no visible effect.
- **Small font sizes** — `font-size: 12px` and below are not visibly different from default.
- **Images/attachments** — Cannot be added programmatically. Read/extract only.
- **Audio recordings** — Read-only.
- **Note links** — Inter-note links (links from one note to another) are not supported via HTML.
- **Drawings** — Read-only.

## Common Patterns

### Create a richly formatted note

```bash
$NOTES create --folder "Work" --title "Sprint Review" --format html --body "$(cat <<'HTML'
<h1>Sprint Review</h1>
<h2>Completed</h2>
<ul>
  <li><b>Auth module</b> — OAuth2 flow working</li>
  <li><i>Database migration</i> — schema v3 deployed</li>
</ul>
<h2>Metrics</h2>
<table>
  <tr><td>Velocity</td><td>42 pts</td></tr>
  <tr><td>Bug count</td><td>3</td></tr>
</table>
<p>Next sprint: <a href="https://jira.example.com/board/5">Board link</a></p>
HTML
)"
```

### Search and read a note

```bash
# Find a note by content
RESULT=$($NOTES search "grocery list")
# Parse the ID from JSON, then read it
NOTE_ID=$(echo "$RESULT" | python3 -c "import json,sys; notes=json.load(sys.stdin); print(notes[0]['id'])")
$NOTES read "$NOTE_ID" --format text
```

### Extract all images from a note

```bash
# List attachments
$NOTES attachments 42
# Extract specific ones (use the UUID from the attachments output)
$NOTES extract "UUID-FROM-OUTPUT" --output /tmp/photo1.jpg
```

### Append a status update to an existing note

```bash
$NOTES append 42 --format html --body "<hr><p><b>Update $(date +%Y-%m-%d)</b>: Deployment complete. All systems green.</p>"
```

### Direct AppleScript for advanced HTML body

When the CLI's create/append isn't flexible enough (e.g., replacing the entire body of an existing note), use AppleScript directly:

```bash
osascript <<'APPLESCRIPT'
tell application "Notes"
    set theNote to first note of folder "Work" whose name is "Status Dashboard"
    set body of theNote to "<h1>Status Dashboard</h1><p><b>Last updated:</b> 2025-01-15</p><table><tr><td>Service</td><td>Status</td></tr><tr><td>API</td><td><span style=\"color: green;\">UP</span></td></tr><tr><td>DB</td><td><span style=\"color: green;\">UP</span></td></tr></table>"
end tell
APPLESCRIPT
```

**Important**: When targeting notes by name after deletion, always scope to a specific folder (`first note of folder "FolderName" whose name is "NoteName"`) to avoid matching the deleted copy in Recently Deleted.

## Gotchas

1. **AppleScript is slow** — Write operations can take 30+ seconds. This is inherent to Notes.app automation. Only use AppleScript for writes, never for reads.
2. **First `<h1>` becomes the title** — When creating via HTML, the first `<h1>` tag sets the note's `ZTITLE1`.
3. **Note IDs** — Both integer Z_PK (e.g., `42`) and UUID strings (e.g., `"ABC-DEF-123"`) work everywhere. The CLI auto-detects which format you're using.
4. **JSON output** — All read commands output JSON by default. Use `--human` on `list` for terminal-friendly tables. Use `--format text` on `read` for plain text.
5. **Deleted notes excluded** — By default, deleted notes are filtered out. Pass `--include-deleted` to include them.
6. **Automation permission** — Write commands require macOS Automation permission for Notes.app. Already granted on this machine.
7. **AppleScript timeout** — Set to 120 seconds. Very large operations may still time out.
