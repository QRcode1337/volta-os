# VOLTA micro-apps audit — 2026-10-27

Three parallel read-only audits (GET requests against the live dev server, log tails, code reading; no source changes). Full evidence per app — file:line, request + status, log text — lives in the parts:

- [parts/media.md](parts/media.md) — editor, generations, studio, music, podcast, carousels
- [parts/knowledge.md](parts/knowledge.md) — ltm, honcho, sessions, search, research, recos
- [parts/ops.md](parts/ops.md) — systems, tasks, launchpad, feeds, elements, scripts, home/launcher

Every `/apps/<name>` page returns 200 and `tsc --noEmit` is clean. Nothing is fully broken on desktop; the problems are evicted iCloud files, silent data gaps, and phone layouts.

## Status

| App | Status | Top issue | Top enhancement |
|---|---|---|---|
| editor | partial | Edit-mode state lives in iCloud-synced ErisMornCloud; evicted cache/sequence files give 500s and silently drop projects | Move `NLE_ROOT` off iCloud; evicted files → 409, never 500 |
| generations | working | Only a per-request $5 cap; no daily cap; spend hidden on phone | Server-enforced daily budget, shown on mobile |
| studio | partial | 9 of 13 presets can't run — project files evicted; idle job poll every 6 s | Per-project "make available offline" / move to Windsor |
| music | partial | 0 of 19 tracks local, nothing plays; Suno not set up; player overflows on phone | Hydrate or move library; lock-screen controls |
| podcast | working, degraded | 10-27 episode shipped with 0 of 8 topics researched; real error discarded (`llm.ts:100`) | Capture the error, flag research-less episodes |
| carousels | desktop only | Fixed 632 px of side panes; first load 11 s waiting on Notion | Drawer queue + stacked editor on phone |
| ltm | partial | Recurring SQLite "database is locked" 500s (`ltm.ts:35`, no busy timeout); no phone layout | `timeout: 2000` + 503-on-busy |
| honcho | partial | Unusable on phone (264 px rail always shown) | Phone layout; flag/delete bad conclusions |
| sessions | partial | Needs ~800 px; search is metadata-only | Phone layout; full-text transcript search |
| search | working | No Sessions or Research sources; Honcho times out cold | Add those sources; real Notion search |
| research | partial | Threads/Bridges empty because graph files are iCloud placeholders (409), UI says "No cluster matches" | Real empty-state reason; keep graphs on Windsor |
| recos | working | Done/skip state per-browser; links to dead `localhost:37777` on phone | Server-side state; "Fix with agent" reuse |
| systems | working | `SystemsBadge` never mounted — Voltamachina 97.2% alert invisible outside the app | Badge + alert dot on both home screens |
| tasks | working (read-only) | 19 awaiting items, none actionable; phone drawer under tab bar | Approve / Done / Snooze via decisions file |
| launchpad | partial | Loopback links dead on phone; 4 of 6 `tailscale serve` entries down; 84 of 91 repos skipped as iCloud placeholders | Tailnet-aware links; one prober shared with Systems |
| feeds | working | Needs-action inflated by dead Hermes briefings (40) and retired jobs (108) | Archive stale sources; needs-action home card |
| elements | phone broken | 248 px nav at every width (`ElementsApp.tsx:163`) | Responsive nav; document shared kit |
| scripts | phone broken | 3-column grid needs ≥600 px; editor hand-off is per-browser | Phone layout, touch teleprompter, server hand-off |
| home / launcher | partial | Routines silently omit all OpenClaw cron jobs (`openclaw` in `~/bin`, not on the LaunchAgent PATH) | Fix resolution + `warnings[]` on `/api/routines` |

## Top 10

| # | What | Apps | Effort | Why now |
|---|---|---|---|---|
| 1 | **Move Editor working files off iCloud** (`nle/paths.ts:13`) and treat evicted files as 409 / cache miss | editor | S | Saved edits are already returning 500 and vanishing from the project list |
| 2 | **Hide password-manager captures in LTM** and stop unvolta-ltm recording them | ltm, search | S | 18 captures of the Passwords app are browsable and searchable, including over Tailscale |
| 3 | **LTM busy timeout + 503-on-busy** (`ltm.ts:35`) | ltm, home, search | S | One line removes the recurring locked-DB 500s in three places |
| 4 | **Restore OpenClaw routines** — resolve `~/bin/openclaw` in `routines.ts` (or add `~/bin` to the LaunchAgent PATH) and surface `warnings[]` | home, search, systems | S | Every routines view silently hides all OpenClaw jobs |
| 5 | **"Needs you" on the home screens** — mount `SystemsBadge`, one card combining Systems alerts (6), Tasks awaiting (19), Feeds needs-action (130, after archiving dead sources) | systems, tasks, feeds, home | S–M | A 97% full drive and 19 decisions are invisible from home |
| 6 | **One "make available offline" flow** (size, free-space check, `brctl download`, approval) — or move live media to Windsor | music, studio, editor, research, launchpad | M | iCloud eviction is behind most "partial" ratings |
| 7 | **Podcast research failures visible** — parse the claude error, hold/flag episodes under N topics, fix false fallback warning | podcast | S | Today's episode shipped with no research and no signal |
| 8 | **Shared phone layout pattern** (rail → drawer, panes → tabs) applied to LTM, Honcho, Sessions, Elements, Scripts, Carousels, Music | 7 apps | M | Phone over Tailscale is a primary way in |
| 9 | **Server-side editor inbox** (Windsor-backed) replacing localStorage `editor-inbox.ts`, read by Edit mode | scripts, generations, studio, music, carousels, editor | M | Hand-offs from the phone never reach the Mac |
| 10 | **Daily spend cap** enforced server-side, shown on mobile, with podcast costs in the usage bar | generations, podcast | S | Only a per-request cap exists today |

Next tier: actionable Tasks (M–L), one tailnet-aware service registry for Systems + Launchpad (M), Sessions/Research in Search (S–M), shared UI kit for duplicated `Chip`/`StatusDot`/toasts/audio player (M), Media Session lock-screen controls for Music + Podcast (S).

## Cross-cutting findings

- **ErisMornCloud is iCloud with eviction on.** CLAUDE.md names it the offload target; fine for archives, wrong for live state the server reads back (editor, research graphs, studio projects). Decide where live state goes (Windsor, a `.nosync` folder, or `~/Library`) before fixing #1 and #6.
- **The same evicted-file check is written 6+ times** (studio, music, editor, vaults); the Editor cache reads that most needed it don't have it. One shared helper.
- **Phone-aware actions:** "Fix with agent" always opens Terminal on the Mac, `open …` copy buttons and `obsidian://` links are dead on the phone, and toast stacks sit on top of the mobile tab bar.
- **Synchronous LTM queries run on the dev server's single thread**, so a slow LTM query stalls every app.
- **Side effect of the audit:** the Research GETs triggered that app's normal 30-minute stat-only refresh, which rewrote `inventory.json` (~2 MB) on Windsor.
