# Escalation Reference

How to create escalations. Workers use escalations to get user input, request content approval, or surface decisions. All escalations are reviewed in the dashboard.

## The Script

```bash
bash ~/.superbot2/scripts/create-escalation.sh <type> <space> <project> "<subject>" \
  --context "<details>" \
  --option "<label>|<description>" \
  --priority <high|medium|low>
```

## Escalation Types

### `approval` — Content requiring user review before publishing

Use for any content the user will publish: social media drafts, DM campaigns, emails, blog posts. The user reads the drafts and chooses an action.

**Subject format** (use platform emoji):
- Facebook: `📘 Facebook — 8 comment drafts for Professional Hosts group`
- X (Twitter): `🐦 X — 12 reply drafts for Claude Code community`
- Instagram: `📸 Instagram — 6 comment drafts for AI/tech accounts`

**Context must include** (one block per draft):
```
Draft 1 — @Handle (post excerpt, first ~80 chars...)
Reply: "your full draft text here"

Draft 2 — @OtherHandle (post excerpt...)
Reply: "your full draft text here"
```

**Standard options:**
```bash
--option "Approve all|Post all drafts with 45-90s delays between each"
--option "Review individually|I will mark approved: true/false in the drafts file"
--option "Reject — redraft|These need rework before posting"
```

**Full example:**
```bash
bash ~/.superbot2/scripts/create-escalation.sh approval hostreply facebook-gtm \
  "📘 Facebook — 8 comment drafts for Professional Hosts group" \
  --context "$(cat drafts.md)" \
  --option "Approve all|Post all drafts with 45-90s delays" \
  --option "Review individually|Mark approved: true/false in drafts file" \
  --option "Reject — redraft|Need rework before posting" \
  --priority high
```

**Rules:**
- One escalation per session/batch — not one per draft
- Do NOT re-surface in chat — user finds it in the dashboard
- Wait for resolution before posting anything

---

### `decision` — A choice that blocks progress

Use when you've hit a fork in the road and can't continue without user input. Must include `--suggested-auto-rule`.

```bash
bash ~/.superbot2/scripts/create-escalation.sh decision <space> <project> \
  "<subject describing the decision>" \
  --context "<what you know, what the options are, tradeoffs>" \
  --option "<Option A|consequence of A>" \
  --option "<Option B|consequence of B>" \
  --suggested-auto-rule "<plain English rule that would auto-resolve this type in future>" \
  --priority high
```

---

### `question` — Missing information needed to proceed

Use when you're missing a fact, credential, or configuration that you can't look up. Must include `--suggested-auto-rule`.

```bash
bash ~/.superbot2/scripts/create-escalation.sh question <space> <project> \
  "<subject — one clear question>" \
  --context "<what you tried, why you can't proceed>" \
  --suggested-auto-rule "<plain English rule for future auto-resolution>" \
  --priority high
```

---

### `agent_plan` — A plan ready for user review

Used by plan agents to surface an actionable plan before execution starts. The user approves, rejects, or redirects in the dashboard.

```bash
bash ~/.superbot2/scripts/create-escalation.sh agent_plan <space> <project> \
  "Plan: <brief description>" \
  --context "<full markdown plan with phases, tasks, tradeoffs>" \
  --priority medium
```

---

## Priority Guide

- `high` — blocks active work or time-sensitive (social media session waiting, deploy blocked)
- `medium` — needed soon but not blocking right now
- `low` — informational, can wait

## What NOT to Escalate

- Things answerable from space knowledge or global knowledge — look it up first
- Things the orchestrator can resolve from recorded facts
- Progress updates — use SendMessage to the orchestrator instead
