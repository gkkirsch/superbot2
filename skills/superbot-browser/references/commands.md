# Command Reference (CDP Mode)

All commands require `--cdp 9222`. This is not optional.

## Tab Creation (via CDP HTTP API)

Before using agent-browser, create a tab in Chrome:

```bash
# Create a new tab navigated to a URL (MUST use PUT)
curl -s -X PUT "http://localhost:9222/json/new?https://example.com"

# List all CDP targets
curl -s http://localhost:9222/json/list

# Close a tab by ID (don't close the last one)
curl -s -X PUT "http://localhost:9222/json/close/TAB_ID"
```

## Navigation

### open

Navigate the current tab to a URL.

```bash
npx agent-browser --cdp 9222 open "https://example.com"
npx agent-browser --cdp 9222 open "https://console.cloud.google.com/apis/library?project=my-project"
```

Aliases: `goto`, `navigate`

## Snapshot

### snapshot

Get a structured view of the page with element references.

```bash
# Interactive elements only (recommended default)
npx agent-browser --cdp 9222 snapshot -i

# Include cursor-interactive elements (divs with onclick, cursor:pointer)
npx agent-browser --cdp 9222 snapshot -i -C

# Scope to a CSS selector
npx agent-browser --cdp 9222 snapshot -s "#main-content"

# JSON output for parsing
npx agent-browser --cdp 9222 snapshot -i --json
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
npx agent-browser --cdp 9222 click @e1
npx agent-browser --cdp 9222 click @e1 --new-tab    # Open link in new tab
```

### fill

Clear the field and type new text. Use for text inputs, textareas, search boxes.

```bash
npx agent-browser --cdp 9222 fill @e2 "user@example.com"
npx agent-browser --cdp 9222 fill @e3 "my search query"
```

### type

Type text without clearing the field first. Use when appending to existing content.

```bash
npx agent-browser --cdp 9222 type @e2 "additional text"
```

### select

Select an option from a dropdown.

```bash
npx agent-browser --cdp 9222 select @e4 "California"
npx agent-browser --cdp 9222 select @e4 "us-west-1"
```

### check

Check or toggle a checkbox.

```bash
npx agent-browser --cdp 9222 check @e5
```

### press

Press a keyboard key.

```bash
npx agent-browser --cdp 9222 press Enter
npx agent-browser --cdp 9222 press Tab
npx agent-browser --cdp 9222 press Escape
npx agent-browser --cdp 9222 press ArrowDown
```

### scroll

Scroll the page.

```bash
npx agent-browser --cdp 9222 scroll down 500
npx agent-browser --cdp 9222 scroll up 300
```

## Getters

### get text

Get the text content of an element.

```bash
npx agent-browser --cdp 9222 get text @e1
npx agent-browser --cdp 9222 get text body > /tmp/page.txt    # Full page text
```

### get value

Get the current value of an input field. Essential for extracting form data, API keys, etc.

```bash
npx agent-browser --cdp 9222 get value @e3
# Output: AIzaSyCQYjsa0zZdWwhM70SwDbXTGE2T25SdjHA
```

### get url

Get the current page URL.

```bash
npx agent-browser --cdp 9222 get url
```

### get title

Get the current page title.

```bash
npx agent-browser --cdp 9222 get title
```

## Wait

### Wait for element

```bash
npx agent-browser --cdp 9222 wait @e1
npx agent-browser --cdp 9222 wait "#content"
```

### Wait fixed duration (milliseconds)

Use this instead of `--load networkidle` for heavy SPAs.

```bash
npx agent-browser --cdp 9222 wait 3000
npx agent-browser --cdp 9222 wait 5000
```

### Wait for URL pattern

Useful after redirects or form submissions.

```bash
npx agent-browser --cdp 9222 wait --url "**/dashboard"
npx agent-browser --cdp 9222 wait --url "**/success"
```

### Wait for network idle

Works for simple pages. Avoid on heavy SPAs (GCP Console, etc.).

```bash
npx agent-browser --cdp 9222 wait --load networkidle
```

## Capture

### screenshot

```bash
npx agent-browser --cdp 9222 screenshot                        # To temp directory
npx agent-browser --cdp 9222 screenshot /tmp/screenshot.png     # To specific path
npx agent-browser --cdp 9222 screenshot --full                  # Full page
```

### pdf

```bash
npx agent-browser --cdp 9222 pdf /tmp/output.pdf
```

## Tab Management

### tab close

Close the current CDP tab. **Never close the last tab** — it will fail.

```bash
npx agent-browser --cdp 9222 tab close
```

## Semantic Locators

When refs are unavailable or you want to find elements by their visible properties:

```bash
# Find by visible text and click
npx agent-browser --cdp 9222 find text "Sign In" click

# Find by label and fill
npx agent-browser --cdp 9222 find label "Email" fill "user@test.com"

# Find by ARIA role
npx agent-browser --cdp 9222 find role button click --name "Submit"

# Find by placeholder
npx agent-browser --cdp 9222 find placeholder "Search" type "query"

# Find by test ID
npx agent-browser --cdp 9222 find testid "submit-btn" click
```

## JavaScript Evaluation

Run JavaScript in the browser context. Use `--stdin` for complex expressions to avoid shell quoting issues.

### Simple expressions

```bash
npx agent-browser --cdp 9222 eval 'document.title'
npx agent-browser --cdp 9222 eval 'document.querySelectorAll("img").length'
```

### Complex expressions (use --stdin)

```bash
npx agent-browser --cdp 9222 eval --stdin <<'EVALEOF'
JSON.stringify(
  Array.from(document.querySelectorAll("a"))
    .map(a => ({ text: a.textContent.trim(), href: a.href }))
    .filter(a => a.text.length > 0)
)
EVALEOF
```

### Base64 encoded (avoids all shell escaping)

```bash
npx agent-browser --cdp 9222 eval -b "$(echo -n 'document.title' | base64)"
```

## Command Chaining

Commands can be chained with `&&` when you don't need intermediate output:

```bash
# Navigate and wait
npx agent-browser --cdp 9222 open "https://example.com" && npx agent-browser --cdp 9222 wait 3000

# Fill multiple fields
npx agent-browser --cdp 9222 fill @e1 "Jane" && npx agent-browser --cdp 9222 fill @e2 "jane@example.com"
```

Run commands separately when you need to parse snapshot output to discover refs.
