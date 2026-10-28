# 01 — Flowchart: memory (LTM · Honcho · Claude Code Sessions)

## 1. Purpose
Three read-only viewers over personal memory stores: **LTM** (unvolta screen captures in a SQLite DB on the Windsor drive + Pieces-Vault session notes), **Honcho** (self-hosted Plastic Labs memory server proxied over HTTP, incl. streamed dialectic chat), and **Sessions** (an in-process index of Claude Code `~/.claude/projects/**/*.jsonl` transcripts, linked to claude-mem).

### Sources consulted (all paths under `src/`)
- `lib/server/ltm.ts:1-321` (full), `lib/server/honcho.ts:1-260, 395-490` (+ grep of exports), `lib/server/sources/sessions.ts:1-128, 155-176, 560-566, 620-760, 1012-1125, 1395-1516` (+ grep)
- `app/api/ltm/_shared.ts:1-19`, `app/api/honcho/_shared.ts:1-152`, `app/api/claude-sessions/_shared.ts:1-51` (full)
- `app/api/ltm/{status,days,today,captures,captures/[id],frame/[id],sessions,activity}/route.ts` (full)
- `app/api/honcho/{status,workspaces,workspaces/[workspace]/chat,…/sessions/[session]/messages}/route.ts` (full), `…/stats/route.ts`, `…/peers`, `…/queue`, `…/messages/[message]` (grep)
- `app/api/claude-sessions/{route,[id]/route,[id]/transcript/route,[id]/memory/route}.ts` (full)
- `components/ltm/LtmApp.tsx:1-135, 175-320`, `ltm-client.ts` + `useVisiblePoll.ts:1-20` (grep/read), `CaptureInspector.tsx` (grep)
- `components/honcho/HonchoApp.tsx:50-135, 195-300`, `AskPanel.tsx:15-60, 120-140`, `honcho-client.ts:1-45`, `useHoncho.ts` (grep)
- `components/sessions/SessionsApp.tsx:55-130` (+ grep), `sessions-client.ts`, `SessionDetail.tsx`, `TranscriptView.tsx` (grep)
- `lib/server/vaults.ts:158-213`, `lib/server/local-only.ts:25-80`, `lib/server/redact.ts` + `lib/server/search/redact.ts` (grep), `app/apps/{ltm,honcho,sessions}/page.tsx` (grep)

## 2. Primary happy paths

### Chart A — LTM viewer (`/apps/ltm`)
```mermaid
flowchart TD
  L1["/apps/ltm page<br/>src/app/apps/ltm/page.tsx:10"] --> L2["LtmApp<br/>src/components/ltm/LtmApp.tsx:42"]
  L2 --> L3["useVisiblePoll overview every 60s<br/>src/components/ltm/LtmApp.tsx:97"]
  L3 --> L4["loadOverview: getJson status then days<br/>src/components/ltm/LtmApp.tsx:87"]
  L4 -->|"HTTP GET"| L5["GET /api/ltm/status rejectNonLocalRead<br/>src/app/api/ltm/status/route.ts:9"]
  L5 --> L6["getStatus COUNT/MIN/MAX + prunedCounts<br/>src/lib/server/ltm.ts:106"]
  L6 --> L7[("openDb node:sqlite readOnly, TEMP VIEW hides HIDDEN_APPS<br/>src/lib/server/ltm.ts:28")]
  L4 -->|"HTTP GET"| L8["GET /api/ltm/days -> getDays<br/>src/app/api/ltm/days/route.ts:9"]
  L8 --> L7
  L2 --> L9["getJson /api/vaults (DayRail links)<br/>src/components/ltm/LtmApp.tsx:100"]
  L2 --> L10["read deep link ?date ?capture ?q<br/>src/components/ltm/LtmApp.tsx:106"]
  L10 --> L11["load day: captures?date&limit=5000 + sessions<br/>src/components/ltm/LtmApp.tsx:179"]
  L11 -->|"HTTP GET"| L12["GET /api/ltm/captures validate -> listCaptures<br/>src/app/api/ltm/captures/route.ts:10"]
  L12 --> L13["listCaptures dynamic WHERE + LIKE ESCAPE<br/>src/lib/server/ltm.ts:165"]
  L13 --> L14["toSummary redactSecrets + makeSnippet<br/>src/lib/server/ltm.ts:84"]
  L11 -->|"HTTP GET"| L15["GET /api/ltm/sessions -> listSessionNotes<br/>src/app/api/ltm/sessions/route.ts:11"]
  L15 --> L16[/"Pieces-Vault ltm/YYYY-MM readdir + readFile + parseFrontmatter<br/>src/lib/server/vaults.ts:181"/]
  L2 --> L17["search box debounce 250ms -> runSearch<br/>src/components/ltm/LtmApp.tsx:215"]
  L17 --> L12
  L2 --> L18["selected capture getJson /api/ltm/captures/id<br/>src/components/ltm/LtmApp.tsx:313"]
  L18 -->|"HTTP GET"| L19["GET captures/[id] -> getCapture (redacted content, prev/next)<br/>src/lib/server/ltm.ts:204"]
  L19 --> L20["CaptureInspector<br/>src/components/ltm/CaptureInspector.tsx:25"]
  L20 -->|"img src"| L21["GET /api/ltm/frame/[id]<br/>src/app/api/ltm/frame/[id]/route.ts:14"]
  L21 --> L22[/"resolveFrame path guard + ext check, fs.readFile frame<br/>src/lib/server/ltm.ts:224"/]

  L7 -.->|"drive unmounted / busy (errcode 5)"| E1["LtmUnavailableError<br/>src/lib/server/ltm.ts:63"]
  E1 -.-> E2["ltmError 503 unavailable<br/>src/app/api/ltm/_shared.ts:5"]
  L11 -.->|"fetch error"| E3["toast<br/>src/components/ltm/LtmApp.tsx:197"]
```
Node count: 25 (22 happy path + 3 error).

### Chart B — Honcho (`/apps/honcho`)
```mermaid
flowchart TD
  H1["/apps/honcho page<br/>src/app/apps/honcho/page.tsx:10"] --> H2["HonchoApp<br/>src/components/honcho/HonchoApp.tsx:61"]
  H2 --> H3["probe(): status then workspaces<br/>src/components/honcho/HonchoApp.tsx:105"]
  H3 --> H4["hGet fetch no-store + parse<br/>src/components/honcho/honcho-client.ts:28"]
  H4 -->|"HTTP GET"| H5["GET /api/honcho/status<br/>src/app/api/honcho/status/route.ts:9"]
  H5 --> H6["handle(): rejectNonLocal + local rejectCrossSite<br/>src/app/api/honcho/_shared.ts:140"]
  H6 --> H7["health() -> request GET /health<br/>src/lib/server/honcho.ts:208"]
  H7 --> H8["request(): fetch with AbortSignal.timeout 4s<br/>src/lib/server/honcho.ts:95"]
  H4 -->|"HTTP GET"| H9["GET /api/honcho/workspaces -> listWorkspaces POST /v3/workspaces/list<br/>src/app/api/honcho/workspaces/route.ts:7"]
  H9 --> H8
  H8 --> H10["json(): redactDeep every string except ids<br/>src/app/api/honcho/_shared.ts:44"]
  H2 --> H11["pick workspace (URL ?w or first)<br/>src/components/honcho/HonchoApp.tsx:217"]
  H11 --> H12["peers: client page loop up to 500<br/>src/components/honcho/HonchoApp.tsx:225"]
  H11 --> H13["stats: hGet /stats<br/>src/components/honcho/HonchoApp.tsx:260"]
  H13 --> H14["workspaceStats globalThis cache 10m, fresh at most 1/min<br/>src/lib/server/honcho.ts:475"]
  H14 --> H15["computeStats: pool fan-out ~150-200 size=1 calls<br/>src/lib/server/honcho.ts:428"]
  H11 --> H16["useVisiblePoll queue + status every 60s<br/>src/components/honcho/HonchoApp.tsx:288"]
  H2 --> H17["AskPanel streamAnswer POST chat stream:true<br/>src/components/honcho/AskPanel.tsx:21"]
  H17 -->|"HTTP POST"| H18["chat route: readBody JSON-only, idOf/textOf validation<br/>src/app/api/honcho/workspaces/[workspace]/chat/route.ts:130"]
  H18 --> H19["workspaceChatStream / peerChatStream -> openStream 180s<br/>src/lib/server/honcho.ts:144"]
  H19 --> H20["relayStream: parse upstream SSE, makeRedactor per chunk<br/>src/app/api/honcho/workspaces/[workspace]/chat/route.ts:52"]
  H20 --> H21["client SSE parse, onDelta appends answer<br/>src/components/honcho/AskPanel.tsx:43"]

  H8 -.->|"ECONNREFUSED / timeout"| E4["HonchoOfflineError -> honchoError 503<br/>src/app/api/honcho/_shared.ts:101"]
  E4 -.-> E5["reportOffline + 15s retry countdown<br/>src/components/honcho/HonchoApp.tsx:202"]
  H17 -.->|"broken stream"| E6["fallback hPost non-stream workspaceChat<br/>src/components/honcho/AskPanel.tsx:133"]
```
Node count: 24 (21 happy path + 3 error/fallback).

### Chart C — Claude Code Sessions (`/apps/sessions`)
```mermaid
flowchart TD
  S1["/apps/sessions page<br/>src/app/apps/sessions/page.tsx:10"] --> S2["SessionsApp<br/>src/components/sessions/SessionsApp.tsx:33"]
  S2 --> S3["read ?session ?project, 30s clock<br/>src/components/sessions/SessionsApp.tsx:57"]
  S2 --> S4["useSharedJson list poll (3s while scanning, else 60s)<br/>src/components/sessions/SessionsApp.tsx:85"]
  S4 -->|"HTTP GET"| S5["GET /api/claude-sessions privateRoute + param validation<br/>src/app/api/claude-sessions/route.ts:14"]
  S5 --> S6["rejectNonLocalRead<br/>src/app/api/claude-sessions/_shared.ts:36"]
  S6 --> S7["listSessions<br/>src/lib/server/sources/sessions.ts:1034"]
  S7 --> S8["ensureFresh: background pass every 30s, first call waits 1.5s<br/>src/lib/server/sources/sessions.ts:716"]
  S8 --> S9["runPass<br/>src/lib/server/sources/sessions.ts:665"]
  S9 --> S10[/"listFiles readdir ~/.claude/projects tree<br/>src/lib/server/sources/sessions.ts:155"/]
  S9 --> S11[/"statAll batches of 64<br/>src/lib/server/sources/sessions.ts:650"/]
  S9 --> S12[/"scanFile -> readLines createReadStream (incremental)<br/>src/lib/server/sources/sessions.ts:602"/]
  S12 --> S13["index state on globalThis __voltaSessionsV2<br/>src/lib/server/sources/sessions.ts:628"]
  S7 --> S14["aggregate + filter/sort/page<br/>src/lib/server/sources/sessions.ts:1012"]
  S14 --> S15["maskDeep -> maskSecrets -> redactSecrets<br/>src/lib/server/sources/sessions.ts:91"]
  S2 -->|"select"| S16["getJson /api/claude-sessions/id<br/>src/components/sessions/SessionsApp.tsx:151"]
  S16 --> S17["sessionRoute SESSION_ID_RE -> getSessionDetail<br/>src/app/api/claude-sessions/_shared.ts:43"]
  S17 --> S18["getSessionDetail per-model token split<br/>src/lib/server/sources/sessions.ts:1106"]
  S2 --> S19["TranscriptView getJson transcript page<br/>src/components/sessions/TranscriptView.tsx:231"]
  S19 --> S20[/"getTranscriptPage -> loadTranscript LRU 3, resumes at byte offset<br/>src/lib/server/sources/sessions.ts:1427"/]
  S2 --> S21["SessionDetail getJson memory<br/>src/components/sessions/SessionDetail.tsx:80"]
  S21 --> S22["getSessionMemory LRU 24, TTL 60s<br/>src/lib/server/sources/sessions.ts:1474"]
  S22 --> S23["memFetch claude-mem :37777 observations + summaries (4s)<br/>src/lib/server/sources/sessions.ts:1468"]

  S9 -.->|"pass error"| E7["progress.state=error, logged<br/>src/lib/server/sources/sessions.ts:704"]
  S17 -.->|"null / BadRequest"| E8["respond 404 / 400 / 500<br/>src/app/api/claude-sessions/_shared.ts:21"]
  S22 -.->|"worker down"| E9["online:false payload (cached)<br/>src/lib/server/sources/sessions.ts:1510"]
```
Node count: 26 (23 happy path + 3 error).

## 3. Side effects
- SQLite: read-only `DatabaseSync(LTM_DB_PATH, {readOnly, timeout:2000})` `src/lib/server/ltm.ts:39`; `CREATE TEMP VIEW memory` `:43`; handle on `globalThis.__ltmDbFiltered` `:44`, closed/reset on unmount `:58-62`; queries `:111`, `:122-133`, `:191-199`, `:206-211`, `:225`
- File reads: LTM frames `src/app/api/ltm/frame/[id]/route.ts:22` (after `fs.existsSync` `src/lib/server/ltm.ts:231`); Pieces-Vault session notes `src/lib/server/vaults.ts:185`, `:193`; transcripts `src/lib/server/sources/sessions.ts:565` (stream), `.meta.json` `:590`, stats `:654`, `:1079`, `:1401`; dir walks `:131`
- HTTP: Honcho `fetch` `src/lib/server/honcho.ts:101` (JSON) and `:149` (SSE); claude-mem `src/lib/server/sources/sessions.ts:1469`
- Streaming response: SSE relay `src/app/api/honcho/workspaces/[workspace]/chat/route.ts:120`
- In-process caches: Honcho stats `globalThis.__honchoStats` `src/lib/server/honcho.ts:406`; sessions index/transcript LRU/memory LRU `src/lib/server/sources/sessions.ts:628`, `:1423`, `:1514`; LTM DB handle `ltm.ts:44`
- Client: `useVisiblePoll` timers + `visibilitychange` `src/components/ltm/useVisiblePoll.ts:48`; Honcho offline `setInterval` `src/components/honcho/HonchoApp.tsx:204`; `history` URL rewrite `HonchoApp.tsx:291`; Sessions clock `setInterval` `src/components/sessions/SessionsApp.tsx:66`
- No writes to disk anywhere in this feature (all three stores are read-only by design: `ltm.ts:8`, `honcho.ts:20-21`).

## 4. External dependencies
- **platform**: `rejectNonLocalRead` `src/lib/server/local-only.ts:62` (ltm routes e.g. `app/api/ltm/captures/route.ts:3`, `app/api/claude-sessions/_shared.ts:3`); `rejectNonLocal` `app/api/honcho/_shared.ts:3`; `localJson` `src/lib/server/route-helpers.ts:7` (`app/api/ltm/today/route.ts:1`, `activity/route.ts:1`); `redactSecrets`/`maskToken` `src/lib/server/redact.ts:6` → `lib/server/search/redact.ts:258` (imported `ltm.ts:5`, `app/api/honcho/_shared.ts:4`); `useSharedJson` `src/components/sessions/SessionsApp.tsx:11`; `useToasts`/`AppTopBar`/`copyText` from `elements/kit` `src/components/ltm/LtmApp.tsx:18-20`
- **home**: `listSessionNotes`, `parseFrontmatter`, `ltmSourceRange` in `src/lib/server/vaults.ts:181` (`app/api/ltm/sessions/route.ts:3`); `/api/vaults` `src/components/ltm/LtmApp.tsx:100`; `CLAUDE_MEM_URL` from `./claude-mem` `src/lib/server/sources/sessions.ts:22`
- **Consumers of memory** (inbound): home `sources/index.ts:5-6`, `sources/notion.ts:5`; platform `route-helpers.ts:4` (`LtmUnavailableError`); systems `src/lib/server/systems/services.ts:8` (`HONCHO_START_COMMAND`, `HONCHO_URL`); client `ltm-client` reused by `components/sessions/sessions-client.ts:6`, `components/dashboard/widgets/right-hooks.ts:5`, `components/second-brain/graph-data.ts:7`; `useVisiblePoll` reused by `HonchoApp.tsx:29`

## 5. Repeated concerns noticed
- **Three route-helper modules for one guard+error pattern**: `app/api/ltm/_shared.ts:5` (`ltmError`), `app/api/honcho/_shared.ts:140` (`handle`/`honchoError` `:99`), `app/api/claude-sessions/_shared.ts:34` (`privateRoute`/`respond` `:21`), alongside `src/lib/server/route-helpers.ts:7` (`localJson`, which already maps `LtmUnavailableError` at `:14` — duplicated by `ltmError`). Most LTM routes hand-roll guard+try/catch instead of `localJson` (`captures/route.ts:10`, `days/route.ts:9`, `status/route.ts:9`, `frame/[id]/route.ts:14`, `captures/[id]/route.ts:9`).
- **`noStore` header constant x4**: `app/api/ltm/_shared.ts:19`, `app/api/honcho/_shared.ts:8`, `app/api/claude-sessions/_shared.ts:9`, `src/lib/server/editor/nle/http.ts:11` (+ inline `route-helpers.ts:12`, `app/api/vaults/route.ts:13`).
- **`BadRequest` class x3**: `app/api/honcho/_shared.ts:13`, `app/api/claude-sessions/_shared.ts:11`, `src/lib/server/notion/route.ts:19`.
- **Bounded int param parsers x3**: `intOf` `app/api/honcho/_shared.ts:64` ≡ `intParam` `app/api/claude-sessions/_shared.ts:14`; looser `intParam` `app/api/ltm/_shared.ts:13`.
- **Cross-site guard re-implemented**: `rejectCrossSite` `app/api/honcho/_shared.ts:122` vs `src/lib/server/local-only.ts:42` (semantics drift: the honcho copy refuses only `cross-site`/`same-site` and checks Origin host equality; local-only refuses everything except `same-origin`/`none` and also requires an allowed host). JSON-body check `readBody` `honcho/_shared.ts:89` vs `rejectNonLocalMutation` `local-only.ts:71`.
- **Deep redaction x2 + token masker x2**: `redactDeep` `app/api/honcho/_shared.ts:27` vs `maskDeep` `src/lib/server/sources/sessions.ts:91` (different id-key rules); `maskToken` `src/lib/server/sources/sessions.ts:63` duplicates `src/lib/server/search/redact.ts:87`; extra secret regexes `sessions.ts:67-71` live outside the shared redactor.
- **Redaction imported from an API route** (layering): `src/lib/server/sources/sessions.ts:6` imports `redactSecrets` from `@/app/api/honcho/_shared`.
- **SSE framing parsed twice**: server `relayStream` `app/api/honcho/workspaces/[workspace]/chat/route.ts:79` and client `streamAnswer` `src/components/honcho/AskPanel.tsx:43` (same `indexOf('\n\n')` loop).
- **HTTP-with-timeout + error classification**: Honcho `request` `src/lib/server/honcho.ts:95` and `openStream` `:144` duplicate the catch/offline/502 mapping (`:108-118` vs `:156-175`); claude-mem `memFetch` `src/lib/server/sources/sessions.ts:1468` ≡ `getJson` `src/lib/server/sources/claude-mem.ts:56`.
- **Bespoke TTL/LRU caches instead of `cached()`** (`src/lib/server/sources/cache.ts:45`): Honcho stats `src/lib/server/honcho.ts:475`, sessions memory LRU `sessions.ts:1474`, transcript LRU `sessions.ts:1400`.
- **Concurrency pool**: `pool` `src/lib/server/honcho.ts:408` ≡ `mapLimit` `src/lib/server/sources/notes.ts:84`.
- **Paginate-all loops**: server `allPages` `src/lib/server/honcho.ts:421` vs client peers loop `src/components/honcho/HonchoApp.tsx:230-234`.
- **Client fetch wrappers x3**: `getJson`/`ApiError` `src/components/ltm/ltm-client.ts:21`, `hGet`/`hPost`/`HonchoClientError` `src/components/honcho/honcho-client.ts:28`, plus private `getJson` `src/components/launchpad/LaunchpadApp.tsx:21`, `components/editor/nle/timeline/media.ts:53`. Abort detection x2: `isAbortError` `ltm-client.ts:14` vs `isAbort` `honcho-client.ts:19`.
- **Polling**: three mechanisms inside one feature — `useVisiblePoll` (`LtmApp.tsx:97`, `HonchoApp.tsx:288`), `useSharedJson` (`SessionsApp.tsx:85`), raw `setInterval` (`HonchoApp.tsx:204`, `SessionsApp.tsx:66`).
- **Search debounce 250ms copy-paste**: `src/components/ltm/LtmApp.tsx:207`, `src/components/sessions/SessionsApp.tsx:71`.
- **Deep-link read-once-after-mount pattern x3**: `LtmApp.tsx:106`, `HonchoApp.tsx:132`, `SessionsApp.tsx:57`; URL write-back `HonchoApp.tsx:291`, `SessionsApp.tsx:130`.
- **Highlight splitting x2**: `splitHighlight` `src/components/ltm/ltm-client.ts:102` ≡ `src/components/honcho/honcho-client.ts:104`.
- **Time formatting**: `agoLabel` `ltm-client.ts:94`, `ago` `src/components/sessions/sessions-client.ts:22`, `fmtDateTime/fmtTime` `honcho-client.ts:66-78` (plus the ago family listed in home.md).
- **Start command duplicated client/server**: `START_COMMAND` `src/components/honcho/honcho-client.ts:4` ≡ `HONCHO_START_COMMAND` `src/lib/server/honcho.ts:24`.
- **Transcript scanning duplicated**: `src/lib/server/sources/sessions.ts:36`/`:665`/`:602` vs `src/lib/server/sources/transcripts.ts:13`/`:152`/`:143` (both incremental byte-offset JSONL readers with mtime+size memo; automated-dir detection `sessions.ts:173-176` vs `transcripts.ts:71`).
- **ID regexes defined twice**: `SESSION_ID_RE` `src/lib/server/sources/sessions.ts:1067` re-typed inline in client `src/components/sessions/SessionsApp.tsx:61`; project regex `app/api/claude-sessions/route.ts:7` vs `SessionsApp.tsx:62`.
- **Rich text renderer**: `src/components/honcho/RichText.tsx` is a fourth markdown-ish renderer (see home.md).

## 6. Confidence + known gaps
- Confidence: **high** for LTM (server read in full) and Honcho proxy/chat; **medium** for Sessions — `sessions.ts` (1516 lines) read at the index, list, transcript and memory sections only; `scanFile`/`transcriptLine`/`summarize` internals not traced.
- Not charted: Honcho Peers/Sessions/Conclusions/Search tabs (same `handle`→`request`→`json` path, ~12 more routes), `useHonchoGet` `src/components/honcho/useHoncho.ts:16`, LTM `apps`/`today`/`activity` routes (consumed by home), DayTimeline/DayRail rendering.
- The cross-site semantics note in §5 comes from one read of each function; Phase 2 should diff them line by line before merging.
