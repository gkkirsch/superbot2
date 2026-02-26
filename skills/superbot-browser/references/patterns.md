# Common Automation Patterns

All commands assume `AGENT_BROWSER_PROFILE` is set to `~/.superbot2/browser/profile`.

## Generic Patterns

### Login Flow

```bash
# 1. Navigate to login page
agent-browser open "https://app.example.com/login"
agent-browser wait 3000

# 2. Snapshot to find form fields
agent-browser snapshot -i
# @e1 textbox "Email", @e2 textbox "Password", @e3 button "Sign In"

# 3. Fill credentials and submit
agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "$PASSWORD"
agent-browser click @e3

# 4. Wait for redirect and verify
agent-browser wait --url "**/dashboard"
agent-browser snapshot -i
```

### Form Filling

```bash
agent-browser snapshot -i

# Text inputs
agent-browser fill @e1 "Jane Doe"
agent-browser fill @e2 "jane@example.com"

# Dropdowns
agent-browser select @e3 "California"

# Checkboxes
agent-browser check @e4

# Submit
agent-browser click @e5
agent-browser wait 3000
agent-browser snapshot -i  # Verify result
```

### Data Extraction

```bash
# Extract specific element text
agent-browser get text @e5

# Extract input values (API keys, generated tokens, etc.)
agent-browser get value @e3

# Extract structured data via JavaScript
agent-browser eval --stdin <<'EVALEOF'
JSON.stringify(
  Array.from(document.querySelectorAll("table tbody tr"))
    .map(row => {
      const cells = row.querySelectorAll("td");
      return { name: cells[0]?.textContent, value: cells[1]?.textContent };
    })
)
EVALEOF

# Save full page text
agent-browser get text body > /tmp/page-content.txt
```

### File Upload

```bash
agent-browser snapshot -i
# @e7  button "Choose File"
agent-browser upload @e7 /path/to/document.pdf
agent-browser wait 2000
agent-browser snapshot -i  # Verify upload
```

### Modal and Overlay Handling

Overlays (notifications, toasts, cookie banners) can block clicks on underlying elements.

```bash
# Approach 1: Dismiss the overlay
agent-browser snapshot -i
# Find the close/dismiss button
agent-browser click @e30  # "Close" or "Dismiss" button
agent-browser wait 1000
agent-browser snapshot -i  # Re-snapshot — refs are now stale

# Approach 2: Navigate directly via URL (bypass overlays entirely)
agent-browser open "https://app.example.com/target-page"
agent-browser wait 3000
agent-browser snapshot -i
```

### Pagination

```bash
while true; do
  agent-browser snapshot -i
  # ... extract data from current page ...

  # Look for "Next" button
  SNAPSHOT=$(agent-browser snapshot -i)
  if echo "$SNAPSHOT" | grep -q "Next"; then
    agent-browser find text "Next" click
    agent-browser wait 3000
  else
    break
  fi
done
```

### Screenshot for Verification

Always screenshot before and after critical actions:

```bash
# Before: capture current state
agent-browser screenshot ~/.superbot2/uploads/before-action.png

# Perform the action
agent-browser click @e13

# After: verify the result
agent-browser wait 3000
agent-browser screenshot ~/.superbot2/uploads/after-action.png
```

---

## Google OAuth Flow

When a site redirects to Google sign-in, the superbot2 profile handles it automatically since it's already logged into Google.

### Account Picker

If the user has multiple Google accounts, an account picker appears:

```bash
agent-browser snapshot -i
# @e1 button "user@gmail.com"
# @e2 button "work@company.com"
# @e3 link "Use another account"

agent-browser click @e1  # Select the correct account
agent-browser wait 3000
agent-browser snapshot -i
```

### Consent Screen

```bash
agent-browser snapshot -i
# @e5 button "Allow"
# @e6 button "Deny"

agent-browser click @e5  # Grant permission
agent-browser wait 3000
```

---

## Google Cloud Console (GCP)

Proven patterns for GCP Console automation.

### Navigate to GCP

```bash
agent-browser open "https://console.cloud.google.com/"
agent-browser wait 5000
agent-browser snapshot -i
# User lands on their default project dashboard, already authenticated
```

### Switch Projects

```bash
# Click project selector button
agent-browser click @e7
agent-browser wait 2000
agent-browser snapshot -i
# Dialog shows Recent/Starred/All tabs, search box, and project list

# Search for a project
agent-browser fill @e3 "my-project"

# Or click an existing project from the list
agent-browser click @e10
```

### Create a New Project

```bash
# Open project selector -> click "New project"
agent-browser click @e7
agent-browser wait 2000
agent-browser snapshot -i
agent-browser click @e2  # "New project" button

# Wait for the new project form
agent-browser wait 3000
agent-browser snapshot -i

# Fill project name
agent-browser fill @e16 "my-new-project"

# Screenshot to verify before creating
agent-browser screenshot ~/.superbot2/uploads/gcloud-newproject.png

# Click Create
agent-browser click @e22
agent-browser wait 5000

# Switch to the new project
agent-browser snapshot -i
agent-browser click @e33  # "Navigate to PROJECT_ID project"
agent-browser wait 3000
```

### Enable an API

Navigate directly to the API Library to avoid overlay issues:

```bash
agent-browser open "https://console.cloud.google.com/apis/library?project=PROJECT_ID"
agent-browser wait 5000
agent-browser snapshot -i

# Search for the API
agent-browser fill @e16 "YouTube Data API v3"
agent-browser press Enter
agent-browser wait 3000
agent-browser snapshot -i

# Click the API result
agent-browser click @e20

# Enable it
agent-browser wait 3000
agent-browser snapshot -i
agent-browser click @e15  # "enable this API"
agent-browser wait 5000
```

### Create API Key Credentials

```bash
# Navigate to Credentials page
agent-browser snapshot -i
agent-browser click @e19  # "Credentials" sidebar link

agent-browser wait 3000
agent-browser snapshot -i

# Click "Create credential" -> select "API key"
agent-browser click @e23  # "Create credential"
agent-browser wait 1500
agent-browser snapshot -i
agent-browser click @e43  # "API key" menu item

# Wait for the creation dialog
agent-browser wait 5000
agent-browser snapshot -i

# Click Create in the dialog
agent-browser click @e13

# Extract the generated API key
agent-browser wait 3000
agent-browser snapshot -i
agent-browser get value @e3  # "Your API key" textbox

# Close the dialog
agent-browser click @e6  # "Close"
```

**Important**: The exact `@eN` refs in these GCP examples are from a specific session. They WILL be different for you. Always snapshot and use the refs from YOUR snapshot output.
