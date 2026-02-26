# Social Media Automation Reference

Platform-specific tips and gotchas for Facebook, Instagram, and X automation using agent-browser with the superbot2 profile.

## General Rules

- **One browser session at a time** — don't run multiple agent-browser automations concurrently on the same profile. They share cookies and state. Queue social media tasks sequentially.
- **Always verify your profile/account** before posting — check which profile is active before any comment, reply, or DM.
- **Use `--headed` for first-time setup** on each platform to ensure you're logged into the correct account.

## Facebook

### Commenting Profile (CRITICAL)

The browser may be signed in as the account owner but comments must come from a different page/profile. Always verify at session start:

1. Navigate to facebook.com
2. Click "Your profile" (top-right) — confirm the correct profile name is shown
3. If wrong: click the profile icon -> switch to correct profile
4. After switching, **reload the page** — group-level commenting profile won't update without a reload
5. Confirm comment boxes show "Comment as [Correct Name]" before engaging
6. After ~6-8 comments, Facebook shows a "Switch profiles to interact" modal — dismiss it and recheck immediately
7. Hard session limit: ~6-8 comments before the profile issue becomes persistent. Plan short sessions.

### Comment Workflow

```bash
# Navigate to the target post
agent-browser open "https://www.facebook.com/groups/GROUP_ID/posts/POST_ID"
agent-browser wait 3000

# Snapshot to find the comment box
agent-browser snapshot -i
# Look for: @eN textbox "Comment as [Name]" or "Answer as [Name]"

# Click the comment box to focus it
agent-browser click @e15
agent-browser wait 500

# Clear any existing text and type the comment
agent-browser press Control+a
agent-browser press Backspace
agent-browser fill @e15 "Your comment text here"

# Submit
agent-browser press Enter
agent-browser wait 2000
```

### Navigation

Facebook's SPA has continuous background requests — `wait --load networkidle` will time out. Always use fixed waits:

```bash
# Navigate to a group
agent-browser open "https://www.facebook.com/groups/GROUP_SLUG"
agent-browser wait 3000  # Don't use networkidle

# Sort by Recent (not Top Posts)
agent-browser open "https://www.facebook.com/groups/GROUP_ID?sorting_setting=RECENT_ACTIVITY"
agent-browser wait 3000
```

### Selectors

Key aria-labels and patterns for Facebook:

```
# Comment input (aria-label varies by context)
textbox "Comment as <Name>"
textbox "Answer as <Name>"

# Post authors in group feeds
h2 elements contain post author names

# Group search URL pattern
https://facebook.com/groups/{group_slug}/search/?q={query}

# To open comment section from search results:
# Click "X comments" button — NOT "Leave a comment" (that opens new post composer)
```

### Session Limits

- Hard limit: ~6-8 comments per session before Facebook starts showing profile-switch modals persistently
- After the limit, stop the session — do not try to push through
- Plan sessions accordingly: scout targets first, then comment in a focused burst

## X (Twitter)

### Algorithm Facts (Inform Strategy)

- **Reply-to-reply**: 75x engagement multiplier — engage in threads, not just top-level
- **Reposts**: 20x likes
- **Replies**: 13.5x likes
- **External links kill reach 50-90%** — never include links in main tweets, only in replies
- **Tweet lifespan**: 15-30 minutes — timing matters
- **Peak times**: Weekdays 9AM-2PM EST, Wednesday best, then Tue/Thu

### Reply Workflow

```bash
# Navigate to a tweet
agent-browser open "https://x.com/USERNAME/status/TWEET_ID"
agent-browser wait 3000
agent-browser snapshot -i

# Find and click the reply input
# Look for: @eN textbox "Post your reply"
agent-browser click @e8
agent-browser fill @e8 "Your reply text here"

# Submit the reply
agent-browser find role button click --name "Reply"
agent-browser wait 2000
```

### Finding Recent Tweets

```bash
# Search with Latest filter (not Top)
agent-browser open "https://x.com/search?q=claude+code&f=live"
agent-browser wait 3000
agent-browser snapshot -i
```

### Rate Limiting

- Twitter aggressively rate-limits automated interactions
- Wait 60-90 seconds between replies
- Max ~10-15 interactions per session
- Stop immediately if you see a "You are posting too fast" error

## Instagram

### Comment Workflow

```bash
# Navigate to a post
agent-browser open "https://www.instagram.com/p/POST_ID/"
agent-browser wait 3000
agent-browser snapshot -i

# Find the comment textarea
# Look for: @eN textbox "Add a comment..."
agent-browser click @e12
agent-browser fill @e12 "Your comment here"

# Submit — the "Post" button appears after typing
agent-browser find role button click --name "Post"
agent-browser wait 2000
```

### Navigation Tips

- Prefer direct URL navigation to profiles/posts over clicking through the UI
- After commenting, wait 2-3 minutes before the next comment to avoid rate limiting
- Use `wait 3000` instead of `wait --load networkidle`
