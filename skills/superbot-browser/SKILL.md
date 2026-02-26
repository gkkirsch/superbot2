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
---

# Browser Automation with agent-browser + superbot2 Chrome Profile

The superbot2 Chrome profile lives inside the real Chrome app and has all sessions (Cloudflare, Facebook, Tami Browning Instagram, etc.) already logged in.

**Always use CDP mode** — connect to real Chrome running with the superbot2 profile. This is the only reliable way to access the saved sessions.

## Standard Startup

```bash
# Step 1: Copy superbot2 profile to temp dir (Chrome requires non-default --user-data-dir for CDP)
rm -rf /tmp/chrome-superbot2
mkdir -p /tmp/chrome-superbot2/Default
cp -r "$HOME/Library/Application Support/Google/Chrome/superbot2/." /tmp/chrome-superbot2/Default/

# Step 2: Launch real Chrome with CDP (must not be running already)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="/tmp/chrome-superbot2" \
  --remote-debugging-port=9222 \
  --no-first-run \
  --no-default-browser-check \
  "about:blank" &

# Step 3: Wait for CDP to be ready
sleep 5
curl -s http://localhost:9222/json/version | python3 -c "import json,sys; print('✅ CDP ready:', json.load(sys.stdin)['Browser'])"

# Step 4: Create a tab and navigate
curl -s -X PUT "http://localhost:9222/json/new?https://your-target-url.com" > /dev/null
sleep 3
```

## Core Workflow

```bash
# Navigate
agent-browser --cdp 9222 open "https://example.com"

# Snapshot interactive elements
agent-browser --cdp 9222 snapshot -i

# Interact using @refs from snapshot
agent-browser --cdp 9222 click @e1
agent-browser --cdp 9222 fill @e2 "text"
agent-browser --cdp 9222 select @e3 "option value"

# Re-snapshot after any DOM change
agent-browser --cdp 9222 snapshot -i

# Screenshot for debugging
agent-browser --cdp 9222 screenshot ~/.superbot2/uploads/shot.png
```

**Every command needs `--cdp 9222`.**

## Essential Commands

```bash
# Navigation
agent-browser --cdp 9222 open <url>
agent-browser --cdp 9222 get url
agent-browser --cdp 9222 get title

# Snapshot
agent-browser --cdp 9222 snapshot -i           # Interactive elements with @refs
agent-browser --cdp 9222 snapshot -i -C        # Include cursor-interactive (onclick divs)
agent-browser --cdp 9222 snapshot -i -c        # Compact (remove empty elements)

# Interaction
agent-browser --cdp 9222 click @e1
agent-browser --cdp 9222 fill @e2 "text"
agent-browser --cdp 9222 type @e2 "text"       # Type without clearing
agent-browser --cdp 9222 select @e1 "option"
agent-browser --cdp 9222 check @e1
agent-browser --cdp 9222 press Enter
agent-browser --cdp 9222 scroll down 500
agent-browser --cdp 9222 find text "Submit" click

# Info
agent-browser --cdp 9222 get text @e1
agent-browser --cdp 9222 get value @e1

# Wait
agent-browser --cdp 9222 wait 3000
agent-browser --cdp 9222 wait @e1

# Screenshot — save to uploads/ so dashboard can render it
agent-browser --cdp 9222 screenshot ~/.superbot2/uploads/shot.png
agent-browser --cdp 9222 screenshot --full ~/.superbot2/uploads/shot.png
```

## Profile Details

| Item | Value |
|------|-------|
| Profile location | `~/Library/Application Support/Google/Chrome/superbot2` |
| Setup script | `~/.superbot2/scripts/setup-superbot-chrome.sh` |
| Open script | `~/.superbot2/scripts/open-superbot-chrome.sh` |
| CDP port | `9222` |

## Gotchas

### 1. Chrome must be quit before launching with CDP
If Chrome is already running, `--remote-debugging-port` is ignored (single-instance). Quit Chrome first:
```bash
osascript -e 'quit app "Google Chrome"'
sleep 2
```

### 2. Must use temp --user-data-dir
Chrome blocks CDP on its default data directory. Copy the profile to `/tmp/chrome-superbot2` first (see Standard Startup above).

### 3. Create a tab via curl before using agent-browser
CDP starts with no page targets. You MUST create a tab first:
```bash
curl -s -X PUT "http://localhost:9222/json/new?https://your-url.com" > /dev/null
sleep 3
```

### 4. Snapshot refs go stale after DOM changes
Always re-snapshot after clicking, navigating, or opening modals.

### 5. Combobox dropdowns need to be opened first
Cloudflare and similar SPAs use custom dropdowns. Click the element to open it, then snapshot to find refs inside, then select:
```bash
agent-browser --cdp 9222 click @e_dropdown   # opens dropdown
agent-browser --cdp 9222 snapshot -i          # get refs for options
agent-browser --cdp 9222 click @e_option      # click the option
```

### 6. `wait --load networkidle` times out on SPAs
Use `wait 3000` or `wait 5000` instead.

### 7. Social media session limits
Facebook: ~6-8 comments per session before profile-switch modals appear.

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
| [templates/setup.sh](templates/setup.sh) | Launch Chrome with superbot2 profile + CDP (run before any automation session) |
| [templates/google-oauth.sh](templates/google-oauth.sh) | Navigate to Google services |

> **First-time setup**: Run `~/.superbot2/scripts/setup-superbot-chrome.sh` once to create the Chrome profile. After that, use `templates/setup.sh` or `~/.superbot2/scripts/open-superbot-chrome.sh` to launch Chrome with CDP before each automation session.
