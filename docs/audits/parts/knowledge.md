# Audit — Knowledge & memory apps (ltm, honcho, sessions, search, research, recos)

Audited 2026-10-27 against the running dev server (`next dev --turbopack`, http://127.0.0.1:50000, Node v22.23.1).
Method: read pages/components/API routes/server libs, then GET-only `curl` of every page and every GET API route,
plus `~/Library/Logs/volta-os.log` (tail). No POST routes were called (Honcho chat/search/query and the research
JEV re-rank can cost money). Nothing in the source tree was edited.

## Summary

| App | Status | Top issue | Top enhancement |
|---|---|---|---|
| **ltm** | partial | Intermittent `500 database is locked`: the SQLite handle is opened without a busy timeout (`ltm.ts:35`). The UI also has no phone layout (fixed 248px rail + 380px-min inspector). | One-line fix: `{ readOnly: true, timeout: 2000 }`, then a phone layout that shows one pane at a time. |
| **honcho** | partial | All GET routes return real data and offline/404 errors are handled well, but the app can't be used at phone width: the 264px rail always shows, and the Sessions tab adds another 300px list. | Phone layout (rail becomes a drawer). Then add a way to flag or delete wrong conclusions. |
| **sessions** | partial | Data and index work (1,642 files indexed in 2.4s). The layout needs about 800px (264 + 360 min + 46vw), so it doesn't work on a phone. Search only matches metadata, not what was said in transcripts. | Phone layout, then full-text search of transcripts (also as a VOLTA Search source). |
| **search** | working | Two of this group's richest sources are missing (Claude Code sessions, research library). Honcho shows `partial` on cold queries (2s per-workspace budget). The "Notion" source only matches titles taken from LTM window titles. | Add `sessions` and `research` sources (and a real Notion title search). |
| **research** | partial | Threads → Clusters and Bridges are empty: both graphify `graph.json` files are iCloud placeholders (`/api/research/graph` returns 409), but the UI says "No cluster matches." / "No graph edges cross folders." | Show the real reason in those empty states and keep the graphs local (Windsor). Add a `?doc=` deep link. |
| **recos** | working | Done/skip/cart state lives in `localStorage`, so phone and Mac don't share it. One source link is `http://localhost:37777`, which is dead on the phone. | Keep reco state on the server. Link Routines/Systems cards to the Systems "Fix with agent" action. |

Pages: every `/apps/<name>` returned **200** in 50–90 ms with no error markers. The tailnet path works for all six
APIs: `Host: <tailnet>` without `Tailscale-User-Login` returns 403, and with the allowed login returns 200.

---

## 1. LTM (`/apps/ltm`)

Files: `src/app/apps/ltm/page.tsx`, `src/components/ltm/*` (1,503 lines), `src/app/api/ltm/*`, `src/lib/server/ltm.ts`.
Data: `/Volumes/Windsor/LTM/ltm.sqlite` (read-only `node:sqlite`). It holds 7,883 captures from 2026-10-07 to now, 68 apps, and 6,803 pruned rows.

### Functional status: GET results

| Request | Status | Notes |
|---|---|---|
| `/api/ltm/status` | 200 (0.30s) | `available:true, total:7883, pruned.total:6803` |
| `/api/ltm/days` | 200 | 21 days, top apps per day |
| `/api/ltm/apps?date=2026-10-27` | 200 | 14 apps |
| `/api/ltm/captures?date=…&limit=3`, `?q=volta` | 200 (~0.27s) | snippets redacted, `hasFrame` set |
| `/api/ltm/captures/14686` | 200 | full OCR text plus prev/next ids |
| `/api/ltm/frame/14686` | 200 `image/jpeg`, **826 KB** | `no-store` |
| `/api/ltm/frame/1` | 404 | pruned frame; the UI handles it (`CaptureInspector.tsx:148` `onError`) |
| `/api/ltm/today`, `/api/ltm/activity?days=3`, `/api/ltm/sessions?date=…` | 200 | vault session notes come back with tl;dr and capture ranges |
| `/api/ltm/captures/abc`, `?date=bad` | 400 | input validation works |

**Broken: SQLite lock errors.** The log has 12 `database is locked` errors. They come from `getToday` (`ltm.ts:260/266`, via
`/api/ltm/today`), `getActivity` (`ltm.ts:237`), `listCaptures` (`ltm.ts:157`) and `withDb` (`ltm.ts:46`). History in the log:
`GET /api/ltm/activity?days=14 500` ×7, `GET /api/ltm/today?... 500` ×10.
- Root cause: the DB uses `journal_mode=delete` (checked with a read-only `PRAGMA journal_mode`), so a reader that hits the capture
  daemon's write lock fails at once. `ltm.ts:35` opens `new sqlite.DatabaseSync(LTM_DB_PATH, { readOnly: true })` with **no
  busy timeout**.
- Fix (S): `{ readOnly: true, timeout: 2000 }`. Node 22.23's `node:sqlite` accepts it; I checked that `PRAGMA busy_timeout` reads back 2000.
  One change fixes the LTM app, the home "Today" widget and the VOLTA Search LTM source, which share `openDb()`.
- `localJson`/`ltmError` map everything that isn't `LtmUnavailableError` to 500. A busy error should come back as 503 + `retry`, so widgets
  show "busy" instead of an error.
- The `/api/ltm/status 500` ×18 entries in the log are not LTM bugs. They happened while the editor had a `module-not-found` compile error and every
  route was failing.

**Other findings**
- **Privacy:** LTM holds **18 captures of the macOS Passwords app** (`/api/ltm/captures?app=Passwords`). Their screenshots and OCR text can be browsed in
  the viewer and over the tailnet, and they are searchable from VOLTA Search. `redactSecrets` only masks token-shaped strings. I did not open the contents.
  Recommendation: an app denylist (Passwords, Keychain Access, 1Password…) applied in `listCaptures`/`getCapture`/`resolveFrame`. Upstream
  unvolta-ltm should also exclude these apps at capture time.
- Data quality (upstream): capture 14686 is labelled `app: Finder, title: exports`, but its OCR text is a Safari window. The app label is
  sometimes wrong, so app chips and filters can mislead.
- Server-wide stall: at one point every request, including `/apple-touch-icon.png`, took about 52s (`GET /apps/honcho?... 200 in 52598ms`). That came
  right after an LTM lock error. I could not prove the cause. Note that `node:sqlite` is synchronous and runs on the dev server's only event loop, so a slow LTM query
  blocks every app.
- Session notes depend on `com.unvolta.ltm-ingest`, which Recos currently reports as **failing**. Vault notes for recent days may be missing.
- Error, empty and offline states are good: the drive-unmounted card with Retry (`LtmApp.tsx:413`), deep-link notices, and toasts on load failure.

### Mobile
- **No responsive variants anywhere in `src/components/ltm/`** (0 `sm:/md:/max-md:` classes).
- Three fixed columns: `DayRail` `w-[248px]` (`DayRail.tsx:32`), main, and `CaptureInspector` `w-[42%] min-w-[380px]` (`CaptureInspector.tsx:32`).
  That is at least 628px, so on a 390px phone the main list is squeezed to nothing and the page overflows.
- Keyboard-only affordances (`j/k`, `←/→`, `f`) don't exist on a phone. Day stepping needs visible buttons.
- Frames are ~800 KB full-size JPEGs with `no-store`, which is slow over Tailscale/cellular.

### What it lacks
- A phone layout (day list → capture list → capture detail).
- Thumbnails (list rows have no image preview).
- A "what was I doing at time X" view joined to Claude sessions and Honcho messages.
- Export or copy of a time range as Markdown (a session note exists only when ltm-ingest ran).

### Enhancements
| Enhancement | Value | Effort |
|---|---|---|
| Busy timeout + 503-on-busy | Removes the recurring 500s in three places | S |
| App denylist (Passwords etc.) in the viewer, search and frames | Closes a real privacy hole that the tailnet exposes | S |
| Phone layout: one pane at a time, swipe/buttons for day ±, inspector as a full-screen sheet | Makes LTM usable from the phone at all | M |
| `/api/ltm/frame/<id>?w=480` downscaled thumbnails (cache them on Windsor, not the boot disk) | Fast list previews and mobile bandwidth | M |
| Time-window cross-links: "Claude sessions active at this minute" / "Honcho messages ±10 min" in the inspector | Turns three memories into one timeline | M |

---

## 2. Honcho (`/apps/honcho`)

Files: `src/components/honcho/*` (2,570 lines), `src/app/api/honcho/**` (17 routes), `src/lib/server/honcho.ts`.
Upstream: self-hosted Honcho at `http://127.0.0.1:8000`, online (6 ms). Workspaces: `openclaw`, `Hermes`, `pi`.

### Functional status: GET results
| Request | Status |
|---|---|
| `/api/honcho/status` | 200 `{online:true, latencyMs:6}` |
| `/api/honcho/workspaces` | 200, 3 workspaces |
| `…/{openclaw,Hermes,pi}/{stats,queue,peers,sessions,conclusions}` | 200 for all 15, real data (stats are cached 10 min, `computedAt` shown) |
| `…/openclaw/peers/owner/{card,representation,sessions}` | 200 (`peer_card:null` for owner, rendered as empty) |
| `…/pi/sessions/<s>/{messages,summaries,peers}` | 200 (summaries `null`, i.e. none derived yet) |
| `…/pi/peers/nope/card` | 404 `{"error":"Peer nope not found…","upstreamStatus":404}` |
| `…/workspaces/nope/peers` | 200 empty list (no workspace is created; I confirmed the list stayed at 3) |
| `…/workspaces/../x/peers` | 404 (Next normalises the path) |

Not exercised: the POST routes `chat`, `search`, and `conclusions/query`. These are the dialectic LLM and embedding calls, so they may cost money.
Earlier log lines show one `stats 503` and `owner/card|representation|sessions 404` from a time Honcho was booting. Those are handled by `HonchoOffline`.

No stubs, TODOs or mock data. Offline handling is thorough: `HonchoOffline` with a 15s auto-retry, a copyable `docker compose up -d`
command, and a 4s read timeout vs 180s for chat. Secrets are masked deep in every proxied response (`_shared.ts:27`).

**Code note (DRY):** `_shared.ts:122` defines its own `rejectCrossSite`, which mostly duplicates `local-only.ts:42`. The two behave
slightly differently: Honcho's version allows a missing or other `Sec-Fetch-Site` value that isn't `cross-site`/`same-site`. The shared helper is stricter. Consolidate on `rejectNonLocalRead`.

### Mobile
- `HonchoRail` is always `w-[264px]` (`HonchoRail.tsx:29`). The Sessions tab adds a `w-[300px]` session list (`SessionsTab.tsx:65`). On a 390px phone
  the thread gets under 130px, and the Sessions tab needs at least 564px.
- `AskPanel` is `w-[340px]` (`AskPanel.tsx:147`). Below xl it overlays (`max-xl:absolute`), which works, but it covers almost the whole phone screen
  with no full-width variant.
- The tab nav (4 pills plus the "workspace · x" label) fits.

### What it lacks
- Memory hygiene: it is read-only, so there is no way to flag, correct or delete a wrong conclusion. Honcho's deriver restates things
  (and secrets), so this matters.
- No diff of what was learned this week per peer, and no queue or deriver trend (only the current snapshot).
- No link from a Honcho message to the LTM or Sessions moment it came from.

### Enhancements
| Enhancement | Value | Effort |
|---|---|---|
| Phone layout: rail becomes a workspace/peer drawer, Sessions tab becomes list → thread navigation, AskPanel goes full-screen below md | Usable on the phone | M |
| Delete or flag conclusions, behind a confirm and `rejectNonLocalMutation` | Lets you correct the memory | M |
| "New conclusions since <date>" per peer (filter `created_at`) | Shows what the agents learned about you | S |
| Consolidate the cross-site guard into `local-only.ts` | One security code path | S |

---

## 3. Sessions (`/apps/sessions`): Claude Code transcripts

Files: `src/components/sessions/*` (1,595 lines), `src/app/api/claude-sessions/*`, `src/lib/server/sources/sessions.ts` (1,516 lines).

### Functional status: GET results
| Request | Status |
|---|---|
| `/api/claude-sessions?limit=3` (cold) | 200 in 1.85s, `progress.state:"scanning"` 385/1642 files, partial results flagged in the UI |
| same, a few seconds later | 200 in 0.30s, `state:"ready"`, 1,642 files / 938 MB indexed in 2.4s, 108 sessions / 32 projects |
| `/api/claude-sessions/<id>` | 200 (7.8 KB detail) |
| `/api/claude-sessions/<id>/transcript?limit=2`, `offset=-1` | 200, paginated (total 251) |
| `/api/claude-sessions/<id>/memory` | 200, claude-mem observations (116 KB) |
| unknown id / `bad..id` / `sort=nope` | 404 / 400 / 400 |

No stubs or dead buttons. Useful touches: a copyable `claude --resume <id>` (`SessionDetail.tsx:341`), subagent transcripts, the
automated-project split, 24h/7d/30d filters, and 30-day sparklines.

### Mobile
- No responsive variants in `src/components/sessions/`.
- The layout is `ProjectRail` `w-[264px]` (`ProjectRail.tsx:146`) + `main min-w-[360px]` (`SessionsApp.tsx:280`) + detail
  `w-[min(46vw,760px)]` (`SessionDetail.tsx:301/312`). That is about 800px minimum, so it doesn't work on a phone.

### What it lacks
- **Full-text search of what was said.** The query only matches titles, prompts, projects, branches, tools and skills (`sessions.ts:1038`,
  placeholder at `SessionsApp.tsx:247`). "Which session did I fix X in" is the main use case.
- Not a VOLTA Search source.
- No per-session cost estimate, even though token counts exist (3.4 B tokens tracked).
- No export of a transcript to Markdown or Obsidian.

### Enhancements
| Enhancement | Value | Effort |
|---|---|---|
| Phone layout: project picker → list → detail | Usable from the phone | M |
| Transcript full-text index (user and assistant text only, built lazily like the notes index; keep it in memory or on Windsor) | Find sessions by content | M |
| Expose that index as a `sessions` source in VOLTA Search (deep link `/apps/sessions?id=…`) | One search box covers Claude history | S, after the index |
| "Export transcript as Markdown" (copy or download) | Hand-offs and Obsidian | S |

---

## 4. VOLTA Search (`/apps/search` + the global ⌘K palette)

Files: `src/components/search/*` (1,058 lines), `src/app/api/search/route.ts`, `src/lib/server/search/*` (1,236 lines).

### Functional status
| Request | Status | Per-source result |
|---|---|---|
| `/api/search?q=honcho&limit=3` | 200 in 2.4s | ltm ok 36ms (1,901) · notes ok 2,053ms (143, index cold) · claude-mem ok · **honcho partial 2,073ms** · notion/skills/routines/mcp ok (0) |
| `/api/search?q=windsor%20drive` | 200 in 2.3s | notes now 51ms (warm) · claude-mem 2,095ms · honcho **partial** |
| `/api/search?q=dropbox&sources=honcho` | 200 | honcho **ok 99ms** (warm), so `partial` is a cold-embedding timeout |
| `/api/search?q=x` | 200 | below the 2-char minimum, no sources |
| `/api/search?q=` | 200 `{"warming":["notes","skills"]}` | warm-up path works |

Each source has its own timeout and status (ok/partial/offline/timeout/skipped), so one slow source doesn't break the page. Results
deep-link into LTM and Honcho at the exact capture or message.

**Issues**
- Honcho message search gets **2s per workspace** (`sources.ts:188` `withTimeout(searchWorkspace(...), 2_000)`). The first query
  after idle times out and shows `partial` with no message hits. The global source budget is 2.5s, so a dedicated 2s inner cap is tight.
  Consider 2.4s plus a small warm-up on palette open (the palette already calls `?q=` to warm notes and skills).
- The "Notion" source is **titles of Notion pages seen in LTM window titles** (163 known, only 8 with a URL), not a Notion search, even though
  the app has a Notion integration (`src/lib/server/notion`).
- Source list `types.ts:5`: `ltm, notes, claude-mem, honcho, notion, skills, routines, mcp`. **Claude Code sessions and the research
  library are missing**, though both have their own indexes in this repo.
- Through LTM hits, search surfaces Passwords-app captures too (see LTM privacy).

### Mobile
Single-column layout, `md:grid-cols-[1fr_1.2fr]` for results, `sm:` hides keyboard hints. **It works on a phone.** But
LTM/Honcho/Sessions hits open apps that don't work at phone width, so search on the phone mostly ends in an unusable page.

### Enhancements
| Enhancement | Value | Effort |
|---|---|---|
| Add `research` source (reuse `lib/server/research/search.ts`, deep link `/apps/research?doc=`) | Papers in the same search box | S |
| Add `sessions` source (see Sessions) | Claude history in the same search box | S–M |
| Real Notion title search via the existing Notion client (cached) | The Notion source becomes useful | S–M |
| Raise the Honcho inner timeout and pre-warm on palette open | Fewer `partial` results | S |

---

## 5. Research (`/apps/research`)

Files: `src/components/research/*` (2,297 lines), `src/app/api/research/*` (8 routes), `src/lib/server/research/*` (2,274 lines).
Config: `config/research.json` (inventory TTL 30 min, persisted to `/Volumes/Windsor/VOLTA/research/inventory.json`, 2 MB).

### Functional status: GET results
| Request | Status | Notes |
|---|---|---|
| `/api/research/status` | 200 (0.9s) | inventory 6,886 files, `building:true` (the 30-min TTL expired, so a stat-only background refresh started; this is normal app behaviour) |
| `/api/research/stats` | 200 | 6,912 docs, **631 indexed (9%)** |
| `/api/research/search?q=memory&limit=2` | 200 | 66 hits, joined to Stage A |
| `/api/research/doc?id=a_20260607-093536-3` | 200 | row, stageA, stageBText, vaultNotes, concepts, related |
| `/api/research/syntheses` | 200 | 4 syntheses, **0 from the vault** |
| `/api/research/synthesis?id=e:…` | 200 | |
| `/api/research/threads` | 200 | **`clusters:0, clusterTotals:0, folderBridges:0`**, highlights 40, domain network present |
| `/api/research/graph?source=voltamachine` | **409** | `…/ErisMornCloud/voltamachine-graph/graphify-out/graph.json is an iCloud placeholder (not downloaded)` |
| `/api/research/graph?source=uap` | **409** | same, for `UAP-UFO-graph` |
| `/api/research/doc?id=../x` | 404 | validation works |

Not exercised: `?refresh=1` (forces an inventory rebuild) and `rerank=1` (sends titles/summaries to JEV/TypeSafe).

**Root cause of the empty Threads views:** both graphify outputs were offloaded to `~/Documents/PROJECTS/ErisMornCloud/`, which is
iCloud-backed, and evicted. `/api/research/status.graphs[*].error = "iCloud placeholder: not opened"`. The server refuses to download them on purpose.
- The UI then shows **"No cluster matches."** (`ThreadsView.tsx:147`) and **"No graph edges cross folders."** (`ThreadsView.tsx:228`).
  Both are misleading. The real reason appears only on the Status tab.
- Fix: put the graph error into `ThreadsResponse` and render "Graph not available locally — run `brctl download <path>` (copy)". Long term,
  keep `graphify-out/graph.json` on Windsor, which is not evicted, rather than in an iCloud folder.

**Other findings**
- Coverage: only the `science` root has Stage A data (605/1,852). `ai` (1,819), `q` (3,103) and `grimoire` (112) have 0 indexed. Nearly
  all files are iCloud-only. The batch indexer is under an owner hold (`VM_BATCH_INDEX_ENABLED`) and Stage B has 204 empty stubs vs 188 full.
  These are pipeline states, shown honestly on the Status tab.
- Phase 2 (embeddings/semantic search) is "not built yet" (`status.phase2`). Search is lexical with an optional JEV re-rank.
- **Mislabelled buttons:** "Open in Finder path" (`LibraryView.tsx:127`, `DocPanel.tsx:81`) only copies the path to the clipboard.
- No URL deep links: the tab is kept in `localStorage` (`ResearchApp.tsx:23`), and the open doc isn't in the URL. Other apps and search can't link to a paper.
- No in-app PDF viewing, even when a local Voltamachina mirror copy exists. The user has to copy the path.

### Mobile
- Library, Threads and Status mostly reflow (`flex-wrap`, `xl:grid-cols`). `DocPanel` is `w-full max-w-[560px]`, which is fine.
- **Syntheses** uses a fixed `w-[360px]` list (`SynthesesView.tsx:54`) beside the article. At 390px the article gets about 30px.
- `ThreadsView` filter input is `w-56`, which is OK.

### Enhancements
| Enhancement | Value | Effort |
|---|---|---|
| Honest Threads empty states (graph unavailable + brctl copy), and move graph.json to Windsor | Threads works again, or at least explains itself | S |
| `?tab=` / `?doc=` deep links | Search, Recos and notes can link to a paper | S |
| Rename "Open in Finder path" to "Copy path". Add `GET /api/research/file?id=` that streams the **local mirror only** (never triggers an iCloud download) for in-app PDF view | Read papers from the phone | M |
| Syntheses list → article stack below md | Phone | S |
| Phase 2 embeddings, offloaded to Windsor | Semantic paper search | L |

---

## 6. Recos (`/apps/recos`)

Files: `src/components/recos/*` (909 lines), `src/app/api/recos/route.ts`, `src/lib/server/recos/index.ts`.

### Functional status
`GET /api/recos` returns 200 in 0.32s (cached for 120s, stale for up to 30 min). All 4 signals are `ok`:
- Notion: 3 playbook pages
- Routines: 15 read, **4 failing**: `com.local.openclaw-manual-backup`, `ai.omniroute.scheduled-restart`, `ai.omniroute.breaker-decay`, `com.unvolta.ltm-ingest`
- Systems: 6 attention items, 1 service down
- Memory sources: 8 read

11 cards, 7 priority, all built from real signals. No mock data, no estimated dollar savings. Cards carry evidence, steps, a copyable command and a source link.
Cart → "Execute: build & copy agent prompt" only builds and copies a prompt (`RecosApp.tsx:213`). The spec's `/api/recos/apply`
(writes to `./workspace`, `MICRO_APPS_SPEC.md:158`) was **intentionally not built**, which is consistent with the read-only stance.

**Issues**
- Done/skipped/cart state is **`localStorage` per ISO week** (`RecosApp.tsx:92/106`). Closing a card on the phone doesn't close it on the Mac.
- A "claude-mem is stale" card links to `http://localhost:37777` (`source.href`). On the phone over Tailscale that is the phone's own localhost, so the link is dead.
  `obsidian://` links only work if the vault is on the phone.
- Routine card commands are `launchctl list <label>` (diagnose only). Systems already has one-click "Run / Fix with agent", but Recos doesn't link to it.
- Filter tabs come from the real buckets (Content/Routines/Systems/Memory), so the spec's Apps/Skills buckets never appear. That is fine, but some Notion playbook cards
  ("How to Build an AI Video Business…") are evergreen and come back every week with no snooze.

### Mobile
This is the only app in the group with deliberate phone handling: 18 `md:` and 5 `max-md:` variants, the rail hidden below md, and a full-width cart drawer
(`max-w-[440px]`). **It works on a phone.**

### Enhancements
| Enhancement | Value | Effort |
|---|---|---|
| Server-side reco state (small JSON in `workspace/` or the Windsor offload dir), shared by phone and Mac | One source of truth | S–M |
| Routine/Systems cards: "Fix with agent" button reusing the Systems action | One-tap fix where you notice the problem | S |
| Snooze (N weeks) for evergreen playbook cards | Less noise | S |
| Rewrite `localhost` hrefs to the VOLTA proxy path or hide them on non-local hosts | No dead links on the phone | S |

---

## Top 5 enhancements (this group)

1. **LTM SQLite busy timeout + 503-on-busy** (S). Change `ltm.ts:35` to `{ readOnly: true, timeout: 2000 }`. This removes the recurring
   `database is locked` 500s in the LTM app, the home Today/activity widgets and the VOLTA Search LTM source.
2. **Phone layouts for LTM, Honcho and Sessions** (M each, one shared pattern). Below md, show one pane at a time (rail → list → detail sheet) and put
   the rails in a drawer. Search and Recos already work on a phone, but they link into these three apps, which don't.
3. **LTM sensitive-app denylist** (S). Hide Passwords/Keychain/1Password captures (18 Passwords captures exist today) from the viewer,
   frames and search. This matters most because the data is reachable over the tailnet. Also exclude those apps upstream in unvolta-ltm.
4. **Add Sessions and Research to VOLTA Search** (S–M). Add a full-text transcript index for Sessions and reuse the research search, with
   `/apps/sessions?id=` and a new `/apps/research?doc=` deep link. That gives one search box over all of Claude history and the paper library.
5. **Research Threads: honest empty state + local graphs** (S). Show "graph.json is an iCloud placeholder — `brctl download …`" in place of
   "No cluster matches.", and keep graphify outputs on Windsor so Clusters and Bridges work again.

## Cross-app opportunities

- **One timeline over the memories.** LTM captures, Claude sessions (start/end/active spans) and Honcho messages all have timestamps.
  An "at this moment" panel in the LTM inspector (and the reverse links from Sessions and Honcho) would turn three separate viewers into one.
- **Shared phone shell.** Build one `<ResponsivePanes>` primitive (rail/list/detail with a `max-md` stack and back button) and use it in
  LTM, Honcho, Sessions and Research Syntheses. That is cheaper than four custom layouts.
- **Shared guards.** Honcho's private `rejectCrossSite` (`api/honcho/_shared.ts:122`) duplicates `lib/server/local-only.ts`. Use one path.
- **Recos ↔ Systems ↔ LTM.** The failing `com.unvolta.ltm-ingest` routine (Recos) is why LTM vault session notes go stale. Show that status
  in the LTM day header ("vault notes stale since …") and add a "Fix with agent" action on the reco card.
- **Server-side per-user state.** Recos marks, Research tab and Search recents all live in `localStorage`. A tiny shared state store would
  keep phone and Mac in step.
- **Synchronous SQLite on the dev server's event loop.** LTM uses synchronous `DatabaseSync`, so a slow or locked query stalls every app. The log shows one about-52s
  server-wide stall. Keep queries indexed and short, or move LTM reads to a worker if stalls repeat.
