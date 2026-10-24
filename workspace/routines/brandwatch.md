---
id: r-brandwatch
name: brand watch domain scanner
time: "14:00"
days: [M, T, W, TH, F, SA, SU]
runner: desktop
mode: active
cap_usd: 10
---

# Competitor & Brand Watch

Scan competitor channels, newsletters and domains for launches, pricing changes and mentions of RoboNuggets.
Currently the **#1 token consumer** (18.2M tok/wk, $9.44/wk) while surfacing ~2 actionable items a week.

## Watchlist
- 14 competitor YouTube channels (titles + thumbnails, last 24h)
- 6 newsletters (RSS)
- Domain mentions: robonuggets, "RUBRIC OS", "Agentic OS"

## Steps
1. Pull new items since last run; dedupe by URL.
2. Classify: LAUNCH · PRICING · MENTION · NOISE. Drop NOISE.
3. For LAUNCH/PRICING, write a 2-line teardown; for MENTION, draft a reply (never post).
4. Stop early if spend this week reaches `cap_usd`.

## Last run
- 2026-10-22 14:00 · 212 items scanned · 2 actionable (competitor pricing change, 1 mention) · $1.31
