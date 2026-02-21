# Common Automation Patterns

## Generic Patterns

### Login Flow

```bash
# 1. Navigate to login page
curl -s -X PUT "http://localhost:9222/json/new?https://app.example.com/login"
sleep 3

# 2. Snapshot to find form fields
npx agent-browser --cdp 9222 snapshot -i
# @e1 textbox "Email", @e2 textbox "Password", @e3 button "Sign In"

# 3. Fill credentials and submit
npx agent-browser --cdp 9222 fill @e1 "user@example.com"
npx agent-browser --cdp 9222 fill @e2 "$PASSWORD"
npx agent-browser --cdp 9222 click @e3

# 4. Wait for redirect and verify
npx agent-browser --cdp 9222 wait --url "**/dashboard"
npx agent-browser --cdp 9222 snapshot -i
```

### Form Filling

```bash
npx agent-browser --cdp 9222 snapshot -i

# Text inputs
npx agent-browser --cdp 9222 fill @e1 "Jane Doe"
npx agent-browser --cdp 9222 fill @e2 "jane@example.com"

# Dropdowns
npx agent-browser --cdp 9222 select @e3 "California"

# Checkboxes
npx agent-browser --cdp 9222 check @e4

# Submit
npx agent-browser --cdp 9222 click @e5
npx agent-browser --cdp 9222 wait 3000
npx agent-browser --cdp 9222 snapshot -i  # Verify result
```

### Data Extraction

```bash
# Extract specific element text
npx agent-browser --cdp 9222 get text @e5

# Extract input values (API keys, generated tokens, etc.)
npx agent-browser --cdp 9222 get value @e3

# Extract structured data via JavaScript
npx agent-browser --cdp 9222 eval --stdin <<'EVALEOF'
JSON.stringify(
  Array.from(document.querySelectorAll("table tbody tr"))
    .map(row => {
      const cells = row.querySelectorAll("td");
      return { name: cells[0]?.textContent, value: cells[1]?.textContent };
    })
)
EVALEOF

# Save full page text
npx agent-browser --cdp 9222 get text body > /tmp/page-content.txt
```

### Modal and Overlay Handling

Overlays (notifications, toasts, cookie banners) can block clicks on underlying elements.

```bash
# Approach 1: Dismiss the overlay
npx agent-browser --cdp 9222 snapshot -i
# Find the close/dismiss button
npx agent-browser --cdp 9222 click @e30  # "Close" or "Dismiss" button
npx agent-browser --cdp 9222 wait 1000
npx agent-browser --cdp 9222 snapshot -i  # Re-snapshot — refs are now stale

# Approach 2: Navigate directly via URL (bypass overlays entirely)
npx agent-browser --cdp 9222 open "https://app.example.com/target-page"
npx agent-browser --cdp 9222 wait 3000
npx agent-browser --cdp 9222 snapshot -i
```

### Pagination

```bash
while true; do
  npx agent-browser --cdp 9222 snapshot -i
  # ... extract data from current page ...

  # Look for "Next" button
  SNAPSHOT=$(npx agent-browser --cdp 9222 snapshot -i)
  if echo "$SNAPSHOT" | grep -q "Next"; then
    # Find and click Next (re-snapshot to get current refs)
    npx agent-browser --cdp 9222 find text "Next" click
    npx agent-browser --cdp 9222 wait 3000
  else
    break
  fi
done
```

### Screenshot for Verification

Always screenshot before and after critical actions:

```bash
# Before: capture current state
npx agent-browser --cdp 9222 screenshot /tmp/before-action.png

# Perform the action
npx agent-browser --cdp 9222 click @e13

# After: verify the result
npx agent-browser --cdp 9222 wait 3000
npx agent-browser --cdp 9222 screenshot /tmp/after-action.png
```

---

## Google OAuth Flow

When a site redirects to Google sign-in, the user's Chrome session handles it automatically since they're already logged into Google.

### Account Picker

If the user has multiple Google accounts, an account picker appears:

```bash
npx agent-browser --cdp 9222 snapshot -i
# Look for the correct account email
# @e1 button "user@gmail.com"
# @e2 button "work@company.com"
# @e3 link "Use another account"

npx agent-browser --cdp 9222 click @e1  # Select the correct account
npx agent-browser --cdp 9222 wait 3000
npx agent-browser --cdp 9222 snapshot -i
```

### Consent Screen

OAuth consent screens ask for permission to access user data:

```bash
npx agent-browser --cdp 9222 snapshot -i
# @e5 button "Allow"
# @e6 button "Deny"

npx agent-browser --cdp 9222 click @e5  # Grant permission
npx agent-browser --cdp 9222 wait 3000
```

---

## Google Cloud Console (GCP)

Proven patterns from actual GCP Console automation sessions.

### Navigate to GCP

```bash
curl -s -X PUT "http://localhost:9222/json/new?https://console.cloud.google.com/"
sleep 3
npx agent-browser --cdp 9222 snapshot -i
# User lands on their default project dashboard, already authenticated
```

### Switch Projects

```bash
# Click project selector button (text like "You're currently working in PROJECT_NAME")
npx agent-browser --cdp 9222 click @e7
npx agent-browser --cdp 9222 wait 2000
npx agent-browser --cdp 9222 snapshot -i
# Dialog shows Recent/Starred/All tabs, search box, and project list

# Search for a project
npx agent-browser --cdp 9222 fill @e3 "my-project"

# Or click an existing project from the list
npx agent-browser --cdp 9222 click @e10
```

### Create a New Project

```bash
# Open project selector → click "New project"
npx agent-browser --cdp 9222 click @e7
npx agent-browser --cdp 9222 wait 2000
npx agent-browser --cdp 9222 snapshot -i
npx agent-browser --cdp 9222 click @e2  # "New project" button

# Wait for the new project form
npx agent-browser --cdp 9222 wait 3000
npx agent-browser --cdp 9222 snapshot -i

# Fill project name
npx agent-browser --cdp 9222 fill @e16 "my-new-project"

# Screenshot to verify before creating
npx agent-browser --cdp 9222 screenshot /tmp/gcloud-newproject.png

# Click Create
npx agent-browser --cdp 9222 click @e22
npx agent-browser --cdp 9222 wait 5000

# Switch to the new project (notification appears with "Navigate to" button)
npx agent-browser --cdp 9222 snapshot -i
npx agent-browser --cdp 9222 click @e33  # "Navigate to PROJECT_ID project"
npx agent-browser --cdp 9222 wait 3000
```

### Enable an API

Navigate directly to the API Library to avoid overlay issues:

```bash
# Direct URL navigation (more reliable than clicking through sidebar)
npx agent-browser --cdp 9222 open "https://console.cloud.google.com/apis/library?project=PROJECT_ID"
npx agent-browser --cdp 9222 wait 3000
npx agent-browser --cdp 9222 snapshot -i

# Search for the API
npx agent-browser --cdp 9222 fill @e16 "YouTube Data API v3"
npx agent-browser --cdp 9222 press Enter
npx agent-browser --cdp 9222 wait 3000
npx agent-browser --cdp 9222 snapshot -i

# Click the API result
npx agent-browser --cdp 9222 click @e20

# Enable it
npx agent-browser --cdp 9222 wait 3000
npx agent-browser --cdp 9222 snapshot -i
npx agent-browser --cdp 9222 click @e15  # "enable this API"
npx agent-browser --cdp 9222 wait 5000
```

### Create API Key Credentials

```bash
# Navigate to Credentials page
npx agent-browser --cdp 9222 snapshot -i
npx agent-browser --cdp 9222 click @e19  # "Credentials" sidebar link

npx agent-browser --cdp 9222 wait 3000
npx agent-browser --cdp 9222 snapshot -i

# Click "Create credential" → select "API key"
npx agent-browser --cdp 9222 click @e23  # "Create credential"
npx agent-browser --cdp 9222 wait 1500
npx agent-browser --cdp 9222 snapshot -i
npx agent-browser --cdp 9222 click @e43  # "API key" menu item

# Wait for the creation dialog
npx agent-browser --cdp 9222 wait 5000
npx agent-browser --cdp 9222 snapshot -i

# Click Create in the dialog
npx agent-browser --cdp 9222 click @e13

# Extract the generated API key
npx agent-browser --cdp 9222 wait 3000
npx agent-browser --cdp 9222 snapshot -i
npx agent-browser --cdp 9222 get value @e3  # "Your API key" textbox

# Close the dialog
npx agent-browser --cdp 9222 click @e6  # "Close"
```

**Important**: The exact `@eN` refs in these GCP examples are from a specific session. They WILL be different for you. Always snapshot and use the refs from YOUR snapshot output.
