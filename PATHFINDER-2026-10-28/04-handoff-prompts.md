# 04 — /make-plan handoff prompts (VOLTA OS, 2026-10-28)

One prompt per unified system in `03-unified-proposal.md`, plus **U0** (bug patch, do first). Each is self-contained; paths are under `src/` in `/Users/patrickgallowaypro/Volta-OS`. Evidence: `PATHFINDER-2026-10-28/02-duplication-report.md` (appendix entries named in each prompt).

Standing constraints for every plan: Next.js dev server under LaunchAgent stays `next dev`; type-check with `npx tsc --noEmit` (no ESLint config); never `git add .`; disk is near-full (flag >500 MB writes); verify in the running app at http://127.0.0.1:50000 after each phase.

---

## U0 — Bug patch ahead of the refactor
```
/make-plan Patch five verified VOLTA bugs in one small change, before any refactor. Evidence: PATHFINDER-2026-10-28/02-duplication-report.md "Bugs today" A2–A5 and the systems start command.
1. A2: podcast spend can push the day past VOLTA_GEN_DAILY_USD but is never checked. In src/lib/server/podcast/pipeline.ts (cap checks at :72-75 and :167-176), call assertWithinDailyCap from src/lib/server/media/budget.ts:41 with the episode's TTS estimate before TTS starts, for scheduled and manual triggers alike. Keep podcast's own per-episode cap.
2. A3: src/lib/server/research/search.ts:172 returns publicRow(r) (:80) unmasked while research/doc.ts:111 masks title/summary. Apply redactSecrets (src/lib/server/redact.ts:6) to the same fields in search.
3. A4: src/lib/server/workspace.ts:30-34 writes with plain fs.writeFile and app/api/editor/apply-feedback/route.ts:84-87 read-modify-writes SKILL.md unserialised. Make the write tmp+rename (reuse writeAtomic from src/lib/server/editor/nle/paths.ts:76) and serialise per file with a promise chain.
4. A5: src/lib/server/research/status.ts:24,155 uses exists('/Volumes/Windsor'); switch to the device-compare check used at research/inventory.ts:91-98.
5. src/lib/server/systems/services.ts:246 VOLTA start command points at ~/Documents/PROJECTS/rubric-agentic-os, which doesn't exist; point it at the real repo path.
Guards: no new modules, no refactor of neighbours — these are 1–10 line fixes. Verify each: a podcast dry-run with a lowered cap returns 402; /api/research/search and /api/research/doc return identical masked text for one row; SKILL.md survives a double submit with both lessons.
```

## U1 — One route wrapper, one error type
```
/make-plan Unify VOLTA's API route plumbing into one wrapper in src/lib/server/route-helpers.ts: route(handler, { mutation?, body?: 'json', maxBody?, redact? }), class HttpError(status, message), and NO_STORE. route() calls rejectNonLocal / rejectNonLocalMutation from src/lib/server/local-only.ts:42,71, parses and size-caps JSON bodies, maps HttpError to {error} with its status and unknown errors to 500, and sets NO_STORE. Add intParam(url, name, {min,max}).
Rewrite these call sites (evidence: 02-duplication-report.md Appendix A §B-2, Appendix B M1, M2, E10, Mu2, G5, T2, N4):
- localJson users (34 routes; keep localJson as an alias only until migrated within this plan, then delete).
- studioPost src/lib/server/studio/http.ts:15,28; nleMutation src/lib/server/editor/nle/http.ts:14; musicPut src/lib/server/music/http.ts:7; sunoPost src/lib/server/music/suno.ts:419,432; researchJson src/app/api/research/route.ts:10; notionJson src/app/api/notion/route.ts:22; src/app/api/{ltm,honcho,claude-sessions}/_shared.ts.
- Hand-rolled: src/app/api/editor/apply-feedback/route.ts:59-70, src/app/api/actions/route.ts:28-54, src/app/api/systems/fix/route.ts:17-41, the media quote/generate/export/reveal/promote routes.
- Error classes to replace with HttpError: StudioError (studio/storage.ts:17, alias NleError nle/paths.ts:28), MediaError media/config.ts:26, MusicError music/errors.ts:5, PodcastError podcast/storage.ts:11, ResearchError research/config.ts:15, NotionError notion/client.ts:18 (move its no-access/429 mapping into thrown HttpErrors so Carousels app/api/carousels/route.ts:20 and Recos inherit it), ActionWriteError sources/actions-write.ts:28, NoteError sources/actions.ts:238, FixError systems/fix.ts:19, TaskError llm/router.ts:23, JevError jev/types.ts:56; BadRequest ×3; noStore ×9.
- LtmUnavailableError becomes HttpError(503) thrown in src/lib/server/ltm.ts, removing the route-helpers.ts:4 import of ltm.
Flowcharts: PATHFINDER-2026-10-28/01-flowcharts/platform.md (chart a), memory.md, studio.md, editor.md.
Guards: no route registry, no class hierarchy under HttpError (status codes, not subclasses), no "legacy" flag keeping old wrappers; delete each old wrapper in the same phase that migrates its callers. Keep podcast/auth.ts token auth untouched (legitimate). Verify every route still answers 403 to a non-local Host and 200 locally; tsc clean.
```

## U2 — One secret masker
```
/make-plan Make src/lib/server/redact.ts the single secret-masking implementation for VOLTA: move the body of src/lib/server/search/redact.ts (redactSecrets at :258, maskToken at :87) into it and have search/ import from it. Export redactSecrets(text) and redactDeep(value) (merge the two walkers: honcho/_shared.ts:27 redactDeep and sources/sessions.ts:91 maskDeep — keep the union of their id-key rules and the secret-named-field masking).
Rewrite: systems/run.ts:63 redact (used by editor/nle/export.ts:8,201) → redactSecrets; sources/sessions.ts:63 maskToken → redactSecrets; literal-key wrappers podcast/util.ts:17, media/config.ts:37, llm/client.ts:13, feeds/util.ts:16 → redactSecrets; src/lib/server/sources/{index,sessions}.ts import from lib/server/redact.ts instead of src/app/api/honcho/_shared.ts:22 (delete that re-export). Wire route()'s { redact: true } (from U1) to apply redactDeep to responses and use it for research search + doc + threads, removing the per-field masks (research/doc.ts:10,111, threads.ts:76,123,208).
Evidence: 02-duplication-report.md Appendix A §A-3, §B-1; Appendix B M6, R3. Flowcharts: search.md, research.md, memory.md, platform.md.
Guards: do not touch src/components/dashboard/widgets/source-facts.ts:80 (client-side copy, legitimate). No pluggable masker registry. Add a test table of secret-shaped strings run through redactSecrets and redactDeep; outputs must match what each old masker produced or be stricter.
```

## U3 — Storage: Windsor, atomic writes, iCloud
```
/make-plan Create src/lib/server/storage.ts as VOLTA's one storage module: WINDSOR_ROOT (env VOLTA_WINDSOR, default /Volumes/Windsor), isWindsorMounted() (device compare vs /Volumes, from research/inventory.ts:91-98), assertFreeSpace(dir, needBytes) with one 3 GiB floor, writeAtomic(file, data, { expectMtimeMs? }) (tmp+rename, same mode), jsonFile<T>(file, fallback) → { read, update(fn) } serialised per file (model: feeds/store.ts:26-97 JsonState), isInside(root, p) (realpath containment). Re-export icloud.ts helpers.
Rewrite (evidence 02 Appendix A §A-4, §A-5, §B-7, §B-8, §B-23; Appendix B R6, Mu1, Mu3, P2, E9, Pl2, G3, T3):
- 22 '/Volumes/Windsor' literals: studio/storage.ts:7, media/config.ts:5, podcast/config.ts:11, feeds/config.ts:15, music/suno.ts:24, music/meta.ts:12, music/config.ts:74, editor/feedback.ts:11, editor/nle/paths.ts:19, carousels/state.ts:11, llm/usage-log.ts:11, research/config.ts:131, ltm.ts:10, systems/storage.ts:30 and the rest found by grep.
- Mount checks: studio/storage.ts:28, media/storage.ts:16, music/suno.ts:52, music/meta.ts:22, podcast/storage.ts:24, feeds/store.ts:15, research/inventory.ts:91, research/status.ts:155, llm/usage-log.ts:48, jev/telemetry.ts:94-96.
- Free space: studio/storage.ts:13,42, media/config.ts:10, podcast/storage.ts:31, editor/nle/paths.ts:24-67 (keep NLE's "remaining after write" semantics via needBytes). GiB constant ×2.
- Atomic writers: research/inventory.ts:227, music/meta.ts:151, music/config.ts:90, music/suno.ts:323, carousels/state.ts:106, feeds/store.ts:82, podcast/storage.ts:60, podcast/config.ts:68, sources/actions-write.ts:75-82 (keep mtime guard via expectMtimeMs), editor/feedback.ts:136, editor/nle/paths.ts:76, nle/text.ts:138, nle/thumbs.ts:78, jev/telemetry.ts:101, workspace.ts:30-34.
- Containment: studio/storage.ts:69, music/library.ts:72, media/storage.ts:110-114, media/export.ts:52-58,110.
- Add isEvictedFile checks to actions.md reads/writes (sources/actions.ts:188, actions-write.ts:46).
Flowcharts: studio.md, generations.md, music.md, podcast.md, feeds.md, research.md, tasks.md.
Guards: never create the mount point (keep that rule from the existing checks); no storage "provider" abstraction; sync writers either become async or use a writeAtomicSync sibling — not a mode flag. Disk is near-full: no migration copies of data, only code changes.
```

## U4 — One file-streaming route body
```
/make-plan Move parseRange and streamFile from src/lib/server/editor/nle/http.ts:37,55 into src/lib/server/route-helpers.ts as streamFile(req, absPath, { mime, cache }). Rewrite the five Range-serving routes to resolve their path then return streamFile: src/app/api/studio/file/route.ts:13, src/app/api/music/file/route.ts:13, src/app/api/podcast/file/route.ts:13, src/app/api/media/file/route.ts:12 (keep its immutable cache via the cache option; add the req.signal abort handling it lacks), src/app/api/editor/nle/file/route.ts. Also fold the hand-rolled ETag/304 in src/app/api/editor/nle/thumbs/route.ts:21 into a { etag } option if trivial.
Evidence: 02 Appendix A §B-5. Flowcharts: editor.md (chart b), studio.md, music.md, generations.md, podcast.md.
Guards: path resolution and auth stay in each route; streamFile only streams. Verify with curl -H 'Range: bytes=0-99' on each route (206, correct Content-Range) and a full GET (200), plus audio seek in Music and Podcast players.
```

## U5 — One process module
```
/make-plan Promote src/lib/server/systems/run.ts (bin/BIN :15-31, run :42, tilde :12, GiB :122) to src/lib/server/proc.ts: bin(name) honouring VOLTA_FFMPEG/VOLTA_FFPROBE, run(cmd, args, opts) (LC_ALL=C, timeout, stderr tail → HttpError), spawnLogged(cmd, args, { onLine, signal }) for long jobs, mapLimit(items, n, fn), tilde(p). Systems imports from it.
Rewrite (evidence 02 Appendix A §B-9, §B-10, §B-24; Appendix B E11, Sy1, R5):
- ffmpeg/ffprobe constants: music/library.ts:20-21, studio/index-projects.ts:40, editor/nle/paths.ts:21-22, podcast/config.ts:14-15 (and podcast/pipeline.ts:68 message).
- promisify(execFile): research/status.ts:14, launchpad/repos.ts:12, sources/routines.ts:13, launchpad/tailscale.ts:9 (+ its binary loop :10,28).
- Spawn+stderr shaping: editor/nle/thumbs.ts:68, nle/peaks.ts:44, nle/export.ts:266, nle/text.ts:234, studio/index-projects.ts:85, music/library.ts:113,419, podcast/tts.ts:257, studio/runner.ts:441.
- systems/fix.ts:51 direct execFile → run.
- 13 concurrency limiters: research/inventory.ts:101, music/library.ts:81, studio/index-projects.ts:117, search/notes-index.ts:58, sources/notes.ts:84, honcho.ts:408, launchpad/repos.ts:133, podcast/util.ts:25, jev/client.ts:160, editor/nle/paths.ts:107, inline pools research/stagea.ts:113, research/library.ts:54, research/vault.ts:202.
- tilde ×2 (editor/nle/paths.ts:71), expandHome ×3 (research/config.ts:13, music/config.ts:14, studio/config.ts:66).
Flowcharts: systems.md, editor.md, studio.md, music.md, podcast.md, research.md.
Guards: keep per-call timeouts; don't wrap spawn in an event-emitter class; mapLimit is a function, not a pool object.
```

## U6 — One job queue
```
/make-plan Replace VOLTA's five single-flight job systems with src/lib/server/jobs.ts: enqueue({ kind, lane: 'ffmpeg' | 'net', historyFile, run(ctx) }) using one globalThis queue per lane, JSONL history with torn-line skip and "interrupted on restart" (lift from src/lib/server/studio/runner.ts:86-134,125-131), cancel via SIGTERM→SIGKILL, progress/log lines. Depends on U3 (jsonFile/writeAtomic) and U5 (spawnLogged).
Migrate (evidence 02 Appendix A §B-6; Appendix B G1):
- Studio renders: studio/runner.ts:76-77,313-317 → lane ffmpeg.
- NLE export: editor/nle/export.ts:35-36,158-164 (export-jobs.json) → lane ffmpeg (now serialised with Studio).
- Media generations: media/jobs.ts:15,32-71 (memory only; app/api/media/job/route.ts:14 404s after restart) → lane net, persisted. Unify its two poll loops (:158, :226) and sleeps (jobs.ts:19, gemini.ts:17) into one pollUntil helper with per-item failure handling.
- Podcast: podcast/pipeline.ts:21-46 .job.json → lane net.
- Suno: music/suno.ts:218,236 boolean → lane net.
Keep each feature's job status route shape so clients don't change in this plan. Flowcharts: studio.md, editor.md (chart b), generations.md, podcast.md, music.md.
Guards: one function, not a JobQueue class hierarchy or per-kind registry; lanes are a string union. No concurrency >1 per lane. Verify: start a Studio render and an NLE export together — the second waits; restart the dev server mid-job — the job shows interrupted.
```

## U7 — One service registry and probe
```
/make-plan Create src/lib/server/services.ts with a typed SERVICES array (id, label, url from env — HONCHO_API_URL, CLAUDE_MEM_URL, HERMES_GATEWAY_PORT or listener detection from systems/index.ts:20,52 — healthPath, startCommand) and probe(service) with one rule: 2xx (and ok:true when JSON) = up, any HTTP error = degraded, no answer = down; cached via cached() from sources/cache.ts:45.
Rewrite (evidence 02 "Bugs today" A1; Appendix A §A-1, §B-4; Appendix B Sy2, L1):
- Systems: systems/index.ts:36-54, systems/run.ts:86 httpGet, systems/services.ts:256-262.
- Launchpad: launchpad/probe.ts:7-21, launchpad/services.ts:9,26-37 (hard-coded Honcho :8000, Hermes 9900).
- Ports in llm/config.ts:14-15 read from SERVICES.
- Fix systems/services.ts:246 VOLTA start command path (if U0 didn't).
- Loopback sets launchpad/services.ts:61, launchpad/tailscale.ts:11, music/suno.ts:34, podcast/auth.ts:14,19 import LOOPBACK/hostnameOf from local-only.ts:4,30 (client remote-client.ts:7 keeps its copy).
Flowcharts: systems.md, launchpad.md.
Guards: SERVICES is a plain array, not a plugin registry; Launchpad shows Systems' verdict rather than its own; keep systems/honcho-deps.ts:16 (legitimate). Verify both pages agree for every service with one service stopped.
```

## U8 — Agent handoff, Claude CLI, spend gate
```
/make-plan Extend src/lib/server/claude-terminal.ts:30 with handoffToClaude({ tag, cwd, title, body, open }) — shared guardrails text + append to ~/Library/Application Support/VOLTA/agent-log.jsonl — and runClaudeCli(prompt, opts) as the only `claude -p` launcher, calling logUsage (src/lib/server/llm/usage-log.ts:41). Make assertWithinDailyCap (src/lib/server/media/budget.ts:41) the single spend gate.
Rewrite (evidence 02 Appendix A §A-2, §B-9, §B-12, §C-3, §C-5):
- systems/fix.ts:62-104 and sources/actions-write.ts:117-136 pass only their item-specific body; both handoffs logged.
- podcast/llm.ts:52,150 and src/app/api/skills/run/route.ts:115-130 → runClaudeCli (keep podcast's fallback chain order).
- podcast/pipeline.ts: assertWithinDailyCap before TTS (if U0 didn't).
- Client copy-prompt builders src/components/media/CarouselsApp.tsx:69 and src/components/recos/recos-lib.ts:85 import one agentGuardrails string from a non-server module.
Flowcharts: systems.md, tasks.md, podcast.md, platform.md (chart b), generations.md.
Guards: Suno credits stay separate (different currency). No prompt template engine — plain string concatenation. Never put prompts in argv (keep the prompt-file approach). Verify Systems Fix and Tasks Solve both write a log line; a podcast LLM call shows up in /api/quota.
```

## U9 — Vault, text and media-id helpers
```
/make-plan Add src/lib/server/text.ts (parseFrontmatter with CRLF + case-insensitive keys, stripMarkdown, obsidianUrl, walkVault(root, onFile)) and src/lib/media-ids.ts, importable by client and server (parseMediaId case-insensitive, mediaFileUrl, brctlHint, makeInboxItem, EDITOR_INBOX_KEY moved from src/lib/editor-inbox.ts:6).
Rewrite (evidence 02 Appendix A §B-14, §B-17; Appendix B H3, H5, F1, E6, E7, E8, N5, St1):
- Frontmatter: vaults.ts:158, research/vault.ts:90, sources/skills.ts:12, src/app/api/workspace/frontmatter.ts:2, search/notes-index.ts:169.
- Vault walkers: vaults.ts:101, research/vault.ts:158-224, search/notes-index.ts:73. Obsidian URLs: vaults.ts:128, research/vault.ts:231, src/components/second-brain/graph-model.ts:88.
- md→text: feeds/util.ts:23,36, src/lib/notion-md.ts:7, podcast/gather.ts:52.
- Media ids: editor/feedback.ts:15, editor/nle/assets.ts:29, editor/media.ts:175,210 (case bug W1).
- File URLs: studio-client.ts:19, gen-client.ts:18, music/format.ts:36, editor/media.ts:26-28. brctl: editor/media.ts:22, music/format.ts:9, research/types.ts:303; hint strings studio/config.ts:260, studio/runner.ts:286,510, nle/projects.ts:71, nle/assets.ts:119. Server imports of components/music/format (music/library.ts:7, studio/index-projects.ts:10) go away.
- Inbox items: MusicApp.tsx:197, StudioApp.tsx:199, ScriptsApp.tsx:86 / script-model.ts:202, CarouselsApp.tsx:354, GenerationsApp.tsx:225; EditorApp.tsx:406 raw key.
- Editor pins: export SKILLS, MAX_PINS, validatePin from editor/feedback.ts:12-72; apply-feedback/route.ts:14-53 uses them. Decide whether 500 (aggregate) vs 300 (per file) is intended; share the timestampSec 0..86400 bound either way.
Flowcharts: home.md, research.md, search.md, feeds.md, editor.md, studio.md, music.md, generations.md, notion-content.md.
Guards: media-ids.ts must not import server-only or node:*; no markdown AST library added (keep regex-level helpers).
```

## U10 — Cache options instead of side caches
```
/make-plan Extend cached() in src/lib/server/sources/cache.ts:45 with options { mtimeOf?: string[], minForceMs? } and add breaker(name, { failures, coolMs }); then delete VOLTA's side caches.
Rewrite (evidence 02 Appendix A §B-11; Appendix B Pl1, S2):
- mtime config memos: llm/config.ts:41, research/config.ts:77, studio/config.ts:209, podcast/config.ts:40, music/meta.ts:59, sources/actions.ts:184, feeds/files.ts:145.
- Scan memos (mtime+size): sources/notes.ts:65,99, transcripts.ts:167, sessions.ts:663,1403, search/notes-index.ts:93.
- Force-refresh limiters: vaults.ts:97-103 (10 s), launchpad/repos.ts:190-196 (60 s), app/api/notion/route.ts:8-16 (30 s per key), feeds/index.ts:49 (5 s).
- globalThis caches: search/index.ts:76, search/sources.ts:162, search/notes-index.ts:55, research/inventory.ts:67, research/library.ts:42, jev/cache.ts:21-46 (in-flight dedupe), quota/codexbar.ts:195.
- Breakers: jev/client.ts:46, search/sources.ts:162.
- N+1: search/sources.ts:47 calls getCapture per LTM hit — batch it in ltm.ts.
Flowcharts: platform.md, search.md, research.md, home.md, feeds.md.
Guards: keep feeds/store.ts triage.json (persistent, legitimate). No cache "strategy" interface — two option fields. Preserve each limiter's current interval.
```

## U11 — Client data and UI kit
```
/make-plan Consolidate VOLTA's client plumbing: move useSharedJson from src/components/dashboard/widgets/shared-json.ts:198 to src/lib/use-shared-json.ts (drop its import of components/ltm/ltm-client at :15); add src/lib/fetch.ts getJson/postJson; add fmtBytes and ago to src/lib/format.ts; make src/components/elements/kit the only source of toast, copyText and a Markdown component; add a readSse() helper shared by server and client.
Rewrite (evidence 02 Appendix A §B-15, §B-16, §B-21; Appendix B H1, H2, H6, H7, H8, M4, M5, M7, M8, M9, M11, T1, E1, E2, E3, E5, N1, N2, N3, Pl3):
- Pollers → useSharedJson: useApi second-brain/analytics-shared.tsx:40, useVisiblePoll ltm/useVisiblePoll.ts:14, useSection LaunchpadApp.tsx:29, useRemote notion/useRemote.ts:21, raw setInterval in TasksApp.tsx:86, AwaitingBadge.tsx:21-32, AwaitingCard.tsx:19/needs-you.ts:17 (one /api/actions timer), FeedsApp.tsx:102, PodcastApp.tsx:60, StudioApp.tsx:133. Delete usePolledJson right-hooks.ts:26 and robo-ui/Toast.tsx.
- Fetch clients → getJson/postJson: ltm-client.ts:21, honcho-client.ts:28, LaunchpadApp.tsx:21, feeds-client.ts:7, podcast-client.ts:4, EditorApp.tsx:117, NleWorkspace.tsx:45; TasksApp.tsx:136 post + SystemsApp.tsx:68 postFix.
- Toasts: media/ui.tsx:103, recos/Toasts.tsx:16, editor notify ×2 → kit toast. copyText: media/ui.tsx:27, RecosApp.tsx:30, artifact-meta.ts:102 + raw navigator.clipboard sites.
- fmtBytes ×7, ago ×10 (list in Appendix A §B-16), isTypingTarget inlined ×6 → lib/events.ts:13.
- Markdown renderers: notion/MarkdownView.tsx:200, second-brain/MarkdownView.tsx:285, research/Markdown.tsx:124, MiniMarkdown.tsx:160, honcho/RichText → kit Markdown with variant props.
- SSE: honcho chat/route.ts:79 + AskPanel.tsx:43 → readSse (tolerate multi-line and malformed frames).
- Editor thumb caches nle/panels/thumbs.ts:37 + nle/timeline/media.ts:59 → one. useNow ×2 → one. splitHighlight ×2 → one with a mode arg.
- Recos review state (RecosApp.tsx:92,106) → server jsonFile (U3) so the phone sees it.
Flowcharts: home.md, memory.md, tasks.md, systems.md, launchpad.md, editor.md, notion-content.md, platform.md (chart c).
Guards: no state-management library; no global context provider beyond what useSharedJson already does. Phone layout must not regress — check 375 px for Tasks, Systems, Launchpad, Recos.
```

## U12 — Feature boundaries: podcast→feeds, Notion, server types
```
/make-plan Fix VOLTA's cross-feature boundary leaks without new modules.
1. src/lib/server/podcast/gather.ts:217-226 fetches http://127.0.0.1:50000/api/feeds and swallows errors to []; call listFeeds({ triage: false }) from src/lib/server/feeds/index.ts:85 directly (add the triage flag; don't fire scheduleTriage at :88 for podcast reads) and let errors surface in the episode's research notice.
2. Notion: one loader for config/notion-links.json in src/lib/server/notion/links.ts:7; launchpad/notion.ts:11,13,57, notion/dreams.ts:8, notion/catalog.ts:12 and src/components/studio/FlowPanel.tsx:8 read IDs from it. podcast/gather.ts:36 raw notionQuery → cached notion/pages.
3. Types: move server-used types out of components — src/components/research/types (10 imports from lib/server/research), components/music/{types,format,suno-types}, components/media/data (carousels), components/tasks/types (sources/actions*.ts), components/editor/spatial (editor/review-note.ts:5), components/editor/rl-rules (apply-feedback/route.ts:9) → src/types/.
4. Move src/app/api/jev-router/jev.ts heuristic to src/lib/server/jev/heuristic.ts; update skills/run/route.ts:12 and cache-status/route.ts:4.
Evidence: 02 Appendix A §B-13, §B-18, §B-19, §B-20. Flowcharts: podcast.md, feeds.md, notion-content.md, launchpad.md, research.md, music.md.
Guards: no barrel re-export files to "keep old paths working" — update imports. Verify a podcast generate run includes feeds and doesn't create a triage job.
```
