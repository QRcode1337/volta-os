# VOLTA OS audit — Ops scope

Scope: **systems, tasks, launchpad, feeds, elements, scripts** and the **home / launcher** (`src/app/page.tsx` →
`ResponsiveHome` → desktop `LeftColumn`/`CenterOrbitalCore`/`RightColumn`, phone `MobileHome`, plus `MobileTabBar` /
`MobileMenu` from the root layout).

Method: read the code, then checked it against the running dev server (`http://127.0.0.1:50000`, GET only) and the
tail of `~/Library/Logs/volta-os.log`. Nothing was POSTed and no fix, run or refresh action was triggered. Audited 2026-10-27.

## Summary

| App | Status | Top issue | Top enhancement |
|---|---|---|---|
| Systems | **working** | `SystemsBadge` is never mounted, so the current **critical** alert (Voltamachina 97.2% used) doesn't show on either home screen | Mount the badge on the desktop header, add a phone Systems card or tab dot, and flag "OpenClaw CLI not on VOLTA's PATH" |
| Tasks | **working** (read-only by design) | You can see 19 items awaiting you but can't act on any of them; on the phone the detail drawer sits under the tab bar | Approve / done / snooze actions that go through OpenClaw, and wiki notes shown inline (the current links are Mac `open` commands) |
| Launchpad | **partial** | Agent links point to `127.0.0.1` / `localhost`, so they're dead on the phone; 4 of 6 `tailscale serve` entries are down; 84 of 91 repos are skipped | Links that work over the tailnet, one probe shared with Systems, and flags for stale serve entries |
| Feeds | **working** | Old and retired sources inflate the counts (Hermes briefings from May account for 40 of 130 needs-action); 336 of 342 items are unread | Collapse or retire stale sources, add a needs-action digest card on the home screen, show counts on the phone |
| Elements | **partial** (fine on desktop, broken on phone) | Fixed 248px side nav at every width leaves ~60px for content on a 375px phone | Responsive nav, plus document the shared kit (AppTopBar, toast, Chip, StatusDot — 5+ copies across apps) |
| Scripts | **partial** (fine on desktop, broken on phone) | Fixed 3-column grid needs at least 600px; the teleprompter control strip doesn't wrap | Phone layout, a teleprompter with touch controls and wake-lock, and an Editor hand-off that survives switching devices |
| Home / launcher | **partial** | The Routines widget and card silently show **only 15 launchd jobs and no OpenClaw cron jobs**: `openclaw` isn't on the LaunchAgent PATH | Fix the PATH and add a `degraded` flag to `/api/routines`; live per-app badges in the launcher |

## Context briefing (shared)

- **Stack**: Next 15.5 App Router, React 19.3, TS 5.9, Tailwind 4.3, lucide-react, d3, three/@react-three/fiber. `next dev --turbopack -H 127.0.0.1 -p 50000` via LaunchAgent `com.epsilon.volta-os` (PATH = `~/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin`; `VOLTA_TAILNET_HOST`/`VOLTA_TAILNET_USERS` set).
- **Pattern**: each app is a thin `src/app/apps/<name>/page.tsx` server component that renders one `'use client'` `<Name>App` from `src/components/<name>/`. Data loads on the client from `src/app/api/**` route handlers, which wrap `src/lib/server/**` (`server-only`). Polling is visibility-aware (30–60 s). The home screen shares fetches through `dashboard/widgets/shared-json.ts`.
- **Guards**: GETs go through `localJson` / `rejectNonLocalRead` (loopback Host, or the tailnet host plus an allow-listed `Tailscale-User-Login`, plus a same-origin check). Mutations go through `rejectNonLocalMutation`, which also requires a JSON content type. Tailnet access is wired correctly, so the phone can reach every route.
- **Conventions**: a shared app chrome `elements/kit/AppTopBar` (handles the safe-area top inset and has a one-row phone header), `elements/kit/toast`, the `hud-*` CSS classes, and `h-screen w-screen` app shells that `globals.css:147-154` shortens by the tab-bar height below `md`. Server-side caches use short TTLs (15 s for systems, 10 min for folder sizes).
- **Data sources**: no database. Everything is read from local files and processes: `~/.openclaw/wiki/main/actions.md` (Tasks), OpenClaw / ErisMorn / Hermes job outputs (Feeds; read marks in `/Volumes/Windsor/VOLTA/feeds/read.json`), launchctl / ports / `df` / `memory_pressure` (Systems), the Notion API (Scripts, Launchpad pins), the Netlify API, the `tailscale serve` status, and git repos under `~/Documents/PROJECTS`, `~/ErisMorn` and `~/Volta-OS`.

---

## Systems — working

**Evidence**
- `GET /apps/systems` 200 (48 KB). `GET /api/systems` 200 in 0.68 s, 17.9 KB: 10 services (9 up, Ollama down), 3 model runtimes, memory 64% free / normal, 6 attention items. `GET /api/systems?summary=1` 200 (712 B). `GET /api/systems/ping` 200. `GET /api/systems/fix` returns 405 (POST only, as intended).
- Live attention items:
  - critical: `Voltamachina: 13.1 GiB free` (97.2% used)
  - warn: `com.local.openclaw-manual-backup failing` (exit 11), `ai.omniroute.scheduled-restart failing`, `ai.omniroute.breaker-decay failing`, `com.unvolta.ltm-ingest failing`, `Windsor: 27.3 GiB free` (94.1%)
- Loading, error-with-retry and all-clear states all exist (`SystemsApp.tsx:155-175`, `AttentionStrip.tsx:25-36`). The fix buttons are wired to `POST /api/systems/fix`, and the server re-derives the command from the attention id (`lib/server/systems/fix.ts:46-62`). This is safe by construction.

**Broken / missing**
1. **`SystemsBadge` is orphaned.** `components/systems/SystemsBadge.tsx` says it is "for other pages to mount (e.g. the home header)", but nothing imports it (`grep "<SystemsBadge"` finds nothing). The desktop home header (`CenterOrbitalCore.tsx:412-416`) only mounts `AwaitingBadge`, and the phone Today feed has no systems card. Today's critical disk alert is only visible inside `/apps/systems`.
2. **No signal for the OpenClaw CLI being unreachable.** The routines loader fails every few minutes with `nice: openclaw: No such file or directory` (see Home below), but Systems reports OpenClaw as "up", because it probes the gateway port and not the CLI.
3. **No signal for failing OpenClaw cron jobs.** Feeds shows `Action Orchestrate`, `Action Digest` and `Cron Health report` with `lastStatus: error` (`/api/feeds` `sources[]`), but Systems only looks at LaunchAgents.
4. **"Fix with agent" from the phone opens Terminal on the Mac.** `SystemsApp.tsx:94` always sends `open: true`. From the phone, `osascript` starts `claude` in a Terminal window nobody is looking at. The prompt is still returned and copyable, but the success toast is misleading on a phone.
5. **"Run" for a failing LaunchAgent only tails its log.** The command is `tail -n 40 <log>` (`lib/server/systems/index.ts:117`). That is diagnostic, not a fix. There's no `launchctl kickstart -k gui/$UID/<label>` option.
6. Stale copy: the page metadata still says "— read-only" (`app/apps/systems/page.tsx:6`), which is no longer true now that one-click fixes exist.
7. Ollama being down raises no alert, by design (`core: false`). It is fine to keep, but say "optional" on the card so a red dot doesn't look like an alert.

**Mobile**: OK. Cards stack (`sm:grid-cols-2`) and the fix pills wrap. The top-bar up/down counts are hidden below `sm` (`SystemsApp.tsx:110`), but the attention strip covers that.

**Lacks vs purpose**: an alert history or trend (is the disk getting fuller?), notifications when something goes critical, and the cron-job layer of the fleet.

**Enhancements**
- Mount `SystemsBadge` on the desktop home header, add a red dot to the phone **Systems** tab (`MobileTabBar.tsx:35-41`) and a Systems card in `MobileHome`. **S**, high value.
- Add OpenClaw cron health (reuse the Feeds `sources[].lastStatus` data or `openclaw cron list`) and "CLI on PATH" as attention items. **S–M**.
- Send `open: false` when `matchMedia(MOBILE_MEDIA_QUERY)` matches, and show "Copy prompt" or "Run headless" instead. **S**.
- Add a "Kickstart" command for failing or not-loaded LaunchAgents next to the log tail. **S**.
- Keep a 7-day sparkline for volume free space and memory pressure, recorded every 15 min to a small JSON on Windsor. **M**.

---

## Tasks — working (read-only by design)

**Evidence**
- `GET /apps/tasks` 200. `GET /api/actions` 200 (39 KB): 78 items. Awaiting 19 (all owned by "Patrick"), blocked 3, todo 5, done 51, progress 0. Oldest open item is 31 days old. Source `~/.openclaw/wiki/main/actions.md`, modified 2026-10-27 11:30Z. `GET /api/actions?counts=1` 200 (411 B).
- Filters (search, agent, section, stale-after-N-days persisted in localStorage), polling, an error banner that keeps the last good data, and an `available:false` banner (`TasksApp.tsx:260-271`) all exist.

**Broken / missing**
1. **No way to act.** "VOLTA never writes actions.md" (`TasksApp.tsx:2-3`, `TaskParts.tsx:236`). With 19 items waiting on you, the app can only show and copy. This is the biggest gap relative to its purpose ("what awaits you").
2. **The phone detail drawer is covered by the tab bar.** The drawer is `fixed inset-0 z-50` (`TaskParts.tsx:180`). The tab bar is also `z-50` and mounted later in `<body>` (`layout.tsx:59`, `MobileTabBar.tsx:69`), so it paints over the bottom ~56px plus the safe-area inset of the drawer. The drawer header (`TaskParts.tsx:183`) also has no `env(safe-area-inset-top)`, so in home-screen (standalone) mode the close button sits under the status bar.
3. **Wiki links only copy `open ~/.openclaw/...`** (`TaskParts.tsx:243-253`). They do nothing useful on the phone, and the toolbar's `$ open …/actions.md` copy button (`TasksApp.tsx:248-257`) is just as useless there.
4. Five status columns stack in one column on the phone, so Awaiting (first) is fine, but you must scroll past Blocked, Todo and so on to reach Done. Acceptable.

**Mobile**: the search box is `w-64` (256px) and wraps OK at 375px. See the drawer issues above.

**Enhancements**
- **Act on awaiting items**: Approve / Done / Snooze / Reply buttons that write an append-only decision (for example `~/.openclaw/wiki/main/decisions.jsonl` or an `openclaw` CLI call) for the Action Orchestrate job to consume. This keeps `actions.md` owned by OpenClaw. **M–L**, highest value in this scope.
- An inline wiki-note viewer: a `GET /api/actions/note?path=` route (limited to `~/.openclaw/wiki`) rendered with the existing `MarkdownView`. **S–M**.
- Drawer fixes: `z-[60]` or tab-bar-aware bottom padding, plus a safe-area-top header. **S**.
- Link each item to the Feeds run that captured it (Action Capture / Orchestrate outputs). **M**.

---

## Launchpad — partial

**Evidence**
- `GET /apps/launchpad` 200.
- `GET /api/launchpad?section=services` 200: 5 agents, all up; tailnet with 6 entries; 4 creative links.
- `?section=netlify` 200: 1 site, last deploy 2026-03-22.
- `?section=repos` 200: `found 91 · skipped 87`, of which **84 are "iCloud placeholder (not downloaded)"**. Only 4 repos are listed (Volta-OS, liminal_backrooms, ErisMorn, UNSEEN_REALM).
- `?section=notion` 200: 3 pins from config, 8 most-visited pages. `?section=bogus` returns 400 with a clean error. `GET /api/vaults` 200: 4 vaults (Pieces-Vault 4,876 notes, voltamachine_v3 1,765, Voltamachina 725, Quantum 388).
- Every section has its own skeleton, error and "last good" state (`LaunchpadApp.tsx:66-72`, `parts.tsx:118-138`). Solid.

**Broken / missing**
1. **Dead links on the phone.** Agent hrefs are `http://127.0.0.1:18789`, `http://localhost:20128/dashboard`, `http://127.0.0.1:9900/`, `http://localhost:37777` and `http://127.0.0.1:8000/docs`. Over Tailscale they resolve to the phone itself. Only the tailnet entries (`https://…ts.net:844x`) work remotely.
2. **4 of 6 `tailscale serve` entries are down**: `:8443/ceviz` → 8080, `:8444` → 8080, `:8445` → 3333, `:8446` → 18791. They look like stale serve mappings. Launchpad shows red dots, but nothing suggests removing them, and Systems doesn't know about them.
3. **"Top git repos" is nearly empty**: 84 of 91 repos are skipped as iCloud placeholders. The real repo list is hidden inside a collapsed `<details>`.
4. **Hard-coded placeholder card**: "Claude for Science … Placeholder card: this URL has not been checked yet." (`LaunchpadApp.tsx:365-367`).
5. **Duplicate prober**: `lib/server/launchpad/{services,probe}.ts` probes the same gateways as `lib/server/systems/services.ts` with different code and a different list (5 agents vs Systems' 10 services).
6. The vault list isn't refreshable (`VaultsBlock` fetches once and is ignored by the Refresh button, `LaunchpadApp.tsx:276-282, 309-314`). The services-up summary is hidden on the phone (`LaunchpadApp.tsx:329`).

**Mobile**: the grid collapses to one column. The layout is fine; the links are not (issue 1).

**Enhancements**
- Tailnet-aware links: when `location.hostname` is the tailnet host, rewrite loopback hrefs to their `tailscale serve` URL when one exists, and otherwise mark them "Mac only". **S–M**.
- One service registry shared by Systems and Launchpad, so both probe once and stay consistent. **M**.
- A "Stale serve entries" hint that copies `tailscale serve --https=<port> off`, or an attention item in Systems. **S**.
- Repos: list the iCloud-evicted repos by name with a "download" hint, or add `~/Documents/PROJECTS/ErisMornCloud` as a root. Drop or confirm the placeholder Research card. **S**.

---

## Feeds — working

**Evidence**
- `GET /apps/feeds` 200. `GET /api/feeds` 200 (34 KB): 40 of 342 items, 26 sources. Totals `{total 342, unread 336, needsAction 130}`. JEV triage enabled (272 triaged, 6 pending, circuit closed). Read store persisted at `/Volumes/Windsor/VOLTA/feeds/read.json`. No warnings.
- `GET /api/feeds?needsAction=1` 200 (132 matched). `GET /api/feeds/item?id=<real>` 200 (3.6 KB). `GET /api/feeds/item?id=nope` returns 404 with a clean message.
- Good UX already: debounced search, infinite scroll with a "Load older" fallback, optimistic read marks that revert on failure, j/k/m and `/` shortcuts, empty and error states, and a list ↔ reader switch on the phone with a Back button (`FeedsApp.tsx:325, 420, 504-506`).

**Broken / missing**
1. **A failed copy shows a success toast**: `push(ok ? 'Path copied.' : 'Copy failed.', { tone: 'success' })` (`FeedsApp.tsx:456`).
2. **Counts inflated by dead sources.** "Hermes · briefings" was last updated 2026-05-04 but holds 40 of the 130 needs-action items. Five "Retired job <hash>" sources hold 108 items. "Cron Health report" was last updated 2026-10-20 with status error. The needs-action number is no longer a useful signal.
3. 336 of 342 items are unread, so read state is effectively unused and the Unread filter means little.
4. Erroring jobs (Action Orchestrate, Action Digest) are only shown as small status dots in the source list. Nothing escalates them (see Systems issue 3).
5. Nothing outside the app links here. Feeds isn't on either home screen, and the phone header hides unread and needs-action counts (`hidden lg:inline`, `FeedsApp.tsx:276-286`).

**Mobile**: good. The source rail becomes a `<select>` (`FeedsApp.tsx:367-379`), and the reader takes the full screen.

**Enhancements**
- Group retired and stale sources (no output for 14 days) under a collapsed "Archive" group and leave them out of totals. **S**.
- A "Needs action" home card (desktop and phone) listing the top 3 JEV needs-action items. **S–M**.
- A per-source "mark older than N days read" option to bring unread counts back to a meaningful level. **S**.
- Fix the toast tone. **S** (one line).

---

## Elements — partial (desktop OK, phone broken)

**Evidence**
- `GET /apps/elements` 200 (245 KB SSR, the heaviest page in scope). No API calls. Six sections, 11 specimens. The generated TSX snippet sources are **in sync** with `library/*.tsx` (checked byte for byte with `generate-sources.mjs` semantics).

**Broken / missing**
1. **The phone layout is broken**: the nav is `w-[248px] shrink-0` with no `md:` variant (`ElementsApp.tsx:163`). With `px-8` on the content (`:222`), a 375px screen leaves about 60px for the specimens. Fixed-width specimens make it worse: `w-[560px]` and `w-[720px]` in `InteractiveSections.tsx:205,304`, and `w-[560px]` in `TypographySection.tsx:238`.
2. **Demo data**: `InteractiveSections.tsx:4,206` uses `EMAIL_MIX` from `lib/mock-data.ts`. That is fine for a component gallery, but the launcher's `sample` flag (below) was meant to label exactly this, and it is never set.
3. **It doesn't cover the kit the apps actually use.** `AppTopBar`, `ToastStack`, the phone `MCard`/`Chip`/`Skel`, and the systems `Panel`/`StatusDot` aren't documented. Meanwhile `Chip` is redefined in 5 places and `StatusDot` in 4 (`feeds/FeedsApp.tsx:471`, `launchpad/parts.tsx:89`, `mobile/home/parts.tsx:102`, `sessions/SessionList.tsx:20`, `editor/nle/NleExportDialog.tsx:401`; StatusDot in `feeds/parts.tsx:7`, `launchpad/parts.tsx:34`, `systems/ServiceCard.tsx:9`, `dashboard/widgets/left-ui.tsx:20`).

**Enhancements**
- Responsive nav: below `md`, hide the rail and show a sticky horizontal section chip bar, use `px-4`, and make the fixed specimens `w-full max-w-[…]`. **S**.
- Promote `Chip`, `StatusDot`, `Skeleton` and `ErrorNote` into `components/robo-ui`, document them in a new "07 App kit" section, and replace the copies. **M**. This also helps every other app.

---

## Scripts — partial (desktop OK, phone broken)

**Evidence**
- `GET /apps/scripts` 200. `GET /api/notion/catalog` 200 (6.4 KB): 6 groups, 4 episodes (Ep 1–4), each with an outline and a ledger; `inaccessible: []`.
- `GET /api/notion/page?id=<Ep1 outline>` 200 in 1.3 s (33 KB) and `…<Ep4 outline>` 200 (42 KB). The section titles match the VO parser: `Cold open (full, ~55 s)`, `Draft VO by beat`, `Ending (…)` (`script-model.ts:168-193`), so the teleprompter, timing and "Push Cues" all work on real outlines. Ledgers are 200 (26–34 KB). A bad id returns 400 `id must be a 32-character Notion page id.`
- The log shows uncached `/api/notion/catalog` taking 5–17 s on occasion.

**Broken / missing**
1. **The phone layout is broken**: `grid-cols-[280px_minmax(0,1fr)_minmax(320px,400px)]` with no breakpoint (`ScriptsApp.tsx:153`) needs at least 600px, and the shell is `overflow-hidden`, so on a phone the ledger column is clipped off-screen and the outline gets roughly 0–100px.
2. **The teleprompter on phone or tablet**: the control strip is a single non-wrapping row of about 900px with no safe-area-top inset (`Teleprompter.tsx:143-194`). There is no Screen Wake Lock (`grep wakeLock` finds nothing), so the device sleeps mid-take. Controls are keyboard-first (R, arrows, M, ±, Esc), with no tap-to-pause on the text.
3. **The Editor hand-off is browser-local**: `pushToEditorInbox` appends to `localStorage['rubric:editor-inbox']` (`lib/editor-inbox.ts:18-27`). Cues pushed from the phone (tailnet origin `…ts.net:8447`) never reach the Editor on the Mac (`127.0.0.1:50000`). Different origins have separate storage, and nothing warns you. Repeated pushes add duplicates (no dedupe by page or chapter).
4. Read-only against Notion. That is fine for now; the "Refresh" force reload is rate-limited to 30 s per page, which is good.

**Enhancements**
- Phone layout: tabs (Catalog / Outline / Ledger) below `lg`, with the rail as a bottom sheet. **M**.
- Phone teleprompter: wrapping controls (or ones that auto-hide), tap to pause, swipe to change speed, `navigator.wakeLock.request('screen')`, and a safe-area inset. **S–M**. Reading a teleprompter on a phone or iPad is a natural use.
- A server-side editor inbox (a small JSON under `workspace/` or ErisMornCloud) so hand-offs work across devices, with dedupe by `(pageId, chapter)`. **M**. The Editor, Studio, Generations, Music and Carousels apps would all benefit.

---

## Home / launcher — partial

**Evidence**
- `GET /` 200 (203 KB; SSR renders both the phone and desktop trees, then `ResponsiveHome` unmounts one, `mobile/ResponsiveHome.tsx:22-36`).
- Home data routes all return 200: `/api/routines` (6.4 KB), `/api/skills-real` (89 KB), `/api/sources`, `/api/usage`, `/api/quota` (28.7 KB), `/api/mcp` (0.9 s), `/api/ltm/status` (7,883 captures), `/api/ltm/activity?days=7`, `/api/ltm/today`, `/api/notes/recent`, `/api/vaults`, `/api/actions?counts=1`.
- The launcher list is `MICRO_APPS` (19 entries, `lib/mock-data.ts:75-95`). It matches the 18 `src/app/apps/*` routes plus `/second-brain`, with no 404s. `GET /apps/doesnotexist` returns 404 as expected.

**Broken / missing**
1. **Routines are silently missing every OpenClaw cron job.** `/api/routines` returns 15 routines, **all `source: "launchd"`**. The log repeats ``[volta routines] `openclaw cron list` failed — showing launchd jobs only … nice: openclaw: No such file or directory``. Root cause: `openclaw` lives at `~/bin/openclaw`, which isn't on the LaunchAgent PATH (the plist PATH starts `~/.local/bin:/usr/local/bin:…`). The response has no `degraded`/`warnings` field (`lib/server/sources/routines.ts:136-145`), so the desktop RoutinesWidget, the phone RoutinesCard and Search all show a partial list as if it were complete. (This is the known `/api/routines` log line; the cause is the PATH, not a missing install.)
2. **No systems health on either home screen** (see Systems issue 1). The phone Today feed (`MobileHome.tsx:21-28`) has Awaiting, Today, LTM, Sources, Second Brain, Routines and Skills. It has no Systems card and no Feeds card.
3. **The launcher has no live state.** `MicroAppsWidget` and `MobileMenu` only show static subtitles. Unread feeds (336), awaiting tasks (19) and system alerts (6) aren't shown as badges on the app rows.
4. **"+ ADD APP" is a hint-only button**: it flashes "Add a route in src/app/apps + a MICRO_APPS entry" (`MicroAppsWidget.tsx:99`).
5. **Dead code paths**: the `sample` flag that groups "sample data" apps (`MicroAppsWidget.tsx:31-51`, `MobileMenu.tsx:23-24,230-238`, `types/os.ts:25-26`) is never set on any entry. `EmailWidget.tsx` and `YouTubeWidget.tsx` aren't imported anywhere. `mock-data.ts` still exports `CALENDAR_EVENTS`, `YOUTUBE_*`, `FLAGGED_EMAILS` and `USAGE_SNAPSHOT`, used by no component in scope. Only `/api/workspace` and `/api/files` still read `BRAIN_NODES`/`ARTIFACTS`/`SKILLS`, which are other agents' scope.
6. The launcher modal shows `:50000/apps/...` for each app (`MicroAppsWidget.tsx:189-192`), which is wrong when browsing via the tailnet (`:8447`).
7. **Cold loads are slow in dev**: `GET / 200 in 5–53 s` and `/api/vaults` 10–15 s appear in the log on cold compiles or cold caches. Over Tailscale on the phone this is the first thing you notice. (`npm run serve` exists for a prod build, but the LaunchAgent runs `next dev`.)
8. iOS requests `/apple-touch-icon.png` and `/apple-touch-icon-precomposed.png`, which return 404 in the log. Harmless, because the layout links `/apple-icon`, but it is noise.

**Mobile**: the shell is well built (safe areas, `100dvh` minus the tab bar, focus trap in the More sheet, closes on route change). The gaps are content gaps (issues 2 and 3), not layout gaps.

**Enhancements**
- Put `~/bin` on the LaunchAgent PATH, or have `routines.ts` resolve `openclaw` from `~/bin` explicitly, and add `warnings[]` to `/api/routines` that the widgets render ("OpenClaw jobs unavailable"). **S**, high value. Editing the plist needs the user's approval.
- Live badges in the launcher and More sheet: a tiny `/api/launcher/badges` (or reuse the shared-json reads of `actions?counts=1`, `systems?summary=1` and `feeds?limit=1`). **S–M**.
- Phone Today: add Systems and Feeds "needs action" cards. **S**.
- Delete the dead widgets, the dead `sample` path and the unused mock exports, or actually set `sample: true` on Elements. **S**.

---

## Top 5 enhancements (this scope)

1. **Restore OpenClaw routines and surface degradation** (**S**, very high value). Add `~/bin` to `com.epsilon.volta-os` PATH or resolve `~/bin/openclaw` in `lib/server/sources/routines.ts:101`. Add `warnings[]` to `/api/routines` and show it in RoutinesWidget, RoutinesCard and Systems. Today every routines view silently shows only 15 launchd jobs.
2. **Put system health on the home screens** (**S**). Mount the existing `SystemsBadge` in the `CenterOrbitalCore` header, add an alert dot to the phone Systems tab, and add a Systems card to `MobileHome`. The critical Voltamachina 97.2% alert is currently invisible unless you open Systems.
3. **Make Tasks actionable** (**M–L**). Approve / Done / Snooze / Reply on the 19 awaiting items via an append-only decisions file or the OpenClaw CLI (OpenClaw keeps ownership of `actions.md`). Add an inline wiki-note viewer and fix the drawer on the phone.
4. **Phone layouts for Scripts and Elements, plus a usable phone teleprompter** (**M**). Tabbed panes below `lg`, a responsive Elements nav, wrapping teleprompter controls, tap to pause, wake-lock and safe-area insets.
5. **One shared service registry for Systems and Launchpad, reachable over the tailnet** (**M**). One prober, links rewritten to `tailscale serve` URLs (or marked "Mac only") when browsing remotely, stale serve entries flagged, and OpenClaw cron failures (already known to Feeds) raised as attention items.

## Cross-app opportunities

- **One "Needs you" inbox.** Systems attention (6), Tasks awaiting (19) and Feeds needs-action (130, about 40 of them stale) are three separate counters with three separate UIs. A single home card and launcher badge that merges them, with deep links into each app, gives the most value for the effort on both desktop and phone.
- **Feeds → Systems → Tasks chain.** Feeds already knows which OpenClaw jobs are erroring (Action Orchestrate, Action Digest, Cron Health). Systems should raise them, and Tasks items should link back to the Action Capture / Orchestrate run that created them.
- **Server-side hand-offs.** The localStorage editor inbox (Scripts → Editor, and also Generations, Studio, Music and Carousels) breaks across devices and origins. Move it to a small server JSON store.
- **A shared UI kit.** Several copies each of `Chip`, `StatusDot`, `Skeleton` and `ErrorNote`. Promote them to `robo-ui` and document them in Elements, so phone fixes (tap targets, safe areas) land once.
- **Phone-aware actions.** Anything that opens a Mac app (Systems "Fix with agent", Tasks/Feeds "copy `open …`", Launchpad loopback links, `obsidian://` vault links) should detect the tailnet origin and offer a remote-friendly alternative.
- **Dev vs prod serving.** Cold dev compiles (5–53 s for `/`) dominate the phone experience. A prod LaunchAgent (`npm run serve`, `.next-prod`) would fix that, but check `df -h /` first (boot has ~21 GiB free) and put the build output on ErisMornCloud if it is large.
