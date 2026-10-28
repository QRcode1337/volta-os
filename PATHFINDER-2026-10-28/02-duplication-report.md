# 02 — Duplication report (VOLTA OS, 2026-10-28)

Two Phase 2 agents verified Phase 1's candidates against source (`grep -n` / side-by-side reads). Every claim below cites ≥2 `file:line` locations; paths are under `src/` (`lib/server/` is often dropped for brevity — see appendices for exact paths). Appendix A is the cross-feature evidence, Appendix B the within-feature evidence, both verbatim from the agents.

## Totals
- **Cross-feature:** 35 concerns — 5 accidental + bug-risk, 24 accidental cleanup, 6 legitimate specialization. 5 Phase 1 bug claims downgraded (Appendix A §D).
- **Within-feature:** 68 duplications across 15 features; 47 have drifted (copies behave differently today).

## Bugs today (fix regardless of refactor)
| # | Defect | Evidence |
|---|---|---|
| A1 | Systems and Launchpad can disagree on whether a service is up (2xx `/health` vs any <500 on `/`); Launchpad hard-codes Honcho `:8000` and Hermes `9900`, both ignore `CLAUDE_MEM_URL` | `systems/run.ts:86`, `systems/services.ts:256-262` vs `launchpad/probe.ts:7-21`, `launchpad/services.ts:9,26-37` |
| A2 | Scheduled podcast spend counts toward the daily cap but is never checked, so a scheduled episode can lock Generations (402) for the day | `media/budget.ts:13-25,41` called only at `media/quotes.ts:221`, `media/jobs.ts:44`; `podcast/pipeline.ts:72-75,167-176` |
| A3 | `/api/research/search` returns titles/summaries unmasked that `/api/research/doc` masks | `research/search.ts:80,172` vs `research/doc.ts:10,111` |
| A4 | Editor apply-feedback rewrites SKILL.md with plain `writeFile`, unserialised — crash truncates, double-submit loses a lesson | `workspace.ts:30-34`, `apply-feedback/route.ts:84-87` |
| A5 | Research status's "Windsor mounted" check is `exists()` (true for an empty leftover folder) while its own inventory uses a device compare | `research/status.ts:24,155` vs `research/inventory.ts:91-98` |
| W1 | Editor file-id regex is case-insensitive in validation but case-sensitive in `describeEditorMedia` | `editor/feedback.ts:15`, `editor/nle/assets.ts:29` vs `editor/media.ts:175,210` |
| W2 | Two client thumbnail caches for the same endpoint with different keys and failure handling | `components/editor/nle/panels/thumbs.ts:37` vs `components/editor/nle/timeline/media.ts:59` |
| W3 | Honcho Ask SSE client parses single-line frames and throws on a malformed frame; server parser tolerates both | `honcho/workspaces/[workspace]/chat/route.ts:79` vs `components/honcho/AskPanel.tsx:43` |
| W4 | Systems Fix-with-agent calls `execFile` directly, skipping `run()`'s `LC_ALL=C`, not-found message and non-zero-exit error | `systems/fix.ts:51` vs `systems/run.ts:42` |
| W5 | `actions.md` itself has no iCloud-eviction check (only linked wiki notes do) | `sources/actions.ts:188`, `actions-write.ts:46` vs `actions.ts:264` |
| W6 | Recos drops Notion "not configured"; Carousels hand-maps Notion errors and loses no-access/429 handling | `components/recos/RecosApp.tsx:72`, `app/api/carousels/route.ts:20` vs `notion/route.ts:22` |

**Disputed:** editor pin limits (`apply-feedback/route.ts:15` 500 vs `editor/feedback.ts:12` 300). Cross-feature agent judged it intentional (aggregate vs per-file); within-feature agent found a 301–500-pin review saves to Teach but fails the notes save. Either way the `SKILLS` set and `timestampSec` bound (none vs 0..86 400) should be shared — resolve the limit when implementing U9.

## Accidental duplication, grouped by concern
| Concern | Copies | Representative locations | Why it diverged |
|---|---|---|---|
| Route wrapper + guard + body parse + error class + `noStore` | ~11 wrappers, 11 error classes, 3 `BadRequest`, 9 `noStore` | `route-helpers.ts:7`, `studio/http.ts:15,28`, `editor/nle/http.ts:14`, `music/http.ts:7`, `music/suno.ts:419,432`, `research/route.ts:10`, `notion/route.ts:22`, `app/api/{ltm,honcho,claude-sessions}/_shared.ts` | `localJson` is GET-only and maps only LTM errors, so each feature wrote its own POST wrapper |
| Secret masking | 5 maskers, 2 deep walkers, 3 literal-key wrappers | `search/redact.ts:258`, `systems/run.ts:63`, `sessions.ts:63,91`, `honcho/_shared.ts:27`, `podcast/util.ts:17`, `media/config.ts:37`, `llm/client.ts:13` | Canonical masker lives inside `search/`, re-exported through an API route; features couldn't find it |
| Windsor root, mount check, free-space floor | 22 literals in 17 files; 7 mount checks; floors 2 vs 3 GiB | `studio/storage.ts:7,13,28`, `media/config.ts:5,10`, `media/storage.ts:16`, `podcast/storage.ts:24`, `feeds/store.ts:15`, `nle/paths.ts:19,24-67` | No storage module; each feature added Windsor when it moved off iCloud |
| Atomic JSON writes | ~14 tmp+rename impls | `podcast/storage.ts:60`, `nle/paths.ts:76`, `feeds/store.ts:82`, `actions-write.ts:75-82`, `music/meta.ts:151`, `carousels/state.ts:106`, `jev/telemetry.ts:101` | Same — written per feature; only Tasks adds an mtime guard, only Feeds serialises |
| Range file serving | 5 identical `parseRange` | `app/api/{studio,music,podcast}/file/route.ts:13`, `app/api/media/file/route.ts:12`, `editor/nle/http.ts:37,55` | Copy-paste; NLE later generalised `streamFile` but nobody migrated |
| Binaries + child processes | ffmpeg/ffprobe ×4, `promisify(execFile)` ×4, spawn+stderr shaping ×9 | `nle/paths.ts:21-22`, `music/library.ts:20-21`, `studio/index-projects.ts:40`, `podcast/config.ts:14-15`, `systems/run.ts:15-57`, `launchpad/tailscale.ts:9` | `systems/run.ts` has `bin()`/`run()` but is in a feature folder |
| Concurrency limiter | 13 | `research/inventory.ts:101`, `music/library.ts:81`, `honcho.ts:408`, `podcast/util.ts:25`, `jev/client.ts:160`, `nle/paths.ts:107` | Tiny helper, never promoted |
| Job queues | 5 single-flight queues | `studio/runner.ts:76,313`, `nle/export.ts:35,158`, `podcast/pipeline.ts:21-46`, `media/jobs.ts:15`, `music/suno.ts:218` | Built per app; Studio renders and NLE exports can run ffmpeg concurrently; media jobs lost on restart |
| Caches / memos / refresh limiters / breakers | 7 mtime config memos, 5 scan memos, 4 force limiters, 2 breakers | `sources/cache.ts:45` vs `llm/config.ts:41`, `podcast/config.ts:40`, `feeds/index.ts:49`, `notion/route.ts:8`, `vaults.ts:97`, `jev/client.ts`, `search/sources.ts:162` | `cached()` has no mtime key or force-limit option |
| Service registry + probe | 2 probers, 3 port registries | see A1; `llm/config.ts:14-15` | Launchpad and Systems built separately |
| Claude handoff + CLI | 2 prompt/guardrail builders, 3 CLI launch paths, 1 of 3 logs usage | `systems/fix.ts:62-91`, `actions-write.ts:117-136`, `podcast/llm.ts:52,150`, `skills/run/route.ts:130`, `llm/router.ts:118` | Shared launcher came late (`claude-terminal.ts`) |
| Text / vault helpers | 5 frontmatter, 3 vault walkers, 3 Obsidian URLs, 4 md→text | `vaults.ts:101,128,158`, `research/vault.ts:90,158,231`, `search/notes-index.ts:73,169`, `sources/skills.ts:12`, `feeds/util.ts:23` | Each feature reads the vault independently |
| Client polling + fetch | 5 hooks + 21 raw `setInterval`; `/api/actions` on 3 timers; ~10 fetch clients | `dashboard/widgets/shared-json.ts:198`, `second-brain/analytics-shared.tsx:40`, `right-hooks.ts:26` (dead), `TasksApp.tsx:86`, `AwaitingBadge.tsx:21`, `AwaitingCard.tsx:19` | `useSharedJson` lives in a dashboard folder |
| Client utilities + UI | 5 markdown renderers, toasts (kit + 6 local; robo-ui Toast dead), `copyText` ×4, `fmtBytes` ×7, `ago` ×10, `isTypingTarget` inlined ×6 | `elements/kit/toast.tsx:16`, `media/ui.tsx:103`, `recos/Toasts.tsx:16`, `lib/events.ts:13`, `notion/MarkdownView.tsx:200`, `second-brain/MarkdownView.tsx:285` | Kit came after the apps |
| Media handoff glue | 4 file-URL builders, 5 inbox-item builders, 3 `brctl` builders, raw inbox key | `studio-client.ts:19`, `gen-client.ts:18`, `music/format.ts:9,36`, `editor/media.ts:22,28`, `EditorApp.tsx:406` vs `lib/editor-inbox.ts:6` | Producers added one by one |
| Podcast → Feeds via loopback HTTP | 1 | `podcast/gather.ts:217-226` vs `feeds/index.ts:85,88` | Avoided an import; also triggers triage and swallows errors |
| Notion access | 3 paths; IDs duplicated | `notion/client.ts:48`, `sources/notion.ts:12`, `launchpad/notion.ts:11,13,57`, `notion/dreams.ts:8`, `notion/catalog.ts:12` | Launchpad pins predate the Notion client |
| Layering inversions | platform → features; lib → API route; 18+ `lib/server` → `@/components` | `route-helpers.ts:4`, `shared-json.ts:15`, `sources/{index,sessions}.ts` → `app/api/honcho/_shared`, `music/library.ts:7`, `studio/index-projects.ts:10` | Types and helpers born in UI folders |

## Legitimate specialization (leave alone)
Podcast feed token auth (`podcast/auth.ts:35-50`; Apple Podcasts can't send tailnet headers) · client-side masker (`dashboard/widgets/source-facts.ts:80`; can't import server-only) · Suno credits (`music/suno.ts:241`; different currency) · Podcast LLM fallback chain (`podcast/llm.ts:209`, layered over `llm/router`) · Honcho dependency host classifier (`systems/honcho-deps.ts:16`) · Feeds' persistent `triage.json` label store over the JEV LRU (`feeds/store.ts:104`).

---

# Appendix A — Cross-feature evidence (verbatim)


Pathfinder Phase 2. Every location below was checked against `src/` with `grep -n`, `sed -n`, `diff` or a short read. Paths are relative to `src/`. An entry is kept only when it has at least 2 verified locations.

**Totals: 35 entries.** 5 are ACCIDENTAL and BUG-RISK, 24 are ACCIDENTAL and CLEANUP, and 6 are LEGITIMATE SPECIALIZATION (all CLEANUP or no action). Five Phase 1 bug claims were downgraded after checking (see §D).

Each entry gives: (a) the concern, (b) its locations, (c) why the copies diverged, (d) the verdict, and (e) the severity.

---

## A. BUG-RISK (all ACCIDENTAL)

**1. Service health probing: Systems and Launchpad can disagree.**
- (b) Systems: `lib/server/systems/run.ts:86` `httpGet` probes `systems/index.ts:36` `:18789/health`, `:37` `:20128/api/health`, `:38` `:37777/api/health` (hard-coded) and `:39` `${HONCHO_URL}/health`. Hermes uses the listener the gateway pid owns (`index.ts:20,52`). "Up" means 2xx plus `ok:true` (`systems/services.ts:256-262`).
- Launchpad: `lib/server/launchpad/probe.ts:7-21` treats any status below 500 as up, and probes different paths (`launchpad/services.ts:26-37`: `/`, `/dashboard`, `/`, `127.0.0.1:8000/docs`). Its Hermes port is `HERMES_GATEWAY_PORT` or 9900 (`services.ts:9`).
- Env drift: Honcho honours `HONCHO_API_URL` (`honcho.ts:23`), but Launchpad hard-codes `:8000`. `CLAUDE_MEM_URL` (`sources/claude-mem.ts:8`) is honoured by search (`search/sources.ts:92`) and ignored by both Systems and Launchpad.
- Separate cache keys: `launchpad:probe:*` vs `systems:core`.
- (c) Launchpad wanted a cheap "is it listening" link badge. Systems wanted real health.
- (d) ACCIDENTAL: both claim to answer "is service X up" for the same five services.
- (e) **BUG-RISK.** Today a 4xx or 503-on-/health service shows "up" on Launchpad and "degraded" on Systems. Setting the env vars or moving the Hermes port makes them disagree outright.

**2. Spend caps: podcast TTS counts toward the daily cap but is never checked against it.**
- (b) `media/budget.ts:41` `assertWithinDailyCap` has two callers only: `media/quotes.ts:221` and `media/jobs.ts:44`.
- `dailySpend` adds podcast TTS USD into the total (`budget.ts:13-25`).
- `podcast/pipeline.ts:72-75,167-176` enforces only the per-episode `hardCapUsd` and the confirm threshold. Confirm is skipped entirely for `trigger: 'scheduled'` (`:57,73,167`).
- (c) The podcast pipeline was built with its own per-episode guardrail before the shared ledger counted it.
- (d) ACCIDENTAL: one ledger, two policies.
- (e) **BUG-RISK.** A scheduled episode can push the day over `VOLTA_GEN_DAILY_USD` unchecked. After that, every paid Generations request gets a 402 for the rest of the day.

**3. Redaction at call sites instead of at the response boundary (research leaks what research masks).**
- (b) `research/doc.ts:10,111` masks `row.title` and `row.summary`, and `threads.ts:76,123,208` masks its fields.
- `research/search.ts:172` returns `publicRow(r)` (`:80`) with the same `LibraryRow` title and summary unmasked.
- The library rows are not masked at build time: `research/library.ts` has no redaction, and `stagea.ts:173` masks only the Stage B text.
- Contrast: Honcho (`app/api/honcho/_shared.ts:27,45` `redactDeep` in `json()`) and Sessions (`sources/sessions.ts:91` `maskDeep`) mask the whole payload once.
- (c) Research masks per field as each view was added. The boundary-walker pattern never reached it.
- (d) ACCIDENTAL.
- (e) **BUG-RISK.** `/api/research/search` can return secret-shaped text that `/api/research/doc` hides for the same row.

**4. Atomic writes: apply-feedback rewrites SKILL.md non-atomically.**
- (b) `lib/server/workspace.ts:30-34` `writeWorkspaceFile` is a plain `fs.writeFile`. `app/api/editor/apply-feedback/route.ts:84-87` does read, insert, then write through it, with no tmp+rename and no serialisation.
- About 14 tmp+rename writers exist elsewhere (§B-7). `nle/paths.ts:76` `writeAtomic` and `podcast/storage.ts:60` `writeFileAtomic` are exported and reusable.
- (c) `workspace.ts` is mock-era. The atomic helpers grew per feature later.
- (d) ACCIDENTAL.
- (e) **BUG-RISK.** A crash mid-write truncates `workspace/skills/*/SKILL.md`. A double submit loses one lesson (last writer wins).

**5. Windsor "mounted" test: the weak check disagrees with the real one.**
- (b) `research/status.ts:24,155` uses `exists('/Volumes/Windsor')`. In the same feature, `research/inventory.ts:91-98` compares `dev` against `/Volumes` (a real mount). The same dev-compare is at `studio/storage.ts:28`, `media/storage.ts:16-17`, `podcast/storage.ts:24-28`, `feeds/store.ts:15-20`, `music/suno.ts:52` and `music/meta.ts:22`.
- (c) The status page was written as a quick presence check.
- (d) ACCIDENTAL.
- (e) **BUG-RISK (low, display only).** A leftover `/Volumes/Windsor` directory after an unclean eject suppresses the "not mounted" warning, while inventory refuses to persist.

---

## B. ACCIDENTAL, CLEANUP

**1. Secret masker sprawl** (everything except §A-3).
- Canonical masker: `search/redact.ts:258`. Re-exported by `redact.ts:6` and re-exported again by `app/api/honcho/_shared.ts:22`.
- Layering: `sources/index.ts:2` and `sources/sessions.ts:6` import it from that API route.
- Independent regex set: `systems/run.ts:63`. Editor's ffmpeg log uses it (`editor/nle/export.ts:8,201`), while Studio's child logs use `redactSecrets` (`studio/runner.ts:9,359`).
- `sessions.ts:63` `maskToken` duplicates `search/redact.ts:87`.
- Literal-key wrappers: `podcast/util.ts:17`, `media/config.ts:37`, `llm/client.ts:13`.
- Deep walkers `honcho/_shared.ts:27` and `sessions.ts:91` differ only in their id-key rule.
- Drift: different masks for the same kind of data. No proven leak beyond §A-3.

**2. Route wrappers, error classes and `noStore`.**
- `route-helpers.ts:7` `localJson` covers GET only and maps only `LtmUnavailableError`.
- Re-implementations: `studio/http.ts:15,28` (the de facto platform POST wrapper, used by carousels and 10 editor routes), `editor/nle/http.ts:14`, `music/http.ts:7`, `music/suno.ts:419,432`, `research/route.ts:10`, `notion/route.ts:22`, `honcho/_shared.ts:140`, `claude-sessions/_shared.ts:34`, `ltm/_shared.ts:5`.
- Hand-rolled guard plus parse: `apply-feedback/route.ts:59-70`, `actions/route.ts:28-54`, `systems/fix/route.ts:17-41`, and the media quote, generate, export, reveal and promote routes.
- Status-error classes (11, all `{status,message}`): `StudioError` (`studio/storage.ts:17`, aliased `NleError` at `nle/paths.ts:28`), `MediaError` (`media/config.ts:26`), `MusicError` (`music/errors.ts:5`), `PodcastError` (`podcast/storage.ts:11`), `ResearchError` (`research/config.ts:15`), `NotionError` (`notion/client.ts:18`), `ActionWriteError` (`actions-write.ts:28`), `NoteError` (`actions.ts:238`), `FixError` (`fix.ts:19`), `TaskError` (`llm/router.ts:23`), `JevError` (`jev/types.ts:56`).
- `BadRequest` defined 3 times: `notion/route.ts:19`, `honcho/_shared.ts:13`, `claude-sessions/_shared.ts:11`.
- `const noStore` defined 9 times: `music/errors.ts`, `studio/http.ts`, `nle/http.ts`, `ltm/_shared.ts`, `claude-sessions/_shared.ts`, `honcho/_shared.ts`, `actions/route.ts`, `actions/note/route.ts`, `systems/fix/route.ts`.
- Latent: typed errors thrown under `localJson` (used by `music`, `media/items`, `podcast/*`) would become 500. None was found thrown today.

**3. Cross-site guard copy.** `honcho/_shared.ts:122-135` vs `local-only.ts:42-58`, and `readBody` `_shared.ts:89` vs `rejectNonLocalMutation` `local-only.ts:71` (Honcho adds a 64 KB cap). Downgraded, see §D. All 20 Honcho routes go through `handle`.

**4. Loopback and host sets: 7 copies.**
- `remote-client.ts:7`, `local-only.ts:4`, `podcast/auth.ts:14` (plus `hostnameOf` at `:19`, which copies `local-only.ts:30-31`), `launchpad/tailscale.ts:11`, `launchpad/services.ts:61`, `music/suno.ts:34`, `systems/honcho-deps.ts:16`.
- The missing bare `'::1'` is harmless (§D).

**5. Range file serving: 5 `parseRange` copies.**
- `app/api/{studio,music,podcast}/file/route.ts:13`, `media/file/route.ts:12` and `editor/nle/http.ts:37` are behaviourally identical (checked with diff).
- The generic `streamFile` (`nle/http.ts:55`) is used only by `editor/nle/file`.
- Media drift: `immutable` cache (`media/file:39`) and no `req.signal` listener (`:48`). Low risk, see §D.

**6. Job queues, each single-flight but separate.**
- Studio: `studio/runner.ts:76-77,313-317` (JSONL history; interrupted on restart, `:125-131`).
- Editor export: `nle/export.ts:35-36,158-164` (`export-jobs.json`).
- Podcast: `pipeline.ts:21-46` (`.job.json`).
- Media: `media/jobs.ts:15,32-71`, memory only, so a restart loses progress.
- Suno: a boolean flag (`suno.ts:218,236`).
- Studio renders and NLE exports can run heavy ffmpeg at the same time.

**7. Atomic JSON stores: about 14 tmp+rename implementations.**
- Async: `research/inventory.ts:227`, `music/meta.ts:151`, `carousels/state.ts:106`, `music/suno.ts:323`, `feeds/store.ts:82` (`JsonState` with a chain), `podcast/storage.ts:60-63`, `actions-write.ts:75-82` (the only one with an mtime guard), `editor/feedback.ts:136-139`, `nle/paths.ts:76-81`, `nle/text.ts:138`, `nle/thumbs.ts:78`.
- Sync: `music/config.ts:90`, `podcast/config.ts:68`, `jev/telemetry.ts:101`.

**8. Windsor root, mount check and free-space floor.**
- 22 `'/Volumes/Windsor` literals across 17 files, including `studio/storage.ts:7`, `media/config.ts:5`, `podcast/config.ts:11`, `feeds/config.ts:15`, `music/{suno.ts:24,meta.ts:12,config.ts:74}`, `editor/feedback.ts:11`, `nle/paths.ts:19`, `carousels/state.ts:11`, `llm/usage-log.ts:11`, `research/config.ts:131`, `ltm.ts:10` and `systems/storage.ts:30`.
- 7 dev-compare mount checks (§A-5), plus weaker parent-`existsSync` checks at `llm/usage-log.ts:48` and `jev/telemetry.ts:94-96`.
- Free-space floor: Studio needs 3 GiB free (`studio/storage.ts:13`). Podcast and media need 2 GiB (`podcast/config.ts:13`, `media/config.ts:10`). NLE needs 3 GiB to remain after the write (`nle/paths.ts:26,56`).
- `GiB` is defined twice: `nle/paths.ts:24`, `systems/run.ts:122`.

**9. Binary paths, child processes and the Claude CLI.**
- ffmpeg/ffprobe constants: `music/library.ts:20-21`, `studio/index-projects.ts:40`, `nle/paths.ts:21-22`, `podcast/config.ts:14-15`. Only podcast honours `VOLTA_FFMPEG`, and `pipeline.ts:68` still prints the hard-coded path.
- Resolver: `systems/run.ts:15-31` `bin()`/`BIN`.
- `promisify(execFile)` 4 times: `research/status.ts:14`, `launchpad/repos.ts:12`, `sources/routines.ts:13`, `launchpad/tailscale.ts:9` (with its own candidate loop).
- Claude CLI three ways: the resolver `podcast/llm.ts:52`, bare `'claude'` on PATH at `skills/run/route.ts:130`, and a Terminal shell at `claude-terminal.ts:35`. Only `llm/router.ts:118` calls `logUsage`, so CLI calls are invisible to quota.

**10. Concurrency limiter: 13 copies.**
- `mapLimit`: `research/inventory.ts:101`, `music/library.ts:81`, `studio/index-projects.ts:117`, `search/notes-index.ts:58`, `sources/notes.ts:84`.
- `pool`: `honcho.ts:408`, `launchpad/repos.ts:133`.
- `pmap`: `podcast/util.ts:25`, `jev/client.ts:160`.
- `limiter`: `nle/paths.ts:107`.
- Inline `queue.shift` pools: `research/stagea.ts:113`, `research/library.ts:54`, `research/vault.ts:202`.

**11. Caches, memos, force limiters and breakers beside `sources/cache.ts`.**
- mtime config memos: `llm/config.ts:41`, `research/config.ts:77`, `studio/config.ts:209`, `podcast/config.ts:40`, `music/meta.ts:59`, `sources/actions.ts:184`, `feeds/files.ts:145`.
- mtime+size scan memos: `sources/notes.ts:65`, `transcripts.ts:167`, `sessions.ts:663,1403`, `search/notes-index.ts:93`.
- 4 force-refresh limiters: `vaults.ts:97-103` (10 s), `launchpad/repos.ts:190-196` (60 s), `notion/route.ts:8-16` (30 s per key), `feeds/index.ts:49` (5 s).
- Breakers: `jev/client.ts`, `search/sources.ts:162`.

**12. Agent handoff.**
- `systems/fix.ts:62-91,104` and `sources/actions-write.ts:117-136` write their own "ask before destructive…" rules and call `openClaudeInTerminal` with different cwd and tag. Only Tasks logs the handoff.
- Client-side copy-prompt builders: `CarouselsApp.tsx:69`, `recos/recos-lib.ts:85`.
- The prompt bodies legitimately differ. The guardrails and the log step should be shared.

**13. Two JEVs.**
- The heuristic layer `app/api/jev-router/jev.ts:74`, used by `skills/run/route.ts:12` and `cache-status/route.ts:4`. It already imports `routeTier` from `lib/server/jev`, so it is a wrapper rather than a full fork.
- `lib/server/jev` is imported statically (`podcast/rank.ts:2`) and dynamically (`feeds/triage.ts:27`, `research/search.ts:90`).
- Feeds also keeps its own label cache on top of the JEV LRU.

**14. Text, vault and markdown helpers.**
- Frontmatter, 5 copies: `vaults.ts:158`, `research/vault.ts:90`, `sources/skills.ts:12`, `app/api/workspace/frontmatter.ts:2`, `search/notes-index.ts:169`.
- Obsidian URLs, 3 copies: `vaults.ts:128`, `research/vault.ts:231`, `components/second-brain/graph-model.ts:88`.
- Vault walkers, 3 copies: `vaults.ts:101`, `research/vault.ts:158-224`, `search/notes-index.ts:73`.
- Markdown-to-text: `feeds/util.ts:23,36`, `lib/notion-md.ts:7`, `podcast/gather.ts:52`, `research/vault.ts:101`.

**15. Client polling and fetch.**
- Hooks: `useSharedJson` (`dashboard/widgets/shared-json.ts:198`), `useApi` (`second-brain/analytics-shared.tsx:40`), `useVisiblePoll` (`ltm/useVisiblePoll.ts:14`), `useSection` (`LaunchpadApp.tsx:29`), `useRemote` (`notion/useRemote.ts:21`).
- `usePolledJson` (`right-hooks.ts:26`) is dead: no external references.
- Raw `setInterval` in 21 component lines.
- `/api/actions` runs on 3 independent timers: `TasksApp.tsx:86`, `AwaitingBadge.tsx:21-32`, and `AwaitingCard.tsx:19` / `needs-you.ts:17`.
- The "10 per-feature fetch clients" count comes from Phase 1 and was not re-counted.

**16. Client utilities, toasts and renderers.**
- `isTypingTarget` exists at `lib/events.ts:13`, yet is inlined 6 times: `LibraryView.tsx:167`, `PlayerBar.tsx:205`, `FeedsApp.tsx:21`, `podcast/Player.tsx:39`, `GenerationsApp.tsx:160`, `CarouselsApp.tsx:377` (the last omits SELECT).
- fmtBytes, 7 copies: `research/types.ts:305`, `music/format.ts:11`, `studio-client.ts:21`, `sessions-client.ts:113`, `podcast-client.ts:32`, `systems/format.ts:10`, `gen-client.ts:20`.
- ago/relTime, 10 copies: `studio-client.ts:35`, `ltm-client.ts:94`, `feeds-client.ts:43`, `artifact-meta.ts:82`, `source-facts.ts:198`, `launchpad/parts.tsx:10`, `sessions-client.ts:22`, `graph-model.ts:254`, `analytics-shared.tsx:131`, `lib/server/sources/index.ts:24`.
- copyText, 4 copies: `elements/kit/clipboard.ts:4`, `media/ui.tsx:27`, `RecosApp.tsx:30`, `artifact-meta.ts:102`. Raw `navigator.clipboard` is used in at least 6 more places.
- `robo-ui/Toast.tsx` has zero importers. The kit toast sits beside local stacks.
- Markdown renderers, 5 copies: `notion/MarkdownView`, `second-brain/MarkdownView`, `research/Markdown.tsx:124`, `MiniMarkdown`, `honcho/RichText`. A server-side `podcast/notes.ts:65` makes a sixth.
- The Honcho start command is duplicated: `honcho-client.ts:4` and `honcho.ts:24`.

**17. Media handoff glue.**
- File-URL builders: `studio-client.ts:19`, `music/format.ts:36`, `gen-client.ts:18`, `editor/media.ts:26-28`.
- `EditorApp.tsx:406` uses the raw `'rubric:editor-inbox'` string instead of `EDITOR_INBOX_KEY` (`lib/editor-inbox.ts:6`). Five producers build the item by hand (Phase 1 lines).
- brctl command builders, 3 copies: `editor/media.ts:22`, `music/format.ts:9`, `research/types.ts:303`.
- Hand-written iCloud hint strings: `studio/config.ts:260`, `studio/runner.ts:286,510`, `nle/projects.ts:71`, `nle/assets.ts:119`.

**18. Layering inversions.**
- Platform imports features: `route-helpers.ts:4` imports `./ltm`, and `shared-json.ts:15` imports `components/ltm/ltm-client`.
- Library code imports an API route: `sources/{index,sessions}.ts` import from `app/api/honcho/_shared`.
- `lib/server` imports `@/components` in 18 or more files, including runtime values (not only types): `studio/index-projects.ts:10` and `music/library.ts:7` (`brctlCommand`), `research/library.ts:4`, `research/stats.ts:2`.
- `apply-feedback/route.ts:9` imports `components/editor/rl-rules`.

**19. Podcast reads feeds over loopback HTTP.**
- `podcast/gather.ts:217-226` fetches `127.0.0.1:${PORT||50000}/api/feeds` instead of calling `listFeeds` (`feeds/index.ts:85`).
- That route also fires `scheduleTriage` (`:88`) as a side effect.
- Every failure becomes `[]`, so feeds drop out of the episode silently. This is latent today.

**20. Notion access.**
- Three paths: `notion/client.ts:48`, `sources/notion.ts:12`, `launchpad/notion.ts:57`.
- `config/notion-links.json` is read twice: `notion/links.ts:7` and `launchpad/notion.ts:57`.
- Duplicated IDs: Dreams (`notion/dreams.ts:8` = `launchpad/notion.ts:11`) and Video Production (`notion/catalog.ts:12` = `launchpad/notion.ts:13`).
- Podcast calls `notionQuery` raw, outside the cache (`podcast/gather.ts:36`).

**21. Read and review state in 4 styles.**
- Server Windsor JSON: `feeds/store.ts:110`.
- Windsor state plus a localStorage backup: `carousels/state.ts`.
- localStorage only: `RecosApp.tsx:92,106`.
- UI preference: `ScriptsApp.tsx:28,60` (localStorage is fine for this one).
- The phone (remote client) does not see Recos review state.

**22. HTTP JSON-with-timeout helpers.**
- `sources/claude-mem.ts:56` `getJson` and `sessions.ts:1468` `memFetch` call the same worker.
- `honcho.ts:95` `request` and `:144` `openStream` duplicate the offline/502 mapping.
- Provider wrappers (Phase 1): `xai`, `eleven`, `gemini`, Suno `svc`.

**23. Path containment.**
- `isInside` is defined twice: `studio/storage.ts:69`, `music/library.ts:72`.
- Inline realpath+startsWith: `media/storage.ts:110-114`, `media/export.ts:52-58`.
- `workspace.ts:12-18` resolves without realpath.

**24. Small server helpers.**
- `localDate`: `podcast/util.ts:11`, `media/storage.ts:41`, `transcripts.ts:200`, `sessions.ts:291`.
- `readJson`: `launchpad/notion.ts:25`, `sources/mcp.ts:65`, `sources/plugins.ts:22`.
- `tilde`: `systems/run.ts:12` vs `nle/paths.ts:71`.
- `stamp`: `studio/args.ts:27`, `editor/review-note.ts:16`.
- `expandHome` 3 times (Phase 1 lines).

---

## C. LEGITIMATE SPECIALIZATION

**1. Podcast feed auth.** `podcast/auth.ts:35-50` vs `local-only.ts`. Apple Podcasts never sends the tailnet login header, so a token path is a different trust model. Only the host-set and `hostnameOf` copy is accidental (§B-4).

**2. Client-side masker.** `dashboard/widgets/source-facts.ts:80` vs `search/redact.ts:258`. The client cannot import `server-only`, and this copy is documented as defence in depth.

**3. Suno credit gate.** `music/suno.ts:241` vs the USD ledger in `media/budget.ts`. Suno uses subscription credits, a different currency, and they are recorded in `meta.json` (`suno.ts:397-405`).

**4. Editor pin limits.** `apply-feedback/route.ts:15` (`MAX_PINS` 500, aggregated across clips) vs `editor/feedback.ts:12` (300 per file). The different limits are intentional. Only the identical `SKILLS` set (`:14` vs `:13`) should be shared.

**5. Podcast LLM fallback chain.** `podcast/llm.ts:209` layers over `llm/router` `complete` (`llm.ts:6`) with a `claude -p` fallback, a genuine extra. The logging gap is covered in §B-9.

**6. Honcho dependency host set.** `systems/honcho-deps.ts:16` classifies upstream URLs (Docker hostnames, `0.0.0.0`) rather than guarding requests.

---

## D. Phase 1 claims downgraded after verification

- **LOOPBACK missing `'::1'`** (`launchpad/services.ts:61`, `music/suno.ts:34`): not a bug. Both test `new URL(...).hostname`, which always returns `[::1]` with brackets (checked with node).
- **Weaker Honcho `rejectCrossSite`**: equivalent in practice. `rejectNonLocal` already gates Host, and "Origin host == Host" then implies an allowed host. The two differ only for non-standard `Sec-Fetch-Site` values.
- **Media file stream not destroyed on abort**: `Readable.toWeb` destroys the node stream when the web stream is cancelled. The leak risk is low, so this is cleanup.
- **Podcast manifest upsert not serialised**: the only caller is the single-flight pipeline (`pipeline.ts:228`). Safe today.
- **`localJson` swallows typed statuses**: no loader on a `localJson` route was found throwing a typed error today. Latent only.

---

## Sources consulted and confidence

- **Inputs:** `PATHFINDER-2026-10-28/00-features.md` and the "Repeated concerns" sections of all 15 `01-flowcharts/*.md`.
- **Source verified in this pass:**
  - Read: `redact.ts`, `search/redact.ts` (exports), `systems/run.ts`, `systems/index.ts`, `systems/services.ts` (excerpt), `launchpad/{probe,services}.ts`, `local-only.ts`, `app/api/honcho/_shared.ts`, `sources/sessions.ts:55-110`, `source-facts.ts`, `podcast/{util,auth,storage}.ts`, `media/{budget,storage,config}.ts`, `music/{suno,http,errors}.ts`, `studio/http.ts`, `editor/nle/{http,paths}.ts`, `route-helpers.ts`, `research/{route,search,doc,status,inventory}.ts` (excerpts), `workspace.ts`, `apply-feedback/route.ts`, `editor/feedback.ts`, `actions-write.ts` (`commit` and handoff), `systems/fix.ts`, `claude-terminal.ts`, `skills/run/route.ts` (`runClaude`), `podcast/gather.ts:210-230`.
  - Diffed: the four file routes.
  - Grep sweeps: rename sites, mount checks, limiters, memos, error classes, `noStore`, client utilities, `@/components` imports.
- **Confidence:**
  - **High** for every §A entry: the code path was read and the divergence was reasoned from source.
  - **High** for the §B location lists.
  - **Medium** for counts copied from Phase 1 and not re-counted here (client fetch clients ×10, editor-inbox producer lines, provider fetch wrappers, `expandHome`, the 15 hand-rolled dialogs).
- **Not verified:**
  - At runtime: whether `HONCHO_API_URL`, `CLAUDE_MEM_URL` or `HERMES_GATEWAY_PORT` are actually set on this Mac.
  - Whether a scheduled podcast has actually exceeded the daily cap.
  - Whether research Stage A summaries currently contain secrets.

---

# Appendix B — Within-feature evidence (verbatim)


Scope: code repeated INSIDE one feature (boundaries from `00-features.md`). Cross-feature copies are left to the other agent and are listed only under "Dropped / out of scope". Paths are relative to `src/`. Every location below was checked with `grep -n` or `sed -n` against the current tree. Line numbers can be off by about 2 where a helper's body starts after a doc comment.

Legend: **Drift** = the copies behave differently today. **Priority**: H (fix in the refactor), M (worth folding in when the code is touched), L (cheap tidy-up).

---

## 1. editor (11)

**E1 · `jsonFetch` client helper ×2. Drift: yes (minor). Priority M**
- `components/editor/EditorApp.tsx:117`: POST whenever a body is given, and supports `keepalive`. Only GET gets `cache: 'no-store'`. It cannot send PUT or DELETE.
- `components/editor/nle/NleWorkspace.tsx:45`: takes an explicit `method`, always sends `no-store`, and has no `keepalive`.
- Both use the same `{error}` and `HTTP n` shaping.
- Fix: one `components/editor/api.ts` `jsonFetch(url, {method, body, keepalive})`.

**E2 · Media-bin loader ×2. Drift: no. Priority M**
- `EditorApp.tsx:165-173` and `NleWorkspace.tsx:120-128` are the same `loadBin(refresh)` against `/api/editor/media`, with the same `BinState` transitions.
- When the user switches mode, the bin loads twice.
- Fix: a `useEditorBin()` hook, or lift the state into `EditorShell` so the two modes share it.

**E3 · Toast `notify` plus a 4.2 s auto-dismiss ×2. Drift: no. Priority L**
- `EditorApp.tsx:150-158` and `NleWorkspace.tsx:109-117` both use `toastSeq` and `setTimeout(...,4200)`.
- Fix: a shared `useEditorToast()`, or the elements kit toast.

**E4 · localStorage try/catch wrappers ×2. Drift: no (only the validation differs). Priority L**
- `EditorApp.tsx:94-109` has `readBackup`/`writeBackup`.
- `NleWorkspace.tsx:29-43` has `ls.get`/`ls.set`.
- Fix: one `safeStorage` get/set JSON helper.

**E5 · Client thumbnail-sprite caches ×2 for the same endpoint. Drift: yes. Priority H**
- `components/editor/nle/panels/thumbs.ts:37-58` (`loadThumb`, key `id#count`):
  - goes through a concurrency `schedule()`
  - accepts partial replies, defaulting `frameW`/`frameH`/`duration` to 0
  - caches failures as `null`
- `components/editor/nle/timeline/media.ts:59-64` (`thumbs`, key `id|count`, through `makeCache`):
  - has no concurrency limit
  - throws on any missing or zero field
- Because the keys differ, the same sprite can be fetched twice, and a reply that one panel accepts is rejected by the other.
- Fix: one `thumbCache` module used by both the panel and the timeline.

**E6 · Pin validation ×2. Drift: yes. Priority H**
- `app/api/editor/apply-feedback/route.ts:14-53`: `SKILLS` set, `MAX_PINS = 500`, and `timestampSec >= 0` with no upper bound. Errors come back as strings.
- `lib/server/editor/feedback.ts:12-72`: the same `SKILLS`, `MAX_PINS = 300`, and `timestampSec` limited to 0..86 400. Errors are thrown as `StudioError`.
- A 301–500 pin review saves to Teach but fails the notes save.
- Fix: export the `SKILLS`/`MAX_PINS` constants and a `validatePinInput` from `feedback.ts`; apply-feedback maps its rows on top of them.

**E7 · Editor file-id regex ×3. Drift: yes. Priority M**
- `lib/server/editor/feedback.ts:15` `KEY_RE` `[om]_hex16|g_…` with `/i`.
- `lib/server/editor/nle/assets.ts:29` `BIN_ID` `o_|g_|m_` with `/i`.
- `lib/server/editor/media.ts:175,198,210` dispatches inline. Its `o_` and `m_` tests are case-sensitive.
- An upper-case `O_…` passes `BIN_ID` and `KEY_RE` but falls through `describeEditorMedia`.
- Fix: one `editorIds.ts` exporting `BIN_ID`, `UPLOAD_ID` and a `kindOf(id)` dispatcher.

**E8 · Extension and MIME tables kept in parallel ×3. Drift: no (one gap). Priority L**
- `nle/assets.ts:31-50` `MIME_BY_EXT`, `nle/assets.ts:51-70` `MEDIA_BY_EXT`, and `nle/upload.ts:16-37` `EXT_BY_TYPE` list the same 18 formats.
- `EXT_BY_TYPE` has no `audio/opus` entry, but `MEDIA_BY_EXT` accepts `.opus`.
- Fix: one table of `{ext, mime[], media}` with the three maps derived from it.

**E9 · Atomic tmp+rename ×2. Drift: minor. Priority L**
- `lib/server/editor/nle/paths.ts:76-85` `writeAtomic` (pid+time tmp, cleans up on failure).
- An inline copy in `lib/server/editor/feedback.ts:134-140` (random tmp, cleans up on failure).
- Fix: `feedback.ts` calls `writeAtomic`.

**E10 · JSON-body mutation route wrapper. Drift: yes. Priority M**
- NLE routes use `nleMutation` (`lib/server/editor/nle/http.ts:14-33`), which has a 64 KB cap, requires an object body and sends `no-store`.
- `app/api/editor/apply-feedback/route.ts:59-67` hand-rolls the guard and `req.json()`: no body-size cap, and `bad()` replies carry no `no-store`.
- Feedback and review-note borrow studio's `studioPost`.
- Fix: one editor wrapper (or the platform POST wrapper) for all `/api/editor/*` mutations.

**E11 · Child-process spawn with stderr-to-error shaping ×4. Drift: yes. Priority M**
- `nle/thumbs.ts:68-73`: `execFile`, 60 s, reports the **last** stderr line.
- `nle/text.ts:134-135`: swiftc, reports the **first** stderr line, cut to 200 characters.
- `nle/text.ts:234-239`: spawn with a 30 s SIGKILL timer.
- `nle/peaks.ts:44-83`: spawn with a 180 s SIGKILL timer.
- `nle/export.ts:266-293`: spawn with SIGTERM then SIGKILL (`:161-164`).
- Fix: an `runTool(bin,args,{timeoutMs})` in `nle/paths.ts` returning `{stdout, errLine}` with one rule for picking the stderr line.

---

## 2. research (6)

**R1 · Copied one-liners `stemOf` ×2 and `clip` ×2. Drift: no. Priority L**
- `stemOf`: `lib/server/research/library.ts:46` and `lib/server/research/doc.ts:9`.
- `clip`: `library.ts:47` and `lib/server/research/threads.ts:17`.
- Fix: move them to a `research/text.ts`.

**R2 · `publicRow` ×2 (a strip-list of private index fields). Drift: no, but the field list must stay in sync. Priority M**
- `lib/server/research/search.ts:80-85` and `lib/server/research/doc.ts:13-18`.
- Fix: export it once from `library.ts`, next to the `LibRow` type that defines the fields.

**R3 · Redaction of library rows applied on one path only. Drift: yes. Priority H**
- `doc.ts:111` masks `row.title` and `row.summary`.
- `search.ts:172` returns the same `LibraryRow` fields unmasked (`search.ts` does not import `redact`).
- Fix: do the masking inside the shared `publicRow` (R2) so every serialiser masks.

**R4 · "Inventory still building" sentinel: ×4 on the server, retry ×2 on the client. Drift: yes (client). Priority M**
- Server: `{building:true, inventory: inventoryState()}` at `app/api/research/doc/route.ts:13`, `stats/route.ts:9`, `threads/route.ts:9` and `lib/server/research/search.ts:111`.
- Client:
  - `components/research/LibraryView.tsx:197-217` and `ThreadsView.tsx:292-299` retry every 2.5 s.
  - `DocPanel.tsx:33-34` shows an error and never retries.
- Fix: a `buildingResponse()` on the server and a `useResearchFetch(url)` hook that owns the retry.

**R5 · Bounded-concurrency worker pool ×4. Drift: no (only the width: 16/16/12/param). Priority M**
- `lib/server/research/inventory.ts:101` `mapLimit`.
- Inline `queue.shift()` pools at `stagea.ts:110-125`, `library.ts:51-63` and `vault.ts:199-221`.
- Fix: export `mapLimit` from `inventory.ts` (or the platform) and use it at the three inline sites.

**R6 · Windsor mount check ×2. Drift: yes. Priority M**
- `inventory.ts:91-98` compares `dev` against `/Volumes`.
- `lib/server/research/status.ts:155` uses `exists('/Volumes/Windsor')`, which also reports true for an empty, unmounted mount-point directory.
- Fix: `status.ts` uses `inventory.windsorMounted()` (export it).

---

## 3. search (3)

**S1 · `fmt = n.toLocaleString('en-US')` ×3. Drift: no. Priority L**
- `lib/server/search/index.ts:42`, `lib/server/search/sources.ts:32` and `lib/server/search/notes-index.ts:156`.
- Fix: export it from `search/text.ts`.

**S2 · LTM hit text fetched twice (N+1). Drift: n/a (wasted work). Priority M**
- `lib/server/search/sources.ts:45-47`: `listCaptures` already selects `substr(content,1,4000)` (`lib/server/ltm.ts:191`).
- Then each hit calls `getCapture`, which runs three queries (`ltm.ts:204-211`).
- The reason given is masking before windowing.
- Fix: ask `listCaptures` for full content (or masked content) in one query. Coordinate with the memory owner, because `ltm.ts` is in memory.

**S3 · Search constants copied between client and server. Drift: no. Priority L**
- `MIN_QUERY_CHARS`: `lib/server/search/index.ts:25` and `components/search/search-client.ts:8`.
- Source labels: `index.ts:30-39` `SOURCES[].label` and `search-client.ts:10-19` `SOURCE_META[].label`.
- Fix: a client-safe `search/constants.ts` that both import.

---

## 4. memory (11)

**M1 · Bounded int query parser ×3. Drift: yes. Priority M**
- `app/api/honcho/_shared.ts:64` `intOf` and `app/api/claude-sessions/_shared.ts:14` `intParam` are identical: they throw `BadRequest`.
- `app/api/ltm/_shared.ts:13` `intParam` silently returns `undefined` for bad input and has no bounds.
- Fix: one `intParam(v,name,def,min,max)` in a shared memory route module (or `route-helpers`).

**M2 · Three per-app route-helper modules. Drift: yes. Priority M**
- `noStore` ×3: `ltm/_shared.ts:19`, `honcho/_shared.ts:8` and `claude-sessions/_shared.ts:9`.
- `BadRequest` ×2: `honcho/_shared.ts:13` and `claude-sessions/_shared.ts:11`.
- Three error responders:
  - `ltm/_shared.ts:5` `ltmError` (no `Cache-Control` on errors)
  - `honcho/_shared.ts:99,140` `honchoError`/`handle`
  - `claude-sessions/_shared.ts:21` `respond` (adds `no-store`)
- Fix: merge them into one `app/api/_memory/shared.ts`, or into platform `route-helpers`.

**M3 · Honcho fetch error mapping ×2. Drift: minor. Priority L**
- `lib/server/honcho.ts:108-118` and `:156-175` duplicate the connection-failure and `502/504 with no body = starting` mapping.
- `request` maps a default-length timeout to Offline; `openStream` always maps it to Timeout.
- Fix: a `mapHonchoFetchError(err, timeout, opts)` plus a `readErrorBody(res)`.

**M4 · SSE frame parsing ×2. Drift: yes. Priority M**
- `app/api/honcho/workspaces/[workspace]/chat/route.ts:79-93` joins multi-line `data:` and skips bad JSON.
- `components/honcho/AskPanel.tsx:43-50` takes a single `data:` line and `JSON.parse` throws on a malformed frame.
- Fix: a tiny shared `sseFrames(reader)` async iterator used on both sides.

**M5 · `splitHighlight` ×2. Drift: yes. Priority M**
- `components/ltm/ltm-client.ts:102` matches the whole query as a phrase.
- `components/honcho/honcho-client.ts:104` matches any word of 2 or more characters, using a regex.
- The same function name gives different highlighting.
- Fix: one helper with `mode:'phrase'|'words'`.

**M6 · Deep redaction walkers ×2. Drift: yes. Priority H**
- `app/api/honcho/_shared.ts:27-41` `redactDeep`:
  - id keys `/^(id|.+_ids?)$/`
  - masks secret-named keys with `maskToken`
  - leaves class instances alone
- `lib/server/sources/sessions.ts:91-101` `maskDeep`:
  - a fixed `ID_KEYS` set
  - no secret-key rule
  - walks any object
- Fix: one `redactDeep(v, {idKeys})` in the platform redactor.

**M7 · Client fetch wrappers ×2 and abort checks ×2. Drift: yes. Priority M**
- `components/ltm/ltm-client.ts:21` `getJson`:
  - rejects a 2xx response whose JSON is malformed
  - rethrows an abort that happens mid-body
  - offline flag is `unavailable`
- `components/honcho/honcho-client.ts:22-41` `parse`/`hGet`/`hPost`:
  - a malformed 2xx body resolves to `{}`
  - offline flag is `offline`
- `isAbortError` (`ltm-client.ts:14`) and `isAbort` (`honcho-client.ts:19`) are the same check.
- Fix: one memory client `getJson`/`postJson` with an error class that carries `offline`.

**M8 · Relative-time formatters ×2. Drift: yes. Priority L**
- `components/ltm/ltm-client.ts:93` `agoLabel` (minutes in, never shows months).
- `components/sessions/sessions-client.ts:22` `ago` (ISO in, shows `mo` after 60 days).
- Fix: one `ago()` shared with home's copies (see H7).

**M9 · 250 ms search debounce ×2. Drift: no. Priority L**
- `components/ltm/LtmApp.tsx:206-209` and `components/sessions/SessionsApp.tsx:70-73`.
- Fix: a `useDebounced(value, 250)` hook.

**M10 · Constants copied between client and server. Drift: no. Priority L**
- `components/honcho/honcho-client.ts:4` `START_COMMAND` matches `lib/server/honcho.ts:24` `HONCHO_START_COMMAND`.
- The session and project regexes are retyped inline in `components/sessions/SessionsApp.tsx:61-62`. The originals are `lib/server/sources/sessions.ts:1067` `SESSION_ID_RE` and `app/api/claude-sessions/route.ts:7` `PROJECT_RE`.
- Fix: a client-safe `types`/`constants` module for each app.

**M11 · Three polling mechanisms in one feature. Drift: yes (pause and catch-up behaviour differs). Priority M**
- `useVisiblePoll`: `LtmApp.tsx:97` and `HonchoApp.tsx:288`.
- `useSharedJson`: `SessionsApp.tsx:85`.
- Raw `setInterval`: `HonchoApp.tsx:204` and `SessionsApp.tsx:66`.
- Fix: standardise on `useSharedJson` (or `useVisiblePoll`) for data, and use one clock hook for "now".

---

## 5. home (8)

**H1 · Same endpoints polled through two different stores. Drift: yes. Priority H**
- `/api/sources`: `components/dashboard/widgets/left-sources.ts:16,25` uses `useSharedJson`; `components/second-brain/ApplicationsView.tsx:40` uses `useApi`.
- `/api/routines`: `RoutinesAnalyticsView.tsx:86` uses `useApi`; four other sites use `useSharedJson`.
- `/api/skills-real`: `SkillsAnalyticsView.tsx:86` uses `useApi`.
- `useApi` (`second-brain/analytics-shared.tsx:40`) does not share the `useSharedJson` store, so the same URL is requested twice when both are mounted.
- A third poller, `usePolledJson` (`dashboard/widgets/right-hooks.ts:26`), has no importers.
- Fix: rebuild `useApi` on top of `useSharedJson` and delete `usePolledJson`.

**H2 · Endpoint URLs retyped with different poll intervals. Drift: yes. Priority M**
- `/api/routines` at:
  - `CenterOrbitalCore.tsx:38`
  - `RoutinesWidget.tsx:97` (60 s)
  - `mobile/home/SecondBrainCard.tsx:57` (5 min)
  - `mobile/home/data.ts:25` (60 s)
  - `RoutinesAnalyticsView.tsx:86` (60 s)
- `/api/skills-real` ×5 (polling interval `null` or 5 min).
- `/api/vaults` ×5 inside home (`CenterOrbitalCore.tsx:35`, `MicroAppsWidget.tsx:23`, `SecondBrainCard.tsx:55`, `MobileMenu.tsx:28`, `graph-data.ts:91`).
- Fix: a `home/endpoints.ts` with typed hooks (`useRoutines()`, …) that own the URL and the interval.

**H3 · Frontmatter parsers ×3. Drift: yes. Priority M**
- `lib/server/vaults.ts:158`: returns `{fm, body}` as raw text.
- `lib/server/sources/skills.ts:12`: LF only, case-sensitive keys, no digits in keys.
- `app/api/workspace/frontmatter.ts:2`: handles CRLF, lower-cases keys, allows digits in keys.
- Fix: one `parseFrontmatter(src) → {data, body}` in `vaults.ts`.

**H4 · `readJson` (read and `JSON.parse`, null on error) ×2. Drift: no. Priority L**
- `lib/server/sources/mcp.ts:65` and `lib/server/sources/plugins.ts:22`.
- Fix: one export.

**H5 · Obsidian URL builder ×2. Drift: no. Priority L**
- `lib/server/vaults.ts:127` `obsidianUrl` and `components/second-brain/graph-model.ts:87` `obsidianUrlFor`.
- Fix: a client-safe `obsidianUrl` in `lib/`.

**H6 · `useNow` ×2 with the same name and different behaviour. Drift: yes. Priority M**
- `components/second-brain/analytics-shared.tsx:113` returns epoch `number`, ticks on an interval and pauses while the tab is hidden.
- `components/dashboard/widgets/hooks.ts:10` returns a `Date`, is aligned to the second, never pauses and defaults to 1 s.
- Fix: one hook with `{align, pauseHidden}`, or rename one of them.

**H7 · Relative-time formatters ×4. Drift: yes. Priority L**
- `lib/server/sources/index.ts:24` `ago`: no NaN guard, no months.
- `second-brain/analytics-shared.tsx:131` `relTime`: handles the future ("in 23m").
- `second-brain/graph-model.ts:254` `relTime`.
- `dashboard/orbital/artifact-meta.ts:82` `relTime`: months after 60 days.
- Fix: one `lib/format.relTime`.

**H8 · Markdown renderers ×2 inside home. Drift: likely (not diffed). Priority L**
- `components/second-brain/MarkdownView.tsx` (504 lines) and `components/dashboard/widgets/MiniMarkdown.tsx` (257 lines).
- Fix: have `MiniMarkdown` reuse `MarkdownView` in a compact variant (confidence: medium).

---

## 6. tasks (3)

**T1 · `/api/actions` polled by three independent paths. Drift: yes. Priority M**
- `components/tasks/TasksApp.tsx:84-98`: its own 60 s interval with visibility catch-up and the full payload.
- `components/dashboard/widgets/AwaitingBadge.tsx:21-33`: its own 60 s interval, `?counts=1`, no catch-up.
- `components/mobile/home/AwaitingCard.tsx:19` and `components/dashboard/widgets/needs-you.ts:17`: `useSharedJson` with the full payload.
- The consumers live in the home UI; the endpoint is tasks'.
- Fix: a `useActions()` hook on `useSharedJson` that the badge derives its counts from.

**T2 · Status-carrying error class ×2 plus hand-written mapping and `noStore` ×2. Drift: no. Priority L**
- Error classes: `lib/server/sources/actions-write.ts:28` `ActionWriteError` and `lib/server/sources/actions.ts:238` `NoteError`.
- Mapping by hand: `app/api/actions/route.ts:50-54` and `app/api/actions/note/route.ts:18-21`.
- `noStore`: `actions/route.ts:15` and `actions/note/route.ts:11`.
- Fix: one `TaskError`, and both routes on a shared wrapper.

**T3 · iCloud-eviction check applied inconsistently. Drift: yes. Priority M**
- The wiki note read checks `isEvicted(st)` (`actions.ts:264`).
- The `actions.md` read (`actions.ts:178-188`) and write (`actions-write.ts:43-46`) do not, so an evicted file blocks on `readFile`.
- Fix: one `readLocalOrThrow(file)` used by all three.

---

## 7. systems (2)

**Sy1 · Child-process wrapper ×2. Drift: yes. Priority M**
- `lib/server/systems/run.ts:42-56` `run()`:
  - sets `LC_ALL=C`
  - maps ENOENT to "not found" and a kill to "timed out"
  - takes the first stderr line, redacted
- `lib/server/systems/fix.ts:51-55` calls `execFile` directly:
  - no `LC_ALL`
  - no ENOENT text
  - a non-zero exit gives `error: null`
- Fix: `fix.ts` calls `run()`, extended with `cwd` and shell options.

**Sy2 · Core health endpoints written twice. Drift: no. Priority L**
- Probe URLs at `systems/index.ts:36-39`.
- The same port and path pairs as display endpoints at `systems/services.ts:254,280,313` (and Honcho at `:376`).
- Fix: a `SERVICES` table `{id, port, path}` that drives both the probe and the label.

---

## 8. launchpad (2)

**L1 · `LOOPBACK` host set ×2. Drift: yes (benign today). Priority L**
- `lib/server/launchpad/tailscale.ts:11` includes `'::1'`; `lib/server/launchpad/services.ts:61` does not.
- `URL.hostname` yields `[::1]`, so this does not bite yet.
- Fix: a single module constant.

**L2 · Stripping credentials from URLs ×2. Drift: minor. Priority L**
- `lib/server/launchpad/repos.ts:73` `sanitizeRemote` (removes userinfo, query and fragment).
- `lib/server/launchpad/tailscale.ts:59-62` (rebuilds from protocol, host and path).
- Fix: one `safeUrlDisplay()` in `launchpad/safe.ts`, next to `safeHttpUrl`.

---

## 9. feeds (1)

**F1 · Markdown-to-plain-text stripping ×2. Drift: yes. Priority L**
- `lib/server/feeds/util.ts:23` `titleFrom` strips `[x](url)` links, `**`, `__` and `` ` ``.
- `util.ts:36` `excerptOf` strips only `#*`>|`, so link syntax survives into list excerpts.
- `files.ts:44` strips HTML comments inline as well.
- Fix: one `stripMd()` in `util.ts`, with `titleFrom` and `excerptOf` built on it.

---

## 10. podcast (3)

**P1 · Retry and backoff loops ×2. Drift: yes. Priority M**
- `lib/server/podcast/tts.ts:143-180`: 4 attempts, honours `429` and `retry-after`, separate backoffs for network, 5xx and 429.
- `lib/server/podcast/gather.ts:111-119`: 3 attempts, retries every error including 4xx, with a fixed 3.5 s × n wait.
- Fix: `withRetry(fn, {attempts, backoff, retryOn})` in `podcast/util.ts`.

**P2 · Atomic write ×2. Drift: minor. Priority L**
- `lib/server/podcast/storage.ts:59` `writeFileAtomic`: async, random tmp name, no cleanup.
- `lib/server/podcast/config.ts:66-68`: sync `renameSync`, pid tmp name.
- Fix: `config.ts` uses `writeFileAtomic`, or a sync twin of it.

**P3 · XML/HTML escaping ×2. Drift: yes (minor). Priority L**
- `lib/server/podcast/notes.ts:62` `esc` does not escape `'`.
- `lib/server/podcast/util.ts:139` `escXml` does.
- Fix: `notes.ts` imports `escXml`.

---

## 11. notion-content (5)

**N1 · `copyText` with an `execCommand` fallback ×2. Drift: no (verbatim). Priority L**
- `components/media/ui.tsx:27` and `components/recos/RecosApp.tsx:30`.
- Fix: Recos imports it (or both use the elements-kit `clipboard.ts`).

**N2 · Three toast stacks across the three apps. Drift: yes. Priority M**
- Scripts uses `elements/kit/toast` (`ScriptsApp.tsx:7`).
- Carousels uses `components/media/ui.tsx:103-115` (bottom-right, tones `ok|error`, 4.2 s).
- Recos uses `components/recos/Toasts.tsx:16` (bottom-centre, tones `success|info|error`, an undo action, `aria-live`).
- Fix: all three on the elements-kit toast, with the undo action added there.

**N3 · Raw client fetch of a Notion-backed list ×2. Drift: yes. Priority M**
- `components/media/CarouselsApp.tsx:127-136` and `components/recos/RecosApp.tsx:72-83` share the same `?refresh=1` and `{error}` shape.
- Carousels shows the `notConfigured` message; Recos drops the flag and shows a generic error.
- Scripts uses `components/notion/useRemote.ts`.
- Fix: Carousels and Recos use `useRemote`.

**N4 · Notion route error mapping ×2. Drift: yes. Priority M**
- `app/api/carousels/route.ts:20-22` checks `NotionError.not_configured` by hand, then falls to studio's `fail`.
- Recos and the catalog use `notionJson` (`lib/server/notion/route.ts:22-39`), which also maps `noAccess` (404 plus a hint) and 429 vs 502.
- Carousels loses those mappings.
- Fix: a `notionJson` variant for carousels (it adds `readState`), or teach `fail` about `NotionError`.

**N5 · Editor hand-off item builders ×2. Drift: minor. Priority L**
- `components/scripts/script-model.ts:202-216` (cue `atSec` rounded to 0.1 s, one item per chapter).
- `components/media/CarouselsApp.tsx:354-363` (`atSec` rounded to whole seconds, built inline).
- Fix: a shared `makeAnimationHandoff({id,title,cues,notion})` builder.

---

## 12. music (3)

**Mu1 · Windsor mount detection ×2 plus mount constants ×3. Drift: no. Priority M**
- `windsorMounted()` is identical at `lib/server/music/suno.ts:52-59` and `lib/server/music/meta.ts:22-29`.
- `MOUNT = '/Volumes/Windsor'` at `suno.ts:24` and `meta.ts:12`, plus the literal at `config.ts:74`.
- Fix: export it from `meta.ts`, or better, use the platform helper.

**Mu2 · JSON-body route wrappers ×2. Drift: yes (minor). Priority M**
- `lib/server/music/http.ts:7-27` `musicPut` (default cap 256 KB).
- `lib/server/music/suno.ts:432-452` `sunoPost` (default cap 64 KB). Otherwise the two are the same apart from the verb.
- `sunoGet` (`suno.ts:419`) lives in the domain module instead of `http.ts`.
- Fix: `musicMutation(verb, run, {maxBytes})` and `musicGet` in `http.ts`.

**Mu3 · tmp+rename JSON writes ×2. Drift: minor (sync vs async). Priority L**
- `lib/server/music/config.ts:88-90` (sync).
- `lib/server/music/meta.ts:149-151` (async).
- Neither cleans up its tmp file on failure.
- Fix: one `writeJsonAtomic`.

---

## 13. generations (5)

**G1 · Provider polling loops ×3 with `sleep` ×2. Drift: yes. Priority M**
- `lib/server/media/jobs.ts:158-172` (single run): throws on the first failed or errored clip, which aborts the whole job.
- `jobs.ts:226-253` (shots): catches each failure per item and keeps polling the rest.
- `lib/server/media/gemini.ts:118-124` (file activation loop).
- `sleep` is defined at both `jobs.ts:19` and `gemini.ts:17`.
- Fix: `pollUntil(fn, {intervalMs, maxMs})` in a media `util.ts`, with one failure policy per caller.

**G2 · Provider fetch and error wrappers ×3. Drift: yes. Priority M**
- `xai`/`xaiJson`: `lib/server/media/xai.ts:12-35`.
- `eleven`/`failFrom`: `lib/server/media/elevenlabs.ts:7-30`.
- `gemini`/`geminiJson`: `lib/server/media/gemini.ts:40-60`.
- All three do the key check (412), `AbortSignal.timeout`, `no-store` and detail extraction.
- ElevenLabs maps a 403 to 422; xAI and Gemini map it to 502.
- Fix: `providerFetch({base, authHeader, keyFn, label, detailOf})`.

**G3 · Path containment (`realpath` + `startsWith(root+sep)`) ×3 inline. Drift: no. Priority M**
- `lib/server/media/storage.ts:110-114`, `lib/server/media/export.ts:52-58` and `export.ts:110-111`.
- Fix: one `insideRoot(file, root)` (studio already exports `isInside`; within this feature, add a local helper).

**G4 · "Open in Finder" via `execFile('/usr/bin/open')` ×2. Drift: no. Priority L**
- `app/api/media/reveal/route.ts:17` and `app/api/media/export/route.ts:21`.
- Fix: `openInFinder(path, {reveal})` in `lib/server/media`.

**G5 · Guard plus JSON parse hand-rolled in each media POST route. Drift: yes. Priority M**
- `reveal/route.ts:13-14` turns invalid JSON into `null`, which surfaces as a bad id.
- `export/route.ts:15-16` returns `400 Invalid JSON`.
- The same pattern is in `quote/route.ts`, `generate/route.ts` and `promote/route.ts`, per the Phase 1 map. Those three were not re-read.
- Fix: a `mediaPost(run)` wrapper like `studioPost`.

---

## 14. studio (1)

**St1 · "iCloud placeholder" user message hand-written ×4. Drift: yes. Priority L**
- These three say "Open … in Finder, or run brctl download":
  - `lib/server/studio/config.ts:260`
  - `lib/server/studio/runner.ts:286`
  - `runner.ts:510`
- `lib/server/studio/index-projects.ts:404` drops the brctl hint, although the comment at `:352` says the hint is there.
- Studio also mixes `isDataless` (`config.ts:245`, the sync alias) with `isEvicted(st)` (`index-projects.ts:162,326`).
- Fix: `placeholderError(name, where)` in `studio/storage.ts`.

---

## 15. platform (4)

**Pl1 · TTL cache with in-flight dedupe ×2. Drift: yes. Priority M**
- `lib/server/sources/cache.ts:45` `cached()`: stale-while-revalidate, failure `retryAt`, `force`.
- `lib/server/jev/cache.ts:4-40`: hard 6 h TTL, LRU of 500, its own in-flight map.
- Fix: give `cached()` an optional LRU cap and build the JEV cache on it.

**Pl2 · "Never create the Windsor mount point" guard ×2. Drift: yes. Priority M**
- `lib/server/llm/usage-log.ts:47-49` checks the grandparent of the leaf, and only for paths under `WINDSOR_VOLTA`.
- `lib/server/jev/telemetry.ts:93-96` checks the leaf's parent for any path.
- Both rely on `existsSync`, which is weaker than the `dev` compare used elsewhere.
- Fix: a platform `ensureLeafDirOnVolume(dir)` built on a real mount check.

**Pl3 · Toast systems ×2. Drift: n/a (one is dead). Priority L**
- `components/robo-ui/Toast.tsx` (re-exported at `robo-ui/index.ts:6`) has no importers outside `robo-ui`.
- `components/elements/kit/toast.tsx:16` is the one in use.
- Fix: delete the robo-ui toast, or make it the kit's implementation.

**Pl4 · Loopback host set copied between client and server. Drift: no. Priority L**
- `lib/remote-client.ts:7` and `lib/server/local-only.ts:4`.
- Fix: one client-safe `lib/loopback.ts`.

---

## Dropped / out of scope (cross-feature or not confirmed)

- **Cross-feature, left to the other agent:**
  - `post`/`postFix` and `onCopy`/`copy` (tasks `TasksApp.tsx` ↔ systems `SystemsApp.tsx`).
  - Honcho totals counted twice (home `sources/index.ts:44` ↔ memory `honcho.ts:428`).
  - Two transcript scanners (home `sources/transcripts.ts` ↔ memory `sources/sessions.ts`).
  - `notion-links.json` parsed twice (notion-content `notion/links.ts:9` ↔ launchpad `launchpad/notion.ts:57`).
  - SunoPanel client poll ↔ media server polls (music ↔ generations).
  - `brctlCommand` (music client ↔ editor server).
  - Studio ↔ editor o_/g_/m_ aggregation.
  - Range-file routes.
  - Windsor checks across features.
  - `claude-mem` `getJson` ↔ `memFetch` (home ↔ memory).
- **feeds double JEV cache and batching** (`feeds/store.ts:104`, `feeds/triage.ts:15` ↔ `jev/cache.ts`, `jev/client.ts:233`): this is feeds layered over platform, not a copy inside feeds. `triage.json` is the persistent label store (versioned, pruned), not a second TTL cache, and the 32×8 batching only sets how much work runs per trigger. **Not worth consolidating.**
- **Agent-prompt builders in notion-content** (`CarouselsApp.tsx:69`, `recos-lib.ts:85`): the content is specific to each domain and only the "lines.join" style is shared. Dropped.
- **Editor `rubric:editor-inbox` raw string** (`EditorApp.tsx:406` vs `EDITOR_INBOX_KEY` `lib/editor-inbox.ts:6`): a one-liner with no drift. Dropped as trivial (a 1-minute fix).
- **Editor server in-flight dedupe** (`nle/thumbs.ts:13`, `nle/peaks.ts:16`): both already share `limiter` from `nle/paths.ts:107`. What remains is a 4-line map. Dropped.

## Sources consulted
- `PATHFINDER-2026-10-28/00-features.md`, and all 15 `01-flowcharts/*.md` ("Repeated concerns" sections).
- Direct reads (`sed -n` / `grep -n`):
  - **editor**: `components/editor/{EditorApp.tsx,nle/NleWorkspace.tsx,nle/panels/thumbs.ts,nle/timeline/media.ts}`, `lib/server/editor/{feedback,media}.ts`, `lib/server/editor/nle/{assets,upload,paths,http,thumbs,peaks,text,export}.ts`, `app/api/editor/apply-feedback/route.ts`, `lib/editor-inbox.ts`.
  - **research**: `lib/server/research/{doc,search,library,threads,inventory,stagea,vault,status}.ts`, `app/api/research/*/route.ts`, `components/research/{LibraryView,ThreadsView,DocPanel,research-client}.ts*`.
  - **search**: `lib/server/search/{index,sources,notes-index}.ts`, `components/search/search-client.ts`, `lib/server/ltm.ts:165-215`.
  - **memory**: `app/api/{honcho,claude-sessions,ltm}/_shared.ts`, `lib/server/honcho.ts:95-180`, `app/api/honcho/workspaces/[workspace]/chat/route.ts`, `components/{honcho/AskPanel,honcho/honcho-client,ltm/ltm-client,ltm/LtmApp,sessions/SessionsApp,sessions/sessions-client,honcho/HonchoApp}`, `lib/server/sources/sessions.ts:88-101,1067`.
  - **home**: `components/dashboard/{CenterOrbitalCore,widgets/left-sources,widgets/hooks,widgets/right-hooks,orbital/artifact-meta}`, `components/second-brain/{ApplicationsView,analytics-shared,graph-model}`, `lib/server/{vaults,sources/skills,sources/mcp,sources/plugins,sources/index}.ts`, `app/api/workspace/frontmatter.ts`.
  - **tasks**: `components/tasks/TasksApp.tsx`, `components/dashboard/widgets/{AwaitingBadge,needs-you}`, `components/mobile/home/AwaitingCard.tsx`, `lib/server/sources/{actions,actions-write}.ts`, `app/api/actions/{route,note/route}.ts`.
  - **systems**: `lib/server/systems/{run,fix,index,services}.ts`.
  - **launchpad**: `lib/server/launchpad/{tailscale,services,repos}.ts`.
  - **feeds**: `lib/server/feeds/{util,files,store,triage}.ts`, `lib/server/jev/{cache,client}.ts`.
  - **podcast**: `lib/server/podcast/{tts,gather,storage,config,notes,util}.ts`.
  - **notion-content**: `components/{media/ui,media/CarouselsApp,recos/RecosApp,recos/Toasts,recos/recos-lib,scripts/script-model,scripts/ScriptsApp}`, `app/api/{carousels,recos}/route.ts`, `lib/server/notion/{links,route}.ts`.
  - **music**: `lib/server/music/{suno,meta,config,http}.ts`, `components/music/SunoPanel.tsx`.
  - **generations**: `lib/server/media/{jobs,gemini,xai,elevenlabs,storage,export}.ts`, `app/api/media/{reveal,export}/route.ts`.
  - **studio**: `lib/server/studio/{config,runner,index-projects}.ts`, `app/api/studio/outputs/route.ts`.
  - **platform**: `lib/server/{local-only,sources/cache,jev/cache,llm/usage-log,jev/telemetry}.ts`, `lib/remote-client.ts`, `components/robo-ui/{index,Toast}`.

## Confidence
- **High** for entries whose drift is stated in code terms: E1, E5–E7, E10, E11, R3, R4, R6, M1, M2, M4–M8, H1, H3, H6, H7, T1, T3, Sy1, P1, N2–N4, Mu2, G1, G2, St1, Pl1, Pl2. Both sides were read side by side.
- **Medium**:
  - H8: the two markdown renderers were not diffed.
  - G5: only reveal and export were re-read; quote, generate and promote rely on the Phase 1 map.
  - T1: the consumers sit in home UI, so whether this counts as inside tasks is a boundary call.
  - S2: needs a memory-side change.
- **Not covered**: studio (beyond the files listed) and launchpad client components were not scanned exhaustively. Studio may hold more small duplicates inside `runner.ts` and `index-projects.ts`.
