---
id: r-inbox
name: daily inbox digest team
time: "10:00"
days: [M, T, W, TH, F]
runner: desktop
mode: active
cap_usd: 5
---

# Daily Inbox Digest (Team)

Summarise the last 24h of Gmail into four buckets (PARTNERS, LEADS, PERSONAL, OTHER), flag anything needing
Jay today, and post the digest to the team channel.

## Inputs
- Gmail MCP (flagged + unread, last 24h) · `departments/business.md` for client names

## Steps
1. Bucket every thread; flag partner and lead threads older than 4h without a reply.
2. Draft replies for flagged threads using `/tone` business register (drafts only).
3. Route new leads to `/lead-research`.
4. Write the digest to the "Last run" block below.

## Last run
- 2026-10-22 10:00 · 47 emails · 3 flagged (BetaShares approval, Anthropic invite, Stripe webhook alert) · 2 leads routed
