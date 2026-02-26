# Command Reference

All commands assume `AGENT_BROWSER_PROFILE` is set to `~/.superbot2/browser/profile`. If not, add `--profile ~/.superbot2/browser/profile` to every command.

## Navigation

### open

Navigate the current page to a URL.

```bash
agent-browser open "https://example.com"
agent-browser open "https://console.cloud.google.com/apis/library?project=my-project"
```

Aliases: `goto`, `navigate`

### back / forward / reload

```bash
agent-browser back                    # Go back one page
agent-browser forward                 # Go forward one page
agent-browser reload                  # Reload current page
```

## Snapshot

### snapshot

Get a structured accessibility tree of the page with element references.

```bash
# Interactive elements only (recommended default)
agent-browser snapshot -i

# Compact — remove empty structural elements
agent-browser snapshot -i -c

# Scope to a CSS selector
agent-browser snapshot -s "#main-content"

# Limit tree depth
agent-browser snapshot -d 3

# JSON output for parsing
agent-browser snapshot -i --json
```

Output format:
```
@e1  button "Sign In"
@e2  textbox "Email"
@e3  link "Dashboard"
@e4  combobox "Select country"
```

**Always snapshot before interacting.** Refs are only valid until the DOM changes.

## Interaction

All interaction commands use `@eN` refs from the most recent snapshot.

### click

```bash
agent-browser click @e1               # Click element
agent-browser click @e1 --new-tab     # Open link in new tab
```

### dblclick

```bash
agent-browser dblclick @e1            # Double-click element
```

### fill

Clear the field and type new text. Use for text inputs, textareas, search boxes.

```bash
agent-browser fill @e2 "user@example.com"
agent-browser fill @e3 "my search query"
```

### type

Type text without clearing the field first. Use when appending to existing content.

```bash
agent-browser type @e2 "additional text"
```

### select

Select an option from a dropdown.

```bash
agent-browser select @e4 "California"
agent-browser select @e4 "us-west-1"
```

### check / uncheck

Toggle checkboxes.

```bash
agent-browser check @e5               # Check
agent-browser uncheck @e5             # Uncheck
```

### press

Press a keyboard key.

```bash
agent-browser press Enter
agent-browser press Tab
agent-browser press Escape
agent-browser press ArrowDown
agent-browser press Control+a         # Key combinations
```

### scroll

Scroll the page.

```bash
agent-browser scroll down 500
agent-browser scroll up 300
agent-browser scroll left 200
agent-browser scroll right 200
```

### scrollintoview

Scroll an element into the visible area.

```bash
agent-browser scrollintoview @e10
```

### hover

Hover over an element (triggers hover styles, tooltips, menus).

```bash
agent-browser hover @e1
```

### focus

Focus an element.

```bash
agent-browser focus @e2
```

### drag

Drag and drop between elements.

```bash
agent-browser drag @e1 @e5
```

### upload

Upload files to a file input.

```bash
agent-browser upload @e1 /path/to/file.pdf
agent-browser upload @e1 /path/to/file1.png /path/to/file2.png
```

### download

Download a file by clicking an element.

```bash
agent-browser download @e1 /tmp/downloaded-file.pdf
```

## Getters

### get text

Get the text content of an element.

```bash
agent-browser get text @e1
agent-browser get text body > /tmp/page.txt    # Full page text
```

### get value

Get the current value of an input field.

```bash
agent-browser get value @e3
```

### get url / get title

```bash
agent-browser get url
agent-browser get title
```

### get html

```bash
agent-browser get html @e1
```

### get attr

Get an element's attribute value.

```bash
agent-browser get attr href @e3
agent-browser get attr src @e5
```

### get count

Count matching elements.

```bash
agent-browser get count "table tbody tr"
```

### get box

Get an element's bounding box (x, y, width, height).

```bash
agent-browser get box @e1
```

### get styles

```bash
agent-browser get styles @e1
```

## State Checks

```bash
agent-browser is visible @e1
agent-browser is enabled @e2
agent-browser is checked @e5
```

## Wait

### Wait for element

```bash
agent-browser wait @e1
agent-browser wait "#content"
```

### Wait fixed duration (milliseconds)

Use this instead of `--load networkidle` for heavy SPAs.

```bash
agent-browser wait 3000
agent-browser wait 5000
```

### Wait for URL pattern

```bash
agent-browser wait --url "**/dashboard"
agent-browser wait --url "**/success"
```

### Wait for network idle

Works for simple pages. Avoid on heavy SPAs (GCP Console, Facebook, etc.).

```bash
agent-browser wait --load networkidle
```

## Semantic Locators (find)

When refs are unavailable or you want to find elements by visible properties:

```bash
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "user@test.com"
agent-browser find role button click --name "Submit"
agent-browser find placeholder "Search" type "query"
agent-browser find alt "Profile photo" click
agent-browser find title "Settings" click
agent-browser find testid "submit-btn" click
agent-browser find first "li" click
agent-browser find last "li" click
agent-browser find nth "li" 3 click
```

## Capture

### screenshot

```bash
agent-browser screenshot                                    # To temp directory
agent-browser screenshot ~/.superbot2/uploads/shot.png      # To uploads (recommended)
agent-browser screenshot /tmp/screenshot.png                # To specific path
agent-browser screenshot --full                             # Full page
```

### pdf

```bash
agent-browser pdf /tmp/output.pdf
```

## Tab Management

```bash
agent-browser tab new                  # Open new empty tab
agent-browser tab list                 # List all tabs
agent-browser tab 2                    # Switch to tab 2
agent-browser tab close                # Close current tab (not the last one)
```

## Mouse Control

Fine-grained mouse control for complex interactions.

```bash
agent-browser mouse move 100 200      # Move to coordinates
agent-browser mouse down               # Press mouse button
agent-browser mouse up                 # Release mouse button
agent-browser mouse wheel 300          # Scroll wheel (vertical)
agent-browser mouse wheel 0 200        # Scroll wheel (horizontal)
```

## Browser Settings

```bash
agent-browser set viewport 1920 1080           # Set viewport size
agent-browser set device "iPhone 15 Pro"       # Emulate device
agent-browser set geo 37.7749 -122.4194        # Set geolocation
agent-browser set offline on                    # Enable offline mode
agent-browser set offline off                   # Disable offline mode
agent-browser set headers '{"X-Custom":"val"}' # Set custom headers
agent-browser set credentials user pass         # HTTP auth credentials
agent-browser set media dark                    # Dark mode
agent-browser set media light                   # Light mode
```

## Network

```bash
agent-browser network route "**/*.png" --abort                    # Block images
agent-browser network route "**/api/v1/*" --body '{"mock":true}'  # Mock API
agent-browser network unroute                                      # Remove all routes
agent-browser network requests                                     # View requests
agent-browser network requests --filter "api"                     # Filter requests
agent-browser network requests --clear                             # Clear log
```

## Storage

```bash
agent-browser cookies get              # List all cookies
agent-browser cookies set --url "https://example.com" name value  # Set cookie
agent-browser cookies clear            # Clear all cookies
agent-browser storage local            # View localStorage
agent-browser storage session          # View sessionStorage
```

## JavaScript Evaluation

```bash
# Simple
agent-browser eval 'document.title'

# Complex (use --stdin to avoid shell quoting)
agent-browser eval --stdin <<'EVALEOF'
JSON.stringify(
  Array.from(document.querySelectorAll("a"))
    .map(a => ({ text: a.textContent.trim(), href: a.href }))
    .filter(a => a.text.length > 0)
)
EVALEOF

# Base64 encoded (avoids all shell escaping)
agent-browser eval -b "$(echo -n 'document.title' | base64)"
```

## Debug

```bash
agent-browser console                  # View console logs
agent-browser console --clear          # Clear console log
agent-browser errors                   # View page errors
agent-browser errors --clear           # Clear error log
agent-browser highlight @e1            # Highlight element visually
agent-browser trace start              # Start recording trace
agent-browser trace stop /tmp/trace    # Stop and save trace
agent-browser record start /tmp/vid    # Start video recording (WebM)
agent-browser record stop              # Stop and save video
```

## Sessions

```bash
agent-browser session                  # Show current session name
agent-browser session list             # List active sessions
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AGENT_BROWSER_PROFILE` | Persistent browser profile path (set to `~/.superbot2/browser/profile`) |
| `AGENT_BROWSER_SESSION` | Session name (default: "default") |
| `AGENT_BROWSER_SESSION_NAME` | Auto-save/restore state persistence name |
| `AGENT_BROWSER_ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM state encryption |
| `AGENT_BROWSER_STATE_EXPIRE_DAYS` | Auto-delete states older than N days (default: 30) |
| `AGENT_BROWSER_EXECUTABLE_PATH` | Custom browser executable path |
| `AGENT_BROWSER_AUTO_CONNECT` | Auto-discover and connect to running Chrome |
| `AGENT_BROWSER_USER_AGENT` | Custom User-Agent string |
| `AGENT_BROWSER_PROXY` | Proxy server URL |
| `AGENT_BROWSER_PROXY_BYPASS` | Bypass proxy for these hosts |

## Global Options

These flags work with any command:

```
--profile <path>           Persistent browser profile (or AGENT_BROWSER_PROFILE env)
--headed                   Show browser window
--json                     JSON output
--debug                    Debug output
--session <name>           Isolated session
--user-agent <ua>          Custom User-Agent
--proxy <server>           Proxy server
--ignore-https-errors      Ignore HTTPS certificate errors
--extension <path>         Load browser extension (repeatable)
--args <args>              Extra browser launch args (comma-separated)
```

## Command Chaining

Commands can be chained with `&&`:

```bash
agent-browser open "https://example.com" && agent-browser wait 3000
agent-browser fill @e1 "Jane" && agent-browser fill @e2 "jane@example.com"
```

Run commands separately when you need to parse snapshot output to discover refs.
