# Social Media Automation Reference

Platform-specific selectors, tips, and gotchas for Facebook, Instagram, and X automation via Playwright CDP.

## General Rules

- **One Chrome worker at a time** — never run multiple concurrent CDP workers. They share the same Chrome context and override each other. Queue social media workers sequentially.
- **Close unrelated tabs before CDP operations** — agent-browser tab switching is unreliable with many tabs open. Before starting a session, close tabs unrelated to the target platform.
- **Always verify your profile/account** before posting — check which profile is active before any comment, reply, or DM.

## Facebook

### Commenting Profile (CRITICAL)

Chrome may be signed in as the account owner but comments must come from a different page/profile. Always verify at session start:

1. Navigate to facebook.com
2. Click "Your profile" (top-right) — confirm the correct profile name is shown
3. If wrong: click the profile icon → switch to correct profile
4. After switching, **reload the page** — group-level commenting profile won't update without a reload
5. Confirm comment boxes show "Comment as [Correct Name]" before engaging
6. After ~6-8 comments, Facebook shows a "Switch profiles to interact" modal — dismiss it and recheck immediately
7. Hard session limit: ~6-8 comments before the profile issue becomes persistent. Plan short sessions.

### Proven Comment Workflow (Playwright CDP)

`fill()` is reliable for Facebook's Lexical editor. **Do NOT use `execCommand`** — it's unreliable.

```javascript
const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];
const page = await context.newPage();

await page.evaluate((url) => { window.location.href = url; }, targetUrl); // see Navigation below
await page.waitForTimeout(3000);

const commentBox = page.locator(
  '[aria-label="Comment as Paige Garrett"], [aria-label="Answer as Paige Garrett"]'
).first();
await commentBox.scrollIntoViewIfNeeded({ timeout: 10000 });
await commentBox.click({ timeout: 10000 });
await page.keyboard.press('Meta+a');
await page.keyboard.press('Backspace');
await commentBox.fill(commentText);
await commentBox.press('Enter'); // submit
```

### Navigation (CRITICAL: page.goto() times out on Facebook)

Facebook's SPA triggers continuous background requests — `page.goto()` and `waitForLoadState('networkidle')` will time out.

```javascript
// WRONG — hangs forever
await page.goto('https://www.facebook.com/groups/...');

// RIGHT — direct location assignment
await page.evaluate((url) => { window.location.href = url; }, targetUrl);
await page.waitForTimeout(3000); // wait for load instead of networkidle
```

### Selectors

```javascript
// Post authors in group feeds
page.locator('h2')  // heading level 2 contains post author

// Comment input (aria-label varies by context)
'[aria-label="Comment as <Name>"]'
'[aria-label="Answer as <Name>"]'

// Group search
'https://facebook.com/groups/{group_slug}/search/?q={query}'

// To open comment section from search results:
// Click "X comments" button — NOT "Leave a comment" (that opens new post composer)
```

### Session Limits

- Hard limit: ~6-8 comments per session before Facebook starts showing profile-switch modals persistently
- After the limit, stop the session — do not try to push through
- Plan sessions accordingly: scout targets first, then comment in a focused burst

### Feed Navigation

```javascript
// Sort by Recent (not Top Posts)
await page.evaluate((url) => { window.location.href = url; },
  'https://www.facebook.com/groups/GROUP_ID?sorting_setting=RECENT_ACTIVITY');

// Always check post timestamp before engaging — skip anything older than 7 days
```

## X (Twitter)

### Algorithm Facts (Inform Strategy)

- **Reply-to-reply**: 75x engagement multiplier — engage in threads, not just top-level
- **Reposts**: 20x likes
- **Replies**: 13.5x likes
- **External links kill reach 50-90%** — never include links in main tweets, only in replies
- **Tweet lifespan**: 15-30 minutes — timing matters
- **Peak times**: Weekdays 9AM-2PM EST, Wednesday best, then Tue/Thu

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
- Max ~10-15 interactions per session
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
