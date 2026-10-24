---
id: api-youtube
tier: api
enabled: true
context_tokens: 1200
---

# YouTube Data API (API)

Channel stats, 48h velocity, comments. Used by the YouTube analytics routine and `/thumb` CTR feedback.

- Auth: `YOUTUBE_API_KEY` (env var name only).
- Quota: 10k units/day; the daily pull uses ~350.
- Preloaded context: **~1.2k tokens** (endpoint notes).
