---
name: email-sender
description: >
  Send personalized outreach emails, create drafts for review, manage reusable
  templates with variable substitution, and orchestrate multi-email follow-up
  sequences — all via the gog CLI (Gmail).
  Triggers: "send email", "draft email", "draft outreach email", "email outreach",
  "create email template", "email template", "email sequence", "follow-up sequence",
  "send follow-up", "compose email".
  NOT for: reading/searching inbox, managing labels, calendar invites, non-Gmail email.
version: 1.0.0
argument-hint: "[send|draft|template|sequence] [details]"
allowed-tools: Read, Grep, Glob, Bash, Write

metadata:
  superbot:
    emoji: "📧"
    requires:
      bins: ["gog"]
    install:
      - id: brew
        kind: brew
        formula: pterm/tap/gog
        bins: ["gog"]
        label: "Install gog CLI via Homebrew"
      - id: manual
        kind: manual
        label: "Download from GitHub"
        url: "https://github.com/pterm/gog/releases"
---

# Email Sender

Send emails, create drafts, manage templates, and run follow-up sequences using the `gog` CLI for Gmail.

## Safety Rules

**CRITICAL: Never send an email without explicit user confirmation.**

Before every `gog gmail send` command:
1. Show the user the full email (to, subject, body)
2. Ask "Send this email?" and wait for confirmation
3. Only proceed after the user says yes

This applies to all send actions — single emails, drafts being sent, and sequence emails.

## Setup

Requires `gog` CLI v0.9.0+ authenticated with a Gmail account.

```bash
# Check gog is installed and authenticated
gog --version
gog gmail search "in:sent" --account=YOUR_EMAIL@example.com --json 2>&1 | head -5
```

If not authenticated, run `gog auth login` first.

## Account

All commands use `--account=YOUR_EMAIL@example.com`.

## Actions

Parse `$ARGUMENTS` to determine the action:

```bash
ACTION=$(echo "$ARGUMENTS" | awk '{print $1}')
DETAILS=$(echo "$ARGUMENTS" | cut -d' ' -f2-)
```

---

## Action: send

Compose and send a single email.

### From user instructions

The user provides recipient, subject, and body (or a template name + variables). Compose the email, show it for confirmation, then send.

### Sending

```bash
# Plain text email
gog gmail send \
  --account=YOUR_EMAIL@example.com \
  --to="recipient@example.com" \
  --subject="Subject line" \
  --body="Email body text" \
  --json

# HTML email
gog gmail send \
  --account=YOUR_EMAIL@example.com \
  --to="recipient@example.com" \
  --subject="Subject line" \
  --body-html="<p>HTML body</p>" \
  --json

# With attachments
gog gmail send \
  --account=YOUR_EMAIL@example.com \
  --to="recipient@example.com" \
  --subject="Subject line" \
  --body="Body text" \
  --attach="/path/to/file.pdf" \
  --json

# With CC/BCC
gog gmail send \
  --account=YOUR_EMAIL@example.com \
  --to="main@example.com" \
  --cc="cc@example.com" \
  --bcc="bcc@example.com" \
  --subject="Subject" \
  --body="Body" \
  --json

# With open tracking
gog gmail send \
  --account=YOUR_EMAIL@example.com \
  --to="recipient@example.com" \
  --subject="Subject" \
  --body="Body" \
  --track \
  --json
```

### After sending

Log the sent email to the tracking file:

```bash
mkdir -p ~/.superbot2/email-tracking

# Append a JSON line to the sent log
cat >> ~/.superbot2/email-tracking/sent.jsonl << 'JSONL'
{"timestamp":"2024-01-15T10:30:00Z","to":"recipient@example.com","subject":"Subject line","template":null,"sequence":null,"stage":null}
JSONL
```

Use actual values. Include ISO 8601 timestamp, recipient(s), subject, template name if used, sequence name and stage number if part of a sequence.

### Sending with a template

If the user references a template name:

1. Read the template from `~/.superbot2/email-templates/<template-name>.md`
2. Substitute all `{{variable}}` placeholders with provided values
3. Show the rendered email for confirmation
4. Send via `gog gmail send`
5. Log to tracking file with `"template":"<template-name>"`

---

## Action: draft

Create a Gmail draft for review without sending.

### Creating a draft via gog

```bash
gog gmail drafts create \
  --account=YOUR_EMAIL@example.com \
  --to="recipient@example.com" \
  --subject="Subject line" \
  --body="Email body text" \
  --json
```

The `--json` flag returns the draft ID. Save this for later reference.

### Local draft log

Also log the draft locally for tracking:

```bash
mkdir -p ~/.superbot2/email-tracking

cat >> ~/.superbot2/email-tracking/drafts.jsonl << 'JSONL'
{"timestamp":"2024-01-15T10:30:00Z","draftId":"r123456","to":"recipient@example.com","subject":"Subject line","template":null,"status":"draft"}
JSONL
```

### Listing drafts

```bash
gog gmail drafts list --account=YOUR_EMAIL@example.com --json
```

### Sending a draft

When the user approves a draft:

```bash
gog gmail drafts send <draftId> --account=YOUR_EMAIL@example.com --json
```

Then log the send to `sent.jsonl` and update the draft status.

---

## Action: template

Create and manage reusable email templates with variable substitution.

### Template format

Templates are stored as markdown files at `~/.superbot2/email-templates/<name>.md`:

```markdown
---
name: cold-outreach
subject: "Quick question about {{company}}"
description: "Initial cold outreach for potential clients"
variables:
  - name: "name"
    description: "Recipient's first name"
    required: true
  - name: "company"
    description: "Recipient's company name"
    required: true
  - name: "pain_point"
    description: "Specific pain point to address"
    required: true
  - name: "cta"
    description: "Call to action"
    default: "a quick 15-minute call this week"
---

Hi {{name}},

I came across {{company}} and noticed {{pain_point}}.

We've helped similar companies solve this — would you be open to {{cta}}?

Best,
Grant
```

### Creating a template

```bash
mkdir -p ~/.superbot2/email-templates
```

Then use the Write tool to create the template file at `~/.superbot2/email-templates/<name>.md`.

### Listing templates

```bash
ls ~/.superbot2/email-templates/*.md 2>/dev/null
```

For each template, read its frontmatter to show name, description, and variables.

### Variable substitution

When rendering a template, replace all `{{variable}}` placeholders:

1. Read the template file
2. Parse the YAML frontmatter for variable definitions
3. Check all required variables are provided
4. Apply defaults for optional variables not provided
5. Replace `{{variable}}` with the actual value throughout subject and body
6. Return the rendered subject and body

### Example

User says: "send email using cold-outreach template to jane@acme.com with name=Jane, company=Acme Corp, pain_point=manual invoice processing"

1. Read `~/.superbot2/email-templates/cold-outreach.md`
2. Substitute variables:
   - `{{name}}` → `Jane`
   - `{{company}}` → `Acme Corp`
   - `{{pain_point}}` → `manual invoice processing`
   - `{{cta}}` → `a quick 15-minute call this week` (default)
3. Show rendered email for confirmation
4. Send via `gog gmail send`

---

## Action: sequence

Multi-email follow-up sequences. Define a sequence of emails with wait intervals, track which stage each contact is at, and generate the next email.

### Sequence definition format

Sequences are stored at `~/.superbot2/email-templates/sequences/<name>.json`:

```json
{
  "name": "client-outreach",
  "description": "3-email cold outreach sequence",
  "stages": [
    {
      "stage": 1,
      "template": "cold-outreach",
      "waitDays": 0,
      "description": "Initial outreach"
    },
    {
      "stage": 2,
      "template": "follow-up-1",
      "waitDays": 3,
      "description": "First follow-up if no reply"
    },
    {
      "stage": 3,
      "template": "follow-up-2",
      "waitDays": 5,
      "description": "Final follow-up"
    }
  ]
}
```

### Sequence contact tracking

Track each contact's position in a sequence at `~/.superbot2/email-tracking/sequences/<sequence-name>.jsonl`:

```jsonl
{"contact":"jane@acme.com","stage":1,"sentAt":"2024-01-15T10:30:00Z","nextStage":2,"nextSendAfter":"2024-01-18T10:30:00Z"}
{"contact":"bob@corp.com","stage":2,"sentAt":"2024-01-16T10:30:00Z","nextStage":3,"nextSendAfter":"2024-01-21T10:30:00Z"}
```

### Starting a contact in a sequence

1. Look up the sequence definition
2. Render stage 1 template with the contact's variables
3. Show for confirmation and send
4. Log to the sequence tracking file

### Advancing a contact

When the user says "send next follow-up for jane@acme.com in client-outreach":

1. Read the sequence tracking file
2. Find the contact's latest entry
3. Check if enough days have passed since the last email
4. If ready: render the next stage template, show for confirmation, send
5. Log the new stage to tracking
6. If the contact is past the last stage, report "sequence complete"

### Listing sequence status

Read the sequence tracking file and show:
- Each contact's current stage
- When the next email is due
- Whether the sequence is complete

```bash
# Example output format:
# client-outreach sequence status:
# jane@acme.com  — Stage 2/3, next follow-up due 2024-01-18
# bob@corp.com   — Stage 3/3, sequence complete
```

---

## Tracking

All email activity is logged to `~/.superbot2/email-tracking/`:

| File | Purpose |
|------|---------|
| `sent.jsonl` | Every email sent (timestamp, to, subject, template, sequence info) |
| `drafts.jsonl` | Drafts created (timestamp, draftId, to, subject, status) |
| `sequences/<name>.jsonl` | Per-sequence contact stage tracking |

### Querying tracking data

```bash
# Count emails sent today
grep "$(date +%Y-%m-%d)" ~/.superbot2/email-tracking/sent.jsonl | wc -l

# Find all emails to a recipient
grep "recipient@example.com" ~/.superbot2/email-tracking/sent.jsonl

# Check sequence status for a contact
grep "jane@acme.com" ~/.superbot2/email-tracking/sequences/client-outreach.jsonl | tail -1
```

## Gotchas

### 1. Authentication
`gog` must be authenticated before use. Run `gog auth login` and complete the OAuth flow if you get auth errors.

### 2. Send-as aliases
The `--from` flag only works with verified send-as aliases in Gmail settings. Default sends from the account email.

### 3. HTML vs plain text
Use `--body` for plain text, `--body-html` for HTML. If both are provided, Gmail uses HTML with plain text as fallback.

### 4. Tracking requires setup
Open tracking (`--track`) requires a Cloudflare Worker. Run `gog gmail track setup` first. Without it, `--track` will fail.

### 5. Rate limits
Gmail API has sending limits. For bulk sequences, pace sends and don't exceed ~100 emails/day for regular accounts or ~1500/day for Workspace.

### 6. Body escaping
For multi-line bodies, use `--body-file` with a temp file rather than inline `--body` to avoid shell escaping issues:

```bash
TMPFILE=$(mktemp)
cat > "$TMPFILE" << 'BODY'
Hi Jane,

Multi-line email body here.

Best,
Grant
BODY

gog gmail send \
  --account=YOUR_EMAIL@example.com \
  --to="jane@example.com" \
  --subject="Hello" \
  --body-file="$TMPFILE" \
  --json

rm "$TMPFILE"
```
