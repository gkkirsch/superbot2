# Daily Reminder

A test skill for validating the superbot.json protocol. Creates reminders that appear as dashboard cards for review.

## Usage

Queue a reminder:
```bash
echo '{"id":"rem-1","status":"pending","title":"Stand up","body":"Time for daily standup meeting","category":"meeting","createdAt":"2026-03-08T09:00:00Z"}' >> skills/daily-reminder/data.jsonl
```
