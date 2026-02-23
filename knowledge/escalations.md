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

Use for any content the user will publish: social media drafts, DM campaigns, emails, blog posts.

**One escalation per draft** — never batch multiple drafts into one escalation. The user approves, rewrites, or skips each piece individually.

**Subject format** (use platform emoji):
- Facebook: `📘 Facebook — reply draft to @Handle in Professional Hosts group`
- X (Twitter): `🐦 X — reply draft to @handle on Claude Code thread`
- Instagram: `📸 Instagram — comment draft on @account post`

**Context must include:**
```
Group/Thread: [name]
Post excerpt: "first ~80 chars of the post..."
Post date: [date]
Post URL: [url]

Draft reply:
"your full draft text here"
```

**Standard options:**
```bash
--option "Approve|Post this reply"
--option "Rewrite|Needs rework"
--option "Skip|Don't reply to this one"
```

**Full example:**
```bash
bash ~/.superbot2/scripts/create-escalation.sh approval hostreply facebook-gtm \
  "📘 Facebook — reply draft to @JaneDoe in Professional Hosts group" \
  --context "Group: Professional Hosts\nPost excerpt: \"I'm struggling with late night messages from guests...\"\nPost date: 2026-02-23\nPost URL: https://facebook.com/groups/professionalhosts/posts/123\n\nDraft reply:\n\"ugh yes this was my life too. what fixed it for me was automating the repetitive stuff (wifi, checkin, parking) so i only get pinged for real issues. changed everything for my response rate\"" \
  --option "Approve|Post this reply" \
  --option "Rewrite|Needs rework" \
  --option "Skip|Don't reply to this one" \
  --priority high
```

**Rules:**
- One escalation per draft — never batch
- Do NOT re-surface in chat — user finds them in the dashboard
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
