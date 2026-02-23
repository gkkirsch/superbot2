# Social Media Automation Reference

Platform-specific selectors, tips, and gotchas for Facebook, Instagram, and X automation via Playwright CDP.

## General Rules

- **One Chrome worker at a time** — never run multiple concurrent CDP workers. They share the same Chrome context and override each other. Queue social media workers sequentially.
- **Close unrelated tabs before CDP operations** — agent-browser tab switching is unreliable with many tabs open. Before starting a session, close tabs unrelated to the target platform.
- **Always verify your profile/account** before posting — check which profile is active before any comment, reply, or DM.

## Facebook

### Commenting Profile (CRITICAL)

Chrome may be signed in as the account owner but comments must come from a different page/profile. Always verify at session start:

1. Check which profile the comment box shows: `textbox[aria-label="Comment as <Name>"]`
2. If it shows the wrong name, switch profiles before continuing
3. After ~6-8 comments, Facebook may show a "Switch profiles to interact" modal — dismiss it and recheck

### Selectors

```javascript
// Comment input box
page.getByRole('textbox', { name: /Comment as/i })

// Post authors (in group feeds)
page.locator('h2')  // heading level 2 contains post author

// Comment buttons follow each post
page.getByRole('button', { name: /Comment/i })
```

### Text Entry

Standard `fill()` doesn't work reliably for Facebook comment inputs. Use `execCommand`:

```javascript
await page.focus('textbox[aria-label="Comment as <Name>"]');
await page.evaluate((text) => {
  document.execCommand('insertText', false, text);
}, yourCommentText);
```

### Session Limits

- Hard limit: ~6-8 comments per session before Facebook starts showing profile-switch modals persistently
- After the limit, stop the session — do not try to push through
- Plan sessions accordingly: scout targets first, then comment in a focused burst

### Feed Navigation

```javascript
// Sort by Recent (not Top Posts)
await page.goto('https://www.facebook.com/groups/GROUP_ID?sorting_setting=RECENT_ACTIVITY');

// Always check post timestamp before engaging
// Look for time elements near each post — skip anything older than 7 days
```

## X (Twitter)

### Reply Input

```javascript
// Reply box after clicking reply on a tweet
page.getByRole('textbox', { name: /Post your reply/i })

// Or by test ID
page.getByTestId('tweetTextarea_0')
```

### Rate Limiting

- Twitter aggressively rate-limits automated interactions
- Wait 60-90 seconds between replies
- Max ~10 interactions per session
- Stop immediately if you see a "You are posting too fast" error

### Finding Recent Tweets

```javascript
// Search with recent filter
await page.goto('https://twitter.com/search?q=claude+code&f=live');
// 'f=live' sorts by Latest, not Top
```

## Instagram

### Comment Input

```javascript
// Comment textarea on a post
page.getByRole('textbox', { name: /Add a comment/i })

// Submit button appears after typing
page.getByRole('button', { name: /Post/i })
```

### Navigation

- Instagram's SPA routing can be finicky — use `waitForLoadState('networkidle')` sparingly
- Prefer direct URL navigation to profiles/posts over clicking through the UI
- After commenting, wait 2-3 minutes before the next comment to avoid rate limiting
