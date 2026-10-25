# Content — Department Router

> YouTube (202k subs), scripts, thumbnails, Instagram carousels, video edits.

## Files
- `content/youtube-calendar.md` — Upload calendar, 2 long-form per week, Shorts daily.
- `content/scripts/agentic-os-v3.md` — Current flagship script (8 clips, master cut v3).
- `content/scripts/mods-deep-dive.md` — Next recording. Outline locked.
- `content/thumbnails-log.md` — A/B results feeding `/thumb`.
- `content/carousels/post-14-arms.md` — Latest approved carousel.
- `videos/clips/` — RUBRIC Editor clip bin for the active master cut.

## Pipeline
`/tone` script → `/grammar` → record → `/cut` A-roll → `/animate` B-roll → RUBRIC Editor review pins
→ RL Log entries on `/cut` and `/animate` → `/thumb` (with `/wildcard`, 20% novel) → publish.

## Rules
- Hooks under 8 seconds. First line states the payoff.
- Every thumbnail batch: 4 corpus-aligned + 1 WILDCARD.
- Never reuse a thumbnail layout two uploads in a row.

## Applied Recos

### 2026-10-25 · rc-1 · Shrink CLAUDE.md into Department Routers
- Applied: 2026-10-25T03:23:17.064Z
- Source: VOLTA Recos (/apps/recos) · Memory · priority
- Expected impact: Saves ~18.4k tok/chat
- Change: Refactor workspace/CLAUDE.md into a slim router: move each department section into workspace/departments/<dept>.md and replace it with a one-line pointer. Preserve /compact directives verbatim.
