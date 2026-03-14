---
name: superbot-browser
description: >
  Browser automation using the superbot2 Chrome profile via CDP.
  The superbot2 profile is a real Chrome profile with persistent authenticated sessions.
  Use when you need to automate web interactions that require authenticated sessions.
  Triggers: "automate browser", "navigate to", "fill out form on", "click button on",
  "extract data from website", "take screenshot of page", "browser", "agent-browser".
  NOT for: headless scraping without auth, raw Playwright scripts.
allowed-tools: Bash(agent-browser:*), Bash(npx agent-browser:*)
argument-hint: "[port]  # e.g. /superbot-browser 9223 — defaults to 9222"
---

# Browser Automation with agent-browser + superbot2 Chrome Profile

<!-- Port setup: use $ARGUMENTS if it's a number, otherwise default to 9222 -->
```bash
PORT=${ARGUMENTS:-9222}
if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then PORT=9222; fi
```

The superbot2 browser profile lives at `~/.superbot2/browser/` with all authenticated sessions persisted. Run `setup.sh` once to start Chrome with CDP, then use `agent-browser --cdp $PORT` for all automation.

## Standard Startup

```bash
# If CDP isn't already running, launch Chrome with the superbot2 profile
bash ~/.superbot2/.claude/skills/superbot-browser/templates/setup.sh

# Or manually:
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$HOME/.superbot2/browser" \
  --remote-debugging-port=$PORT \
  --no-first-run \
  --no-default-browser-check \
  "about:blank" &

sleep 5
curl -s http://localhost:$PORT/json/version | python3 -c "import json,sys; print('✅ CDP ready:', json.load(sys.stdin)['Browser'])"

# Open a tab and navigate
curl -s -X PUT "http://localhost:$PORT/json/new?https://your-target-url.com" > /dev/null
sleep 3
```

## Core Workflow

```bash
# Navigate
agent-browser --cdp $PORT open "https://example.com"

# Snapshot interactive elements
agent-browser --cdp $PORT snapshot -i

# Interact using @refs from snapshot
agent-browser --cdp $PORT click @e1
agent-browser --cdp $PORT fill @e2 "text"
agent-browser --cdp $PORT select @e3 "option value"

# Re-snapshot after any DOM change
agent-browser --cdp $PORT snapshot -i

# Screenshot for debugging
agent-browser --cdp $PORT screenshot ~/.superbot2/uploads/shot.png
```

**Every command needs `--cdp $PORT`.**

## Essential Commands

```bash
# Navigation
agent-browser --cdp $PORT open <url>
agent-browser --cdp $PORT get url
agent-browser --cdp $PORT get title

# Snapshot
agent-browser --cdp $PORT snapshot -i           # Interactive elements with @refs
agent-browser --cdp $PORT snapshot -i -C        # Include cursor-interactive (onclick divs)
agent-browser --cdp $PORT snapshot -i -c        # Compact (remove empty elements)

# Interaction
agent-browser --cdp $PORT click @e1
agent-browser --cdp $PORT fill @e2 "text"
agent-browser --cdp $PORT type @e2 "text"       # Type without clearing
agent-browser --cdp $PORT select @e1 "option"
agent-browser --cdp $PORT check @e1
agent-browser --cdp $PORT press Enter
agent-browser --cdp $PORT scroll down 500
agent-browser --cdp $PORT find text "Submit" click

# Info
agent-browser --cdp $PORT get text @e1
agent-browser --cdp $PORT get value @e1

# Wait
agent-browser --cdp $PORT wait 3000
agent-browser --cdp $PORT wait @e1

# Screenshot — save to uploads/ so dashboard can render it
agent-browser --cdp $PORT screenshot ~/.superbot2/uploads/shot.png
agent-browser --cdp $PORT screenshot --full ~/.superbot2/uploads/shot.png
```

## Launching Additional Chrome Instances

To run multiple browser sessions in parallel, launch extra Chrome instances on different ports. Each needs its own `--user-data-dir` or they conflict.

**Port 9222** = main authenticated profile (your real Chrome with logins)
**Port 9223+** = clean test profiles (fresh, no cookies, good for testing)

The `/tmp/chrome-test-XXXX` dirs are throwaway — they disappear on reboot.

```bash
# Launch a clean test browser on port 9223
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9223 \
  --user-data-dir=/tmp/chrome-test-9223 \
  --no-first-run \
  --no-default-browser-check &
```

```bash
# Launch a clean test browser on port 9224
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9224 \
  --user-data-dir=/tmp/chrome-test-9224 \
  --no-first-run \
  --no-default-browser-check &
```

Then invoke this skill with the port: `/superbot-browser 9223`

## Profile Details

| Item | Value |
|------|-------|
| Profile location | `~/.superbot2/browser/Default/` |
| First-time setup | `bash templates/init.sh` |
| Session startup | `bash templates/setup.sh` (idempotent — no-op if CDP already running) |
| CDP port (default) | `9222` |
| CDP port (custom) | Pass as argument: `/superbot-browser 9223` |

## Gotchas

### 1. Create a tab via curl before using agent-browser
CDP starts with no page targets. You MUST create a tab first:
```bash
curl -s -X PUT "http://localhost:$PORT/json/new?https://your-url.com" > /dev/null
sleep 3
```

### 2. Snapshot refs go stale after DOM changes
Always re-snapshot after clicking, navigating, or opening modals.

### 3. Combobox dropdowns need to be opened first
SPAs use custom dropdowns. Click to open, re-snapshot to get option refs, then click the option:
```bash
agent-browser --cdp $PORT click @e_dropdown   # opens dropdown
agent-browser --cdp $PORT snapshot -i          # get refs for options
agent-browser --cdp $PORT click @e_option      # click the option
```

### 4. `wait --load networkidle` times out on SPAs
Use `wait 3000` or `wait 5000` instead.

### 5. Social media session limits
Facebook: ~6-8 comments per session before throttling kicks in.

## Companion: chrome-devtools-mcp

The `chrome-devtools-mcp` MCP server connects to the **same Chrome instance** on port 9222 and provides DevTools capabilities that complement superbot-browser:

| Tool | What it does |
|------|-------------|
| `take_snapshot` | Accessibility tree snapshot of the page |
| `take_screenshot` | Capture visual output |
| `navigate_page` | Load URLs |
| `evaluate_script` | Run JavaScript in the page |
| `list_console_messages` | View console output with source-mapped stack traces |
| `list_network_requests` | Inspect network activity (404s, 500s, CORS issues) |
| `performance_start_trace` | Start a performance trace |
| `performance_stop_trace` | Stop and save a performance trace |
| `performance_analyze_insight` | Extract metrics (LCP, TBT, etc.) |
| `get_lighthouse_score` | Lighthouse audits (accessibility, SEO, best practices) |

### When to use which tool

- **superbot-browser (agent-browser)**: Navigation, clicking, form filling, social media automation — anything that interacts with the page as a user would.
- **chrome-devtools-mcp**: Performance profiling, Lighthouse audits, network inspection, console debugging — anything that inspects the page from a developer perspective.

### Using both together

Both tools share the same Chrome instance on port 9222. They do not conflict.

Typical workflow:
1. Use `agent-browser` to navigate and interact with the page
2. Use chrome-devtools-mcp tools to inspect performance, run audits, or debug

```bash
# 1. Navigate with superbot-browser
agent-browser --cdp 9222 open "https://your-site.com"

# 2. Then use chrome-devtools-mcp MCP tools (available as mcp__chrome-devtools__* tools):
#    - mcp__chrome-devtools__take_screenshot
#    - mcp__chrome-devtools__list_network_requests
#    - mcp__chrome-devtools__get_lighthouse_score
#    - mcp__chrome-devtools__performance_start_trace / performance_stop_trace
```

### Configuration

chrome-devtools-mcp is configured as an MCP server in `.mcp.json` at the project root. It auto-connects to Chrome on port 9222 via `--browserUrl`.

### Gotcha: Don't open Chrome DevTools UI

Opening the Chrome DevTools UI (F12 / Cmd+Opt+I) while chrome-devtools-mcp is connected will crash Chrome. Use the MCP tools instead.

## Deep-Dive Documentation

| Reference | When to Use |
|-----------|-------------|
| [references/commands.md](references/commands.md) | Full command reference |
| [references/patterns.md](references/patterns.md) | Common automation patterns |
| [references/troubleshooting.md](references/troubleshooting.md) | What to do when things break |
| [references/social-media.md](references/social-media.md) | Facebook, Instagram, X tips |

## Ready-to-Use Templates

| Template | Description |
|----------|-------------|
| [templates/init.sh](templates/init.sh) | **One-time setup** — creates the browser profile at `~/.superbot2/browser/` |
| [templates/setup.sh](templates/setup.sh) | **Session startup** — launches Chrome with CDP if not already running |
| [templates/google-oauth.sh](templates/google-oauth.sh) | Navigate to Google services |
