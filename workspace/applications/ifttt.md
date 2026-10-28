---
id: ifttt
tier: api
enabled: true
context_tokens: 0
---

# IFTTT (cloud automations)

Runs Patrick's social cross-posting. Applets live in his IFTTT account, not on this Mac. Agents may **read** status and the
activity feed; turning applets on/off or editing them changes live automations and needs Patrick's OK.

## Connector status (2026-10-28)
- **Claude sessions:** an IFTTT connector is available (activity feed, IFTTT status page, data store). Use it read-only to diagnose.
- **Claude Code / VOLTA:** no IFTTT MCP server is configured — VOLTA `GET /api/mcp` lists 22 servers and none is IFTTT. Nothing in VOLTA reads IFTTT yet.
- No IFTTT credentials are stored in the workspace or `.env.local`.

## Applets seen in the activity feed (2026-09-28 → 10-25)
| Applet | Trigger → action | Last result |
|---|---|---|
| Post your Twitter Tweets to Discord | X @American_zero1 post → Discord message | OK 10-21; trigger errors 09-28, 10-16 |
| Archive every Tweet you post to a spreadsheet | X post → Google Sheets | OK 10-21 |
| Log every X post to Google Sheets | X post → Google Sheets | OK 10-21 — **duplicates the applet above** |
| Save liked X (Twitter) posts to Google Docs | X like → Google Docs | OK 10-22; action error 09-30 |
| Liked tweet by @american_zero1 → Evernote | X like → Evernote note | OK 10-22 — **duplicates the likes capture above** |
| Post new Telegram channel messages to Facebook Page | QUANTUM_VAULT post → Facebook Page | OK 10-20 |
| New link post on The Strangest Times → Discord rich message | TST page link post → Discord | **Trigger errors 10-06, 10-16; no success in window** |
| Save new Google Docs to Dropbox text file | Google Docs → Dropbox | **Trigger errors 10-05, 10-14 (twice)** |
| Back up tagged Facebook photos to iOS Photos (2 applets) | Facebook → iOS Photos | Trigger errors 10-11, 10-21, 10-25 |

Not automated (by design, per Patrick): **Instagram thestrangesttimes**, TikTok @Epsilonsec, YouTube uploads.

## Suggested fixes (for Patrick to approve)
1. Reconnect the X and Facebook services in IFTTT (most failures are "problem with the trigger" or timeouts on those services).
2. Retire one of the two "X post → Google Sheets" applets and one of the two "likes" capture applets, or keep both on purpose.
3. Decide whether The Strangest Times → Discord should watch the YouTube channel instead (new upload → Discord) once uploads start.
4. Optional: add YouTube new upload → X post and → Telegram once the channel publishes on a cadence.

## How agents check it
In a Claude session with the IFTTT connector: activity feed, `days_back: 31`, `status: error` → summarise by applet. Report; don't toggle.
