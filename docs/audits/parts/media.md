# Micro-apps audit, part: media and creative apps (2026-10-27)

Scope: **editor, generations, studio, music, podcast, carousels**. This was a read-only audit. Every request was a GET against the live dev server at `http://127.0.0.1:50000` (LaunchAgent `com.epsilon.volta-os`). I also read the tail of `~/Library/Logs/volta-os.log` and `~/Library/Logs/volta-podcast.log` and ran `tsc --noEmit`, which passed clean.

Method: I mapped the codebase with the architect-codebase-context skill. The app registry is `MICRO_APPS` in `src/lib/mock-data.ts:75-95`. Each page is an 8-line server wrapper around one client `*App` component. Server logic lives in `src/lib/server/<app>/`, and every route goes through `local-only.ts` and `route-helpers.ts`.

## Summary

| App | Status | Top issue | Top enhancement |
|---|---|---|---|
| editor | **partial** | Edit-mode state is stored in iCloud-synced `~/Documents/.../ErisMornCloud/volta/editor`, and iCloud has already evicted it: the saved sequence returns **500 "Unknown system error -11"**, filmstrip thumbnails 500, export history is lost, and the compiled text-renderer binary is a dataless placeholder | Move `NLE_ROOT` out of iCloud (a `.nosync` folder, Windsor, or `~/Library/Application Support`) and map EDEADLK to a 409 with a clear message (S) |
| generations | **working** | No daily or monthly spend cap: only a $5 cap per request (`media/config.ts:13`). Today's estimated spend ($3.76) is hidden on phones | Enforce a daily budget on the server and show it on mobile (S) |
| studio | **partial** | **9 of 13 presets are blocked** because the project files are iCloud placeholders; only the 4 ffmpeg-tools presets can run. 33 of 38 recent outputs are offline. The job list polls every 6 s while idle | A hydrate or relocate flow for projects (M); slow idle polling to 60 s (S) |
| music | **partial** (cannot play anything today) | **0 of 19 tracks are local**: every track is iCloud-dataless, so play, cover and probe all return 409. Suno is `needs_setup` (`com.epsilon.suno-api` last exit 78). On a phone the player bar overflows | Move VANTA VECTOR to Windsor or hydrate it, add Media Session lock-screen controls, and do a mobile layout pass (M) |
| podcast | **working, degraded** | The 06:00 run on 2026-10-27 finished, but **research failed on 0 of 8 topics**. The root cause is hidden because `llm.ts:101` drops stdout and truncates to the command line. Every OmniRoute script also gets a wrong "local fallback" warning | Capture the claude -p error JSON, fix the warning label, and flag an episode when research comes back empty (S) |
| carousels | **working on desktop, broken on phone** | Two fixed side panes (`w-[272px]` and `w-[360px]`) with no breakpoints add up to 632 px on a 390 px screen. A cold load takes 11.1 s (Notion) | Stack the panes on phones and make the deck queue a drawer (S) |

---

## editor (`/apps/editor`, `src/components/editor/**`, `src/lib/server/editor/**`)

**Live checks**
- `GET /apps/editor` 200 (0.04 s). `GET /api/editor/media` 200, 11 groups, 138 items, **121 offline** (iCloud). `GET /api/editor/skills` 200. `GET /api/editor/feedback?fileKey=g_mvq79u1y-1088c6` 200. `GET /api/editor/feedback` with no key gives 400 `Bad file id.` (correct validation).
- `GET /api/editor/nle/projects` → `{"projects":[]}`, but `projects/seq_mvqr9rf62h7r1.json` exists on disk.
- `GET /api/editor/nle/projects?id=seq_mvqr9rf62h7r1` → **500** `{"error":"Sequence file is unreadable: Unknown system error -11: Unknown system error -11, read"}`.
- `GET /api/editor/nle/export` → `{"jobs":[]}`, but `cache/export-jobs.json` exists.
- Log: 6× `GET /api/editor/nle/thumbs?...&img=1 500`, each `Error: Unknown system error -11 ... at src/app/api/editor/nle/thumbs/route.ts:23` (`fs.readFile(t.file)`).
- The other editor 500s in the log (`/api/editor/media`, `/apps/editor`, `nle-panels-sandbox`) happened during mid-edit `Module not found: './NleTimeline'` compiles. They are transient and all of those routes return 200 now.

**Root cause (Edit mode).** `src/lib/server/editor/nle/paths.ts:13` sets `NLE_ROOT = ~/Documents/PROJECTS/ErisMornCloud/volta/editor`. `~/Documents` is iCloud Drive (`com.apple.file-provider-domain-id: ...iCloudDriveFileProvider`). `ls -lO` shows **16 of 28 cache files are `compressed,dataless`** a few hours after they were written. That includes:
- the saved sequence
- `export-jobs.json`
- every `text_*.png` and its `.json` sidecar
- older `thumbs_*.jpg` files
- `cache/bin/nle-text-0d41a8645c8e`, the compiled Swift text renderer

errno -11 is EDEADLK ("Resource deadlock avoided"), which is what a read of a dataless file returns. Studio logged the same error: `nice: .../node_modules/.bin/remotion: Resource deadlock avoided`.

Where the code goes wrong:
- `thumbs.ts:36-37`: the cache-hit test `have.isFile() && have.size > 0` passes for a dataless file. The read then fails and the route returns 500 instead of regenerating the thumbnail.
- `projects.ts:53-58`: `listProjects` swallows the read error and returns nothing, so the user's saved edit silently disappears from the list.
- `export.ts:41-45`: a failed load is treated as "none yet", so export history is lost.
- `text.ts:127`: the `stat(BIN).isFile()` check passes for the dataless binary. Spawning it will fail with EDEADLK, so text clips break in preview rasters and exports after a restart.

**Review mode** works on real data: media bin, pins, feedback saved to Windsor, Notion episode tagging, and copy-prompt.
- "Teach my /cut" and "Teach my /animate" only write VOLTA's **workspace copy** (`src/app/api/editor/apply-feedback/route.ts:3-5`). The live skills in `~/.claude/skills` never learn unless the user pastes the prompt, so the "self-improving" loop is one manual step short.
- Hand-offs from Generations, Studio, Music, Scripts and Carousels go through **per-browser localStorage** (`src/lib/editor-inbox.ts:6-27`). Something sent from the phone never reaches the Mac.
- Edit mode does not read the inbox at all. It only sees `/api/editor/media` and uploads.

**Mobile.** Review and Edit panes stack below md (`EditorApp.tsx:784,838`; `NleWorkspace.tsx:472,475`).
- The timeline container's inline `style={{height: tlH}}` (`NleWorkspace.tsx:489`) overrides `max-md:h-[50dvh]`.
- The three stacked panes (55 + 45 + 60 dvh) scroll inside a flex-1 region above a fixed-height timeline, which leaves the scroll region cramped.
- Asset drag uses HTML5 DnD (`nle/dnd.ts`), which is unreliable on iPhone. The "+" add buttons are the fallback.

**Missing.** A recovery path when the sequence is unreadable, a sequence list that reports unreadable files, Edit-mode consumption of hand-offs, and a "send export to Studio/HyperFrames render" link (the HyperFrames export exists as a POST, but nothing renders it).

**Enhancements**
- Relocate `NLE_ROOT` (cache and bin to `~/Library/Caches/volta-nle`, projects to Windsor or `editor.nosync`). Treat `blocks === 0 && size > 0` as a cache miss or a 409. Value high, **S**.
- Have `listProjects` return `{ unreadable: [...] }` instead of dropping entries. Value medium, **S**.
- Server-backed editor inbox (a JSON file on Windsor) that both modes can read. Value medium-high, **M**.
- Opt-in "apply to live skill", with the existing DiffModal showing a diff against `~/.claude/skills/<skill>/SKILL.md`. Value high, **M**.

## generations (`/apps/generations`, `src/components/media/Gen*`, `src/lib/server/media/**`)

**Live checks**
- `GET /apps/generations` 200.
- `GET /api/media/status` 200 (1.0 s): xAI (3 image and 3 video models), Gemini Omni, and ElevenLabs (28 voices, free tier, 7,956 of 10,000 chars left). Storage on Windsor has 29.3 GB free. `todaySpendUsd: 3.76`.
- `GET /api/media/items` 200, 12 items (10 videos today, 1 voice, 1 image).
- `GET /api/media/file?id=mvq79u1y-1088c6` 206 `video/mp4` (range streaming works).
- `GET /api/media/job` with no id → 404 `Unknown job (the server may have restarted).` (expected).
- No Generations 500s in the log.

**Working:** quote → confirm (`GenConfirm.tsx`, arm delay of 800 ms) → generate → poll → gallery. The shot-list router (Flow-first, `ShotListPanel.tsx`) and export-to-folder also work.

**Gaps**
- No daily or monthly budget, only `MAX_REQUEST_USD = 5` per request (`src/lib/server/media/config.ts:13`). Ten small requests can add up to $50.
- No way to delete, archive, favourite or tag generations; there is no such route under `/api/media`.
- No image-to-video or reference-image input, and no seed or "re-roll this" from an existing item. The composer has no `image_url` or reference handling.
- Job state lives in server memory, so a restart orphans a running job (see the `media/job` message above).

**Mobile**
- Today's spend is `hidden md:inline` (`GenerationsApp.tsx:293`), so the phone never shows it.
- The voice preview card has `min-w-[420px]` inside a `max-w-[94vw]` modal (`GenGallery.tsx:45`), so it overflows on a phone.
- The toast stack is fixed at `bottom-5 right-5 w-[340px]` (`elements/kit/toast`, and the same pattern in `media/ui.tsx:118`), where it sits over the MobileTabBar.

**Enhancements**
- Server-side daily cap from an env var, with a "today / cap" meter visible on mobile. Value high, **S**.
- Use an existing image as the start frame for video. Value high, **M**.
- Trash and favourite for items, with trash moved to a folder on Windsor rather than deleted. Value medium, **S**.

## studio (`/apps/studio`, `src/components/studio/**`, `src/lib/server/studio/**`)

**Live checks**
- `GET /apps/studio` 200.
- `GET /api/studio/projects` 200: 9 projects, all `exists: true`, `configErrors: []`.
- `GET /api/studio/jobs` 200: 7 jobs (5 done, 1 cancelled, 1 failed).
- `GET /api/studio/outputs?scope=inputs` 200: 38 outputs (**33 offline**), 11 generations, 19 music tracks (**19 offline**).
- `GET /api/studio/file?id=o_a2ac7c5eda72775f` 206 `video/mp4`.

**Preset readiness** (from `/api/studio/projects`): only `ffmpeg-tools` (trim, concat, vertical-9x16, mux-audio) are `ready: true`. Every Remotion, HyperFrames, pipeline and shell preset reports `notReadyReason: "<file> is an iCloud placeholder (evicted from this Mac)..."`. Projects sampled with a stat-only walk:

| Project | Dataless files |
|---|---|
| dialectics-video | 105 / 108 |
| remotion-composer | 41 / 42 |
| tiktok-warm-grain-grid | 2,965 / 3,001 |
| universal-consciousness-p1 | 175 / 177 |

The failed job `j_mvn9shgaebfc` shows the effect: `nice: .../dialectics-video/node_modules/.bin/remotion: Resource deadlock avoided` → exit 126.

The 11× `GET /api/studio/jobs 500` in the log were compile errors (Editor module-not-found) and are not current. Studio already detects dataless files well (`config.ts:243-266`, `runner.ts:245,286`). The problem is that the data is simply not on the Mac.

**Gaps**
- The UI can only tell you to open the folder in Finder.
- The "agent-built video" presets (HANDOFF next-up #6) don't exist.
- Compositions are never listed: `compositions: []` on every project, because listing is blocked by the dataless files.

**Polling.** Jobs poll every **6 s while idle** and 1.5 s while running (`StudioApp.tsx:133-135`). Pausing on hidden tabs is done correctly, but the HANDOFF rule is "no faster than every 60 s".

**Mobile.** `grid-cols-1` below lg (`StudioApp.tsx:294`), so it stacks correctly.

**Enhancements**
- A per-project "Make available offline" action: show the `brctl download` command and size, or with the user's approval run it after a `df` check. Alternatively move active projects to Windsor. Value high, **M**.
- Idle poll at 60 s, keeping 1.5 s while a job runs. Value low-medium, **S**.
- Agent-brief presets that hand a brief to Claude Code or Codex and drop the result into the queue. Value high, **L**.

## music (`/apps/music`, `src/components/music/**`, `src/lib/server/music/**`)

**Live checks**
- `GET /apps/music` 200.
- `GET /api/music` 200: 19 tracks, `counts: {total:19, local:0, icloud:19}`. Roots: VANTA VECTOR (19 tracks, 0 local) and Suno (0). Every `durationSec` is null because placeholders are never probed.
- `GET /api/music/file?id=m_b95147651203e965` and `/api/music/cover?id=...` → **409** `"Apotheosis.mp3 is in iCloud and not downloaded to this Mac. Run the brctl command to fetch it."` (handled correctly, but nothing can play).
- `GET /api/music/suno/status` 200: `state: "needs_setup"`, missing `SUNO_COOKIE` and `TWOCAPTCHA_KEY`. `launchctl list` shows `com.epsilon.suno-api` with last exit **78** (EX_CONFIG).

**Working:** library index, iCloud notice with copyable brctl command, folders panel, notes/lyrics/credits saved to Windsor (`meta.ok: true`), and Range streaming once a file is local. The code is honest throughout; the app just has no playable data.

**Mobile**
- `PlayerBar.tsx:255` has a fixed `w-[240px]` track block, plus prev/play/next and two `w-10` clocks. That is about 440 px before the waveform gets any space, so on a 375–390 px phone it overflows or crushes the waveform.
- The search input is a fixed `w-64` (`MusicApp.tsx:290`).
- `TrackPanel.tsx:113` (`w-[430px] max-w-[46vw]`) opens as a roughly 180 px side column next to the grid on a phone, where it should be a sheet.
- No `navigator.mediaSession` anywhere in the repo, so there are no lock-screen or AirPods controls or artwork.

**Enhancements**
- Move or hydrate VANTA VECTOR (about 19 files) to Windsor, or mark the folder "Keep Downloaded". Value high, **S** (a user action plus a root path change).
- Mobile player: stack it as a mini-bar and make the track panel a bottom sheet. Value medium-high, **S-M**.
- A shared Media Session hook (also used by podcast). Value medium-high, **S**.

## podcast (`/apps/podcast`, `src/components/podcast/**`, `src/lib/server/podcast/**`)

**Live checks**
- `GET /apps/podcast` 200. `GET /api/podcast/config`, `/episodes` (3 episodes, 10-25 to 10-27, about 13.7–14.9 min), `/status`, `/job` and `/subscribe` all return 200. `/cover` returns a 200 PNG.
- `/api/podcast/feed.xml` is 200 from loopback. With the Tailscale Host header and no token or a bad token it returns **403**, so feed auth is correct.
- `status.keys` shows gemini, feedToken, notion and jev all true. ffmpeg is found and the claude binary is found.
- The podcast LaunchAgent **is loaded now**: `com.epsilon.volta-podcast` shows last exit 0, and today's job has `trigger: "scheduled"`, start 10:00Z. The HANDOFF note saying it is "not loaded" is stale.

**The 2026-10-27 episode was made without research.**
- Job timings: `research: "0 stories from 0/8 topics, 55s wall"`.
- There are 8 warnings of the form `Research (<topic>) failed: claude -p (research <topic>): Command failed: /Users/.../mise/installs/node/latest/bin/claude -p --model sonnet ... --system-prompt=You are the research desk ...`. They are cut off at 300 characters, so the real reason is gone.
- Cause in the code: `src/lib/server/podcast/llm.ts:100-102` uses `stderr || error.message` and ignores stdout when the exit code is non-zero. With `--output-format json`, claude reports its error as JSON on stdout.
- On 2026-10-26 research worked (1 warning). Something changed overnight; one candidate is the mise `node/latest` path. I could not confirm the cause without running claude, which the audit rules out.
- The episode still shipped, ranked from gathered candidates only (Notion 3, arXiv 23, RSS 28, feeds 6). Nothing flagged this outside the job card.

**Misleading warning.** `script.ts:165` adds `Script written by the local fallback (claude-opus-5-5)` whenever the backend is not `claude-cli`. Since `llm.ts:138`, OmniRoute is the **primary** backend for long-write, so a normal successful run always carries this warning. It appeared on 10-26 and 10-27.

**Minor issues**
- The script came out at 2,207 words against a 2,200 maximum; that is only a warning.
- Job polling every 2 s while running doesn't pause when the tab is hidden (`PodcastApp.tsx:60`).
- The player has a speed control but no saved resume position and no Media Session.
- On a phone the episode list (an aside) comes before the player in the `grid-cols-1` stack (`PodcastApp.tsx:171-213`).

**Enhancements**
- Surface the claude JSON error, and when research succeeds on fewer than N topics, either hold the episode or push a "degraded episode" item to Home/Tasks. Value high, **S**.
- Fix the fallback label so it is relative to the configured chain. Value low, **S**.
- Resume position, Media Session, and putting the player first on mobile. Value medium, **S**.

## carousels (`/apps/carousels`, `src/components/media/CarouselsApp.tsx`, `SlideView.tsx`, `src/lib/server/carousels/**`)

**Live checks**
- `GET /apps/carousels` 200.
- `GET /api/carousels` 200: **11.1 s cold** (Notion fetch), then 0.27 s from cache (`decks.ts:60`, `cached(..., TTL_MS, maxStaleMs 24h)`).
- 20 decks from one source page ("Shorts Batch 1"), 5 bench. `inaccessible: []`, `errors: []`, `state: null` (nothing reviewed yet), and `storage.available: true` → `/Volumes/Windsor/VOLTA/carousels/state.json`.
- `caption: null` on all 20 decks: the Notion pages have no `CAPTION` field (`parse.ts:166`). This is a data gap, not a bug.

**Working:** edit copy inline, comment pins, wildcard layouts, approve (Windsor only, Notion untouched), revision prompt to clipboard, PNG export at 1080×1350 (client-side canvas), and send to Editor.

**Mobile: broken.**
- `CarouselsApp.tsx:410` deck queue `aside w-[272px] shrink-0` and `:655` copy-edits pane `w-[360px] shrink-0` have no breakpoints. Together they are 632 px of fixed width in a `flex` row, so the slide strip gets nothing on a 390 px phone.
- The action row has 6 buttons with long labels ("Request Claude Revision (Copy Prompt)").
- The app still uses the older `MediaTopBar` and its own `ToastStack` from `media/ui.tsx`, while the other media apps use `elements/kit/AppTopBar` and `elements/kit/toast`.

**Gaps**
- Approval never goes back to Notion. That is by design under the read-only rule, but there is no "copy approved status" export either.
- No batch export.
- "Send to Editor" makes a hand-off with no media and goes through localStorage, so it is lost across devices.
- No route from an approved deck to Studio or Generations for an animated render.

**Enhancements**
- Phone layout: deck queue as a drawer and copy-edits as a tab under the strip. Value high, **S**.
- Warm the Notion cache in the background so the first open isn't 11 s. Value medium, **S**.
- Approved deck → Studio render preset (a HyperFrames slide template). Value medium-high, **M**.

---

## Top 5 enhancements (these six apps)

| # | Enhancement | Apps | Value | Effort |
|---|---|---|---|---|
| 1 | **Get live working state off iCloud-evicted storage.** Move Editor `NLE_ROOT` (cache, bin, projects, uploads) to a non-synced location such as `editor.nosync`, Windsor, or `~/Library/Caches`. Treat dataless files as a cache miss or a 409, never a 500, and never silently drop them. This fixes the saved-sequence 500, the thumbnail 500s, lost export history and the dataless text renderer. | editor | High | S |
| 2 | **One "make available offline" flow for media sources.** A shared panel listing dataless roots: 19/19 Music tracks, 9/13 Studio presets, 121/138 Editor bin items and 33/38 Studio outputs. For each it shows size, a `df` check and the `brctl download` command, and runs it only with approval. Alternatively move the active projects and VANTA VECTOR to Windsor. | music, studio, editor | High | M |
| 3 | **Make podcast research failures visible.** Parse the claude `--output-format json` error from stdout (`llm.ts:100-102`), alert or hold when research covers fewer than N of 8 topics (today: 0/8), and fix the always-on "local fallback" warning (`script.ts:165`). | podcast | High | S |
| 4 | **Phone pass for Carousels and Music, plus Media Session.** Carousels' fixed 272 px and 360 px panes become a drawer and a tab. The Music player bar and track panel become a mini-bar and a sheet. Add a shared `useMediaSession` hook for Music and Podcast lock-screen and AirPods controls. | carousels, music, podcast | Med-High | M |
| 5 | **Server-side spend guardrails.** A daily budget cap for Generations (today only $5 per request, `media/config.ts:13`), shown on mobile. Fold podcast TTS cost and Generations spend into the existing UsageRoboBar/quota surface. | generations, podcast | High | S |

Runners-up: a server-backed Editor inbox (M); a "teach the live skill" button with diff (M); Studio idle polling at 60 s (S); Notion cache warm-up for Carousels (S); image-to-video in Generations (M).

## Cross-app opportunities spotted

- **iCloud placeholder detection is implemented six or more times:**
  - `studio/config.ts:243`
  - `studio/index-projects.ts:161,325`
  - `music/library.ts:69`
  - `editor/media.ts:95`
  - `editor/nle/assets.ts:122`
  - `vaults.ts:46`

  The one place that needed it, the NLE cache reads, doesn't have it. A shared `lib/server/icloud.ts` (`isDataless`, `assertLocal`, `brctlHint`, and a safe `readFileLocal` that maps EDEADLK to a 409) would cover every app.
- **`ErisMornCloud` is under `~/Documents`, which is iCloud Drive with eviction.** The global CLAUDE.md names it as the default "offload target" for generated data. That works for archives but not for live caches or state the server must read back. The Editor shows the failure: about half its files were evicted within 3 hours. Worth a note in CLAUDE.md and HANDOFF.
- **Hand-off bus:** `src/lib/editor-inbox.ts` is per-browser localStorage, used by 5 producers (Generations, Studio, Music, Scripts, Carousels). Swapping it for a Windsor-backed `/api/editor/inbox` makes phone-to-Mac hand-offs work and lets Edit mode read them too.
- **Three toast and header systems:**
  - `elements/kit/toast` with `AppTopBar` (Generations, Studio, Music, Podcast)
  - `media/ui.tsx` `ToastStack` with `MediaTopBar` (Carousels)
  - `EditorToast` with `EditorHeader` (Editor)

  All the toast stacks sit at `bottom-5` over the mobile tab bar. Pick one kit and give it a phone-safe offset.
- **Audio playback is built three times:** the Music `PlayerBar`, the Podcast `Player`, and the NLE `useAudioMix`. None use Media Session. A shared player core with Media Session and resume support would serve Music and Podcast.
- **Spend tracking is split:** Generations has `todaySpendUsd` (manifest) and Podcast has its per-episode `cost`. UsageRoboBar/quota could show both next to LLM quota.
