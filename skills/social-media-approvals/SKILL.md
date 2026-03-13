---
name: social-media-approvals
description: >
  Use when queuing social media post drafts for human approval before publishing.
  Triggers: "queue post for approval", "draft social media post", "submit post for review",
  "social media approval workflow", "review social media drafts".
  Provides a dashboard card for reviewing, approving, rejecting, or rewriting
  social media drafts across Facebook, X/Twitter, Instagram, LinkedIn, and other platforms.
version: 0.1.0
---

# Social Media Approvals

This skill provides a dashboard card for reviewing social media drafts before posting. Everything is self-contained within this skill directory.

## How It Works

1. Social media workers draft posts and queue them via `queue-post.sh` (in this skill's directory)
2. Drafts are stored in `data.jsonl` (in this skill's directory)
3. The dashboard reads `superbot.json` and renders items with approve/reject/rewrite buttons
4. Approved drafts are picked up by the next worker session and posted

## Worker API

Queue a draft using the skill's built-in script:

```bash
bash $SUPERBOT2_APP_DIR/skills/social-media-approvals/queue-post.sh <platform> <space> '<draft text>' \
  --target '@handle or group name' \
  --post-url 'https://...' \
  --excerpt 'original post excerpt' \
  --context 'why this reply is relevant'
```

Arguments:
- `platform` (required) — facebook, x, instagram, linkedin, etc.
- `space` (required) — space name the worker is in
- `draft` (required) — the draft post/reply text

Options:
- `--target` — who/where the post targets
- `--post-url` — URL of the post being replied to
- `--excerpt` — excerpt from the original post
- `--context` — context for why this engagement

## Reading Approved Items

Workers check for approved items at session start:

```bash
grep '"status":"approved"' $SUPERBOT2_APP_DIR/skills/social-media-approvals/data.jsonl
```

After posting, update the item status to "posted" via the dashboard API.

## File Structure

```
social-media-approvals/
├── SKILL.md          ← this file (skill instructions)
├── superbot.json     ← skill manifest (card, settings, schedule, agent)
├── queue-post.sh     ← worker script to queue drafts
├── data.jsonl        ← runtime data (gitignored)
└── .gitignore        ← excludes data.jsonl
```
