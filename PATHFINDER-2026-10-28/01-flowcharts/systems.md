# 01 — Flowchart: systems

## Purpose
Live health of local services, model runtimes, storage and memory on the Mac. One cached probe cycle feeds the full report, a light badge summary, and a "Needs attention" list. Each attention item can be fixed in one click: either run its documented command, or open Claude Code with a prompt built server-side.

## Sources consulted
- `src/app/api/systems/route.ts:1-12`, `src/app/api/systems/ping/route.ts:1-7`, `src/app/api/systems/fix/route.ts:1-42` (all)
- `src/lib/server/systems/index.ts:1-172` (all)
- `src/lib/server/systems/fix.ts:1-106` (all)
- `src/lib/server/systems/run.ts:1-122` (all)
- `src/lib/server/systems/services.ts` (grep: 13-96, 100-187, 192-276, 311-372, 451-591), `host.ts` (grep: 12-187), `models.ts` (grep: 5-156), `storage.ts:36-187` (grep plus 140-187 read), `memory.ts:15-77` (grep), `honcho-deps.ts:1-78`
- `src/lib/server/claude-terminal.ts:1-42`
- `src/components/systems/SystemsApp.tsx:1-215` (1-110 read, plus render lines grepped), `AttentionStrip.tsx` (grep: 13-17, 51-99, 120-160), `SystemsBadge.tsx:3-15`
- `src/components/dashboard/widgets/shared-json.ts:190-205`, `src/lib/server/sources/cache.ts:40-66`, `src/lib/server/local-only.ts:29-79`, `src/lib/server/route-helpers.ts:1-21`
- Inbound: `src/lib/server/recos/index.ts:8,154`, `src/components/mobile/MobileTabBar.tsx:9-10,56`

## Flowchart

```mermaid
flowchart TD
  subgraph REPORT["Report path (poll 30 s, cache 15 s)"]
    S1["SystemsApp<br/>src/components/systems/SystemsApp.tsx:24"]
    S2["useSharedJson('/api/systems', 30 s)<br/>src/components/dashboard/widgets/shared-json.ts:198"]
    S3["GET = localJson: loopback + same-origin guard<br/>src/app/api/systems/route.ts:12"]
    S4["getSystemsReport<br/>src/lib/server/systems/index.ts:154"]
    S5["getCore: cached('systems:core', 15 s, maxStale 25 s)<br/>src/lib/server/systems/index.ts:151"]
    S6["loadCore phase 1: Promise.all of 17 probes<br/>src/lib/server/systems/index.ts:30"]
    S7["lsof listeners<br/>src/lib/server/systems/host.ts:23"]
    S8["launchctl list<br/>src/lib/server/systems/host.ts:95"]
    S9["plutil plists, cached 5 min<br/>src/lib/server/systems/host.ts:164"]
    S10["getMeta: read package.json files, cached 5 min<br/>src/lib/server/systems/services.ts:96"]
    S11["httpGet loopback 18789 / 20128 / 37777 / Honcho<br/>src/lib/server/systems/index.ts:36"]
    S12["self-probe /api/systems/ping<br/>src/app/api/systems/ping/route.ts:7"]
    S13["docker ps (honcho compose)<br/>src/lib/server/systems/services.ts:112"]
    S14["read ~/.hermes/gateway_state.json<br/>src/lib/server/systems/services.ts:152"]
    S15["probeOllama / probeLmStudio over HTTP<br/>src/lib/server/systems/models.ts:34"]
    S16["memory_pressure + sysctl + vm_stat<br/>src/lib/server/systems/memory.ts:22"]
    S17["df volumes<br/>src/lib/server/systems/storage.ts:44"]
    S18["read Honcho .env BASE_URL keys, cached 5 min<br/>src/lib/server/systems/honcho-deps.ts:50"]
    S19["phase 2: Hermes A2A port + ps for all pids<br/>src/lib/server/systems/index.ts:54"]
    S20["ltmStatus sync SQLite read<br/>src/lib/server/systems/index.ts:56"]
    S21["service builders (openclaw ... volta)<br/>src/lib/server/systems/index.ts:60"]
    S22["attentionFor: services, agents, volumes, memory<br/>src/lib/server/systems/index.ts:91"]
    S23["peekSizes: nice du, cached 10 min, 250 ms race<br/>src/lib/server/systems/storage.ts:176"]
    S24["render AttentionStrip + ServiceCards + panels<br/>src/components/systems/SystemsApp.tsx:183"]
    SB["SystemsBadge / MobileTabBar: getSystemsSummary (no sizes)<br/>src/lib/server/systems/index.ts:164"]
  end

  subgraph FIX["Fix path"]
    F1["Run / Fix with agent / Fix all buttons<br/>src/components/systems/AttentionStrip.tsx:87"]
    F2["postFix JSON to /api/systems/fix<br/>src/components/systems/SystemsApp.tsx:68"]
    F3["POST: rejectNonLocalMutation + ID_RE<br/>src/app/api/systems/fix/route.ts:18"]
    F4["pick: getSystemsReport(force) re-probe<br/>src/lib/server/systems/fix.ts:33"]
    F5["runFixCommand: zsh -lc item.command, 90 s<br/>src/lib/server/systems/fix.ts:51"]
    F6["clean: redact per line + tail 4 KB<br/>src/lib/server/systems/fix.ts:30"]
    F7["agentHandoff: buildPrompt + GUARDRAILS<br/>src/lib/server/systems/fix.ts:98"]
    F8["openClaudeInTerminal: prompt .md + osascript, cwd process.cwd()<br/>src/lib/server/claude-terminal.ts:30"]
    F9["outcome panel: output / prompt + Copy / Start on Mac<br/>src/components/systems/AttentionStrip.tsx:144"]
    FE["404 no longer in attention list<br/>src/lib/server/systems/fix.ts:36"]
  end

  S1 --> S2 --> S3 --> S4 --> S5 --> S6
  S6 --> S7 & S8 & S9 & S10 & S11 & S13 & S14 & S15 & S16 & S17 & S18
  S11 --> S12
  S11 -. timeout / refused becomes data, run.ts:101 .-> S21
  S7 --> S19
  S14 --> S19
  S19 --> S20 --> S21 --> S22
  S4 --> S23
  S22 --> S24
  S23 --> S24
  S5 --> SB
  S24 --> F1 --> F2 --> F3 --> F4 --> S5
  F4 -.-> FE
  F4 -- action:run --> F5 --> F6 --> F9
  F9 -- reload --> S2
  F4 -- action:agent --> F7
  F7 -- open=true --> F8 --> F9
  F7 -- open=false --> F9
```

Node count: 35 (report 25, fix 10). The report is one wide fan-out (S6 to S7–S18), so the probes are listed as nodes, not as a sequence.

## Side effects
- **Process spawns (read-only probes; each one goes through `run()`, which never throws, with LC_ALL=C and a timeout, at `src/lib/server/systems/run.ts:42`)**:
  - `lsof`: `src/lib/server/systems/host.ts:23`
  - `launchctl list`: `host.ts:95`
  - `plutil -convert json`: `host.ts:117`
  - `ps`: `host.ts:74`
  - `docker ps -a`: `src/lib/server/systems/services.ts:112`
  - `memory_pressure`, `sysctl`, `vm_stat`: `src/lib/server/systems/memory.ts:22-24`
  - `df -k`: `src/lib/server/systems/storage.ts:44`
  - `nice -n 15 du -sk` (sequential, about 8 s): `storage.ts:146`
- **HTTP probes (loopback, `httpGet` with a 2 s default timeout and redirect `manual`, at `src/lib/server/systems/run.ts:86`)**:
  - self `/api/systems/ping`: `src/lib/server/systems/index.ts:35`
  - OpenClaw `:18789/health`, OmniRoute `:20128/api/health`, claude-mem `:37777/api/health`, Honcho `${HONCHO_URL}/health`: `index.ts:36-39`
  - Hermes `:{port}/health`: `index.ts:54`
  - Ollama `/api/version|ps|tags`: `src/lib/server/systems/models.ts:35`
  - LM Studio `/api/v1`, `/api/v0`, `/v1/models` on `:1234`: `models.ts:101,131,148`
- **File reads**:
  - `~/.hermes/gateway_state.json`: `services.ts:146,152`
  - `package.json` versions: `services.ts:62,89-90`, `host.ts:150`
  - Honcho `.env` (BASE_URL keys only): `src/lib/server/systems/honcho-deps.ts:12,50`
  - plists under `~/Library/LaunchAgents`: `host.ts:12,117`
  - `fs.existsSync(~/bin/disk-cleanup.sh)`: `index.ts:134`
  - LTM SQLite (sync): `index.ts:56`
- **Caches (`cached()` SWR)**:
  - `systems:core` 15 s: `index.ts:151`
  - `systems:sizes` 10 min: `storage.ts:177`
  - `systems:plists` 5 min: `host.ts:164`
  - `systems:meta` 5 min: `services.ts:96`
  - `systems:honcho-llm-deps` 5 min: `honcho-deps.ts:78`
- **Arbitrary command execution (fix)**: `/bin/zsh -lc <item.command>` with cwd HOME and a 90 s timeout. The command is re-derived from a fresh probe and never taken from the client. `src/lib/server/systems/fix.ts:51`.
- **File write and process spawn (agent)**: the prompt file goes to `~/Library/Application Support/VOLTA/agent-prompts/fix-<stamp>.md` (pruned to 50), and osascript opens Terminal. `src/lib/server/claude-terminal.ts:31-38`, called from `fix.ts:104`.
- No decision log is written for fixes. Tasks writes `decisions.jsonl`; Systems does not.

## External dependencies
- **memory**:
  - `getStatus as ltmStatus` from `src/lib/server/ltm` (`src/lib/server/systems/index.ts:7,56`)
  - `HONCHO_URL` from `src/lib/server/honcho.ts:23` (`index.ts:6,39`)
- **home (client)**: `useSharedJson` from `src/components/dashboard/widgets/shared-json.ts:198` (`src/components/systems/SystemsApp.tsx:9,25`, `SystemsBadge.tsx:15`). This is the systems→home edge in the Phase 0 graph.
- **platform**:
  - `cached` (`src/lib/server/sources/cache.ts:45`)
  - `localJson` (`src/lib/server/route-helpers.ts:7`)
  - `rejectNonLocalMutation` (`src/lib/server/local-only.ts:71`, used at `fix/route.ts:18`)
  - `openClaudeInTerminal` (`src/lib/server/claude-terminal.ts:30`)
  - `useRemoteClient` (`src/lib/remote-client.ts:17`, used at `SystemsApp.tsx:83`)
  - UI kit `AppTopBar`, `useToasts`, `copyText` (`SystemsApp.tsx:6-8`)
- **Inbound**:
  - `recos` calls `getSystemsReport()` (`src/lib/server/recos/index.ts:8,154`)
  - `MobileTabBar` polls `SYSTEMS_SUMMARY_URL` (`src/components/mobile/MobileTabBar.tsx:10,56`)
  - `needs-you.ts` reads `/api/systems?summary=1` (`src/components/dashboard/widgets/needs-you.ts:5`)
- **Types**: `@/types/systems` (`src/lib/server/systems/index.ts:4`). These are proper shared types, unlike tasks, which imports its types from `components/`.

## Repeated concerns noticed
1. **Service health probes are duplicated with launchpad.** Systems probes `:18789/health`, `:20128/api/health`, `:37777/api/health`, `${HONCHO_URL}/health` and Hermes `/health` (`src/lib/server/systems/index.ts:36-39,54`). Launchpad probes the same services at different URLs (`/`, `/dashboard`, `/`, `127.0.0.1:8000/docs`, `:9900/health`; `src/lib/server/launchpad/services.ts:26-37`). It uses a separate probe function (`src/lib/server/launchpad/probe.ts:7`) and a separate cache key (`launchpad:probe:*`). The meaning of "up" differs: systems requires 2xx or degrades (`src/lib/server/systems/services.ts:256-262`), while launchpad accepts anything under 500 (`probe.ts:13`).
2. **Service and port registry is hard-coded in several places.** Ports 18789, 20128 and 37777 appear in `systems/index.ts:36-38`, `systems/services.ts:254,280,313`, `launchpad/services.ts:26-36`, `src/lib/server/llm/config.ts:14-15` (20128, 1234) and `src/lib/server/sources/claude-mem.ts:8` (`CLAUDE_MEM_URL`, which systems ignores). The Hermes port is found from live listeners in systems (`index.ts:20,51-52`) but comes from an env var or 9900 in launchpad (`launchpad/services.ts:9`). Honcho uses env `HONCHO_URL` in systems (`index.ts:39`) but is hard-coded to `:8000` in launchpad (`launchpad/services.ts:37`).
3. **Agent prompt building and handoff (same as tasks).** `GUARDRAILS` + `buildPrompt` at `src/lib/server/systems/fix.ts:62-91` and the inline prompt at `src/lib/server/sources/actions-write.ts:117-132` both write their own "ask before destructive…" rules. Both call `openClaudeInTerminal` (`fix.ts:104` with `cwd: process.cwd()`, and `actions-write.ts:134` with `~/.openclaw`). Only tasks logs the handoff (`actions-write.ts:136`).
4. **Three redactors.** `redact()` in `src/lib/server/systems/run.ts:63` has its own regexes and a 240-character cap. It is used across systems (`fix.ts:30,54`, `services.ts:489,570`). Separately, `redactSecrets` (`src/lib/server/redact.ts:6` re-exports `src/lib/server/search/redact.ts:258`) is used by tasks and launchpad (`src/lib/server/launchpad/safe.ts:18`). `app/api/honcho/_shared.ts:22` re-exports it a third time.
5. **Child-process wrappers.**
   - systems `run()` (`src/lib/server/systems/run.ts:42`) plus `bin()` candidate resolution (`run.ts:15-31`)
   - fix's raw `execFile` (`src/lib/server/systems/fix.ts:51`)
   - `claude-terminal.ts:38`
   - `promisify(execFile)` at `src/lib/server/launchpad/repos.ts:12`, `src/lib/server/launchpad/tailscale.ts:9`, `src/lib/server/sources/routines.ts:13`, `src/lib/server/research/status.ts:14`
   - The tailscale binary is resolved with its own candidate loop (`tailscale.ts:10,28`) that duplicates `BIN`/`bin()`.
6. **Typed error class and mutation route boilerplate.** `FixError` (`fix.ts:19`) matches `ActionWriteError` (`src/lib/server/sources/actions-write.ts:28`). `src/app/api/systems/fix/route.ts:17-41` repeats the structure of `src/app/api/actions/route.ts:28-54`.
7. **Client POST helper, copy-toast and remote gating.** `postFix` (`src/components/systems/SystemsApp.tsx:68-81`) is the same as Tasks `post` (`src/components/tasks/TasksApp.tsx:136-152`). The default `onMac = !remote` (`SystemsApp.tsx:97`) matches `TaskParts.tsx:454`. The outcome panel with Copy / Start on Mac (`AttentionStrip.tsx:139-153`) repeats `TaskParts.tsx:467-478`.
8. **Path display helper.** `tilde()` (`src/lib/server/systems/run.ts:12`) is re-implemented inline in `src/lib/server/launchpad/repos.ts:180,184`. Tasks uses a hard-coded `DISPLAY_PATH` (`src/lib/server/sources/actions.ts:23`).
9. **Polling.** Systems uses `useSharedJson` (`SystemsApp.tsx:25`), but Tasks (`TasksApp.tsx:84-98`) and Launchpad (`LaunchpadApp.tsx:50-56`) each run their own `setInterval` and visibility loop. `SystemsApp.tsx:34` also adds a separate 5 s clock interval.

## Confidence + known gaps
- **High** for `index.ts`, `fix.ts`, `run.ts`, the routes and `claude-terminal.ts`, which were read in full.
- **Medium** for the per-service builders in `services.ts` (about 590 lines). Only grep and partial reads were done, so builder internals (honcho, hermes, lmStudioService, ltmDaemon) are summarized as one node.
- **Possible bug**: the VOLTA "Start command" points to `cd ~/Documents/PROJECTS/rubric-agentic-os && npm run dev` (`src/lib/server/systems/services.ts:246`). That directory does not exist on this Mac; the repo is at `~/Volta-OS`.
- **Not traced**: `ServiceCard`, `ModelsPanel`, `StoragePanel` and `MemoryGauge` rendering. The `cache.ts` retry/backoff internals.
