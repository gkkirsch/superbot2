---
name: social-media-approvals
description: Dashboard card for reviewing and approving social media post drafts. Workers queue drafts via queue-post.sh, users approve/reject/rewrite in the dashboard.
version: 0.1.0
---

# Social Media Approvals

This skill provides a dashboard card for reviewing social media drafts before posting.

## How It Works

1. Social media workers draft posts and queue them via `queue-post.sh`
2. Drafts appear as cards in the dashboard
3. User reviews and approves, rejects, or rewrites each draft
4. Approved drafts are picked up by the next worker session and posted

## Worker API

Queue a draft:

```bash
bash ~/.superbot2/scripts/queue-post.sh <platform> <space> '<draft text>' \
  --target '@handle or group name' \
  --post-url 'https://...' \
  --excerpt 'original post excerpt' \
  --context 'why this reply is relevant'
```

## Reading Approved Items

Workers check for approved items at session start:

```bash
# Read all approved items from the JSONL
grep '"status":"approved"' ~/.superbot2/data/cards/social-posts.jsonl
```

After posting, update the item status to "posted" via the dashboard API or by rewriting the line.
