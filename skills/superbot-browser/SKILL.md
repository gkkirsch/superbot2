---
name: superbot-browser
description: >
  Browser automation using agent-browser CLI with a persistent superbot2 profile.
  agent-browser manages its own Chromium browser — no need to launch Chrome separately.
  Sessions (cookies, logins, localStorage) persist across runs.
  Use when you need to automate web interactions — navigate sites, fill forms, click buttons,
  take screenshots, extract data, or interact with authenticated sessions.
  Triggers: "automate browser", "navigate to", "fill out form on", "click button on",
  "extract data from website", "take screenshot of page", "browser", "agent-browser".
  NOT for: headless scraping without auth, raw Playwright scripts.
allowed-tools: Bash(agent-browser:*), Bash(npx agent-browser:*)
---

# Browser Automation with agent-browser

agent-browser is a CLI tool that manages its own Chromium browser with a **persistent profile**. Log in once, and your sessions (cookies, localStorage, logins) persist across all future runs.

No need to launch Chrome separately. No ports to check. Just run commands.

## Profile Setup

The superbot2 browser profile lives at `~/.superbot2/browser/profile`. Set the env var so every command uses it automatically:

```bash
export AGENT_BROWSER_PROFILE="$HOME/.superbot2/browser/profile"
```

This env var should be in your shell profile (`~/.zshrc` or `~/.bashrc`). Once set, every `agent-browser` command uses the superbot2 profile without needing `--profile` on every call.

### First-Time Login

The first time you use the profile, log into your accounts with `--headed` so you can see the browser:

```bash
# Open browser visibly to log into accounts
agent-browser --headed open "https://accounts.google.com"
# Log in manually in the browser window
# Sessions persist — you won't need to log in again

# Verify: open a service that requires auth
agent-browser --headed open "https://console.cloud.google.com"
# If you see the dashboard (not a login page), you're set
```

After logging in once, all future commands (headed or headless) inherit those sessions.

## Core Workflow

Every browser automation follows this pattern:

```
1. Open URL        →  agent-browser open <url>
2. Snapshot        →  agent-browser snapshot -i
3. Interact        →  agent-browser click/fill/select @ref
4. Re-snapshot     →  agent-browser snapshot -i
```

### Step-by-Step

```bash
# 1. Navigate to your target
agent-browser open "https://example.com"

# 2. Wait for page to load (if needed for heavy pages)
agent-browser wait 3000

# 3. Snapshot to get interactive element refs
agent-browser snapshot -i
# Output:
# @e1  button "Sign In"
# @e2  textbox "Email"
# @e3  link "Dashboard"

# 4. Interact using refs from the snapshot
agent-browser click @e3
agent-browser fill @e2 "user@example.com"

# 5. Re-snapshot after any navigation or DOM change
agent-browser snapshot -i
```

## Essential Commands

```bash
# Navigation
agent-browser open <url>                    # Navigate to URL
agent-browser back                          # Go back
agent-browser forward                       # Go forward
agent-browser reload                        # Reload page

# Snapshot (always do this before interacting)
agent-browser snapshot -i                   # Interactive elements with refs
agent-browser snapshot -i -c                # Compact (remove empty elements)
agent-browser snapshot -s "#main"           # Scope to CSS selector

# Interaction (use @refs from snapshot)
agent-browser click @e1                     # Click element
agent-browser fill @e2 "text"               # Clear field and type
agent-browser type @e2 "text"               # Type without clearing
agent-browser select @e1 "option"           # Select dropdown option
agent-browser check @e1                     # Check checkbox
agent-browser uncheck @e1                   # Uncheck checkbox
agent-browser press Enter                   # Press key
agent-browser scroll down 500               # Scroll page
agent-browser hover @e1                     # Hover element

# Get information
agent-browser get text @e1                  # Element text
agent-browser get value @e1                 # Input value
agent-browser get url                       # Current URL
agent-browser get title                     # Page title

# Wait
agent-browser wait @e1                      # Wait for element
agent-browser wait 3000                     # Wait milliseconds
agent-browser wait --url "**/page"          # Wait for URL pattern

# Screenshots — save to ~/.superbot2/uploads/ so images render in dashboard
agent-browser screenshot ~/.superbot2/uploads/shot.png    # Recommended path
agent-browser screenshot /tmp/shot.png                     # Temp dir
agent-browser screenshot --full                            # Full page

# Semantic locators (when you don't have refs)
agent-browser find text "Sign In" click                    # Find by visible text
agent-browser find label "Email" fill "user@test.com"      # Find by label
agent-browser find role button click --name "Submit"       # Find by ARIA role
agent-browser find placeholder "Search" type "query"       # Find by placeholder

# Tab management
agent-browser tab new                       # New tab
agent-browser tab list                      # List tabs
agent-browser tab close                     # Close current tab
agent-browser tab 2                         # Switch to tab 2

# JavaScript evaluation
agent-browser eval 'document.title'         # Simple expression
agent-browser eval --stdin <<'EOF'          # Complex (avoids shell quoting)
JSON.stringify(Array.from(document.querySelectorAll("a")).map(a => a.href))
EOF
```

## Always Run Headed

**Always use `--headed`** so the browser window is visible. This makes automation easier to debug, handles CAPTCHAs and 2FA prompts, and lets you see exactly what's happening.

```bash
# Correct — always headed
agent-browser --headed open "https://example.com"

# Wrong — headless hides the browser, harder to debug
agent-browser open "https://example.com"
```

## Gotchas

### 1. Snapshot refs invalidate on DOM changes
After clicking a button that navigates, opens a modal, or loads new content, all `@eN` refs become stale. **Always re-snapshot after any action that changes the page.**

### 2. `wait --load networkidle` times out on heavy SPAs
Google Cloud Console, Facebook, and similar SPAs have continuous background requests. Use `wait 3000` or `wait 5000` instead.

### 3. Overlays block clicks
Notification toasts, cookie banners, and modal overlays can block clicks on underlying elements. Dismiss them first, or navigate directly via URL:
```bash
agent-browser open "https://console.cloud.google.com/apis/library?project=PROJECT_ID"
```

### 4. First run downloads Chromium
The first time agent-browser runs with a new profile, it may need to download Chromium. This is a one-time operation — subsequent runs are fast.

### 5. Profile env var is required
Without `AGENT_BROWSER_PROFILE` set (or `--profile` on every command), agent-browser uses a temporary profile that doesn't persist sessions. Always ensure the env var is set.

### 6. Social media session limits
Facebook allows ~6-8 comments per session before showing profile-switch modals. Plan short, focused sessions. See [references/social-media.md](references/social-media.md).

## Deep-Dive Documentation

| Reference | When to Use |
|-----------|-------------|
| [references/commands.md](references/commands.md) | Full command reference (40+ commands) |
| [references/patterns.md](references/patterns.md) | Common automation patterns (login, forms, Google/GCP) |
| [references/troubleshooting.md](references/troubleshooting.md) | What to do when things go wrong |
| [references/social-media.md](references/social-media.md) | Facebook, Instagram, X automation tips |

## Ready-to-Use Templates

| Template | Description |
|----------|-------------|
| [templates/setup.sh](templates/setup.sh) | First-time profile setup and login |
| [templates/google-oauth.sh](templates/google-oauth.sh) | Navigate to Google services with auth |
