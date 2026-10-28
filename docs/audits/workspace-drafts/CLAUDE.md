# VOLTA OS workspace — root router

> DRAFT 2026-10-28 (workspace-fit audit). Replaces the RUBRIC/Jay E template router.
> Loaded automatically by every `claude -p` run that VOLTA starts with `cwd = ./workspace` (Skills deck "Run").
> Keep it under ~2.5k tokens. It routes; it does not explain. Detail lives in the files it points to.

Owner: **Patrick** · Epsilon LLC · US Eastern (America/New_York) <!-- TODO confirm; OpenClaw crons and the host clock both use ET -->
Dashboard: VOLTA OS at `http://localhost:50000` (repo `~/Volta-OS`, LaunchAgent `com.epsilon.volta-os`).
Framework: **ARMS**: Apps (`applications/`), Routines (`routines/`), Memory (this file, `MEMORY.md`, `context/`), Skills (`~/.claude/skills`, mapped in §2).

## 1. Router map (load only what the task needs)

| If the task is about… | Read first |
|---|---|
| Videos, channels, Shorts, scripts, thumbnails, music (VANTA VECTOR), the Daily Briefing podcast | `departments/content.md` (Creative studio) |
| Research corpus, UAP, quantum/neuromorphic/photonics, Voltamachine, ARGUS eval research | `departments/research.md` |
| OpenClaw, Hermes, OmniRoute, Honcho, LTM, claude-mem, cron health, routines | `departments/agents.md` |
| VOLTA OS itself, Launchpad repos, other software builds | `departments/product.md` |
| Epsilon LLC, ARGUS, EPSILON GovCon positioning, revenue | `departments/business.md` (Ventures) |
| Dreams, life wiki, goals, home machine | `departments/personal.md` |
| Who Patrick is, priorities, decisions, names you don't recognise | `context/profile.md`, `context/priorities.md`, `context/decisions.md`, `context/glossary.md` |
| Disk, Windsor/Voltamachina/iCloud, secrets | `ops/storage.md` (read before any large write) |
| "What happened / where is X?" | `MEMORY.md` (index cards only) |
| Which connector to use | `applications/README.md` |

Never load more than two department routers in one turn without saying why.

## 2. Skills (real ones live in `~/.claude/skills` and plugins, not here)

- **Video:** `hyperframes` (entry point) · `remotion-*` · `documentary-video-editing` · `epistemic-documentary-blueprint` · `animated-documentary-motion` · `fully-specd-screenplay` · `youtube-content` · `kanban-video-orchestrator` · `hermes-video-pipeline` · `manim-video`
- **Music/audio:** `songwriting-and-ai-music` · `songsee` · `heartmula` · `audiocraft-audio-generation`
- **Research:** `uap-object-dossier` · `clip-description-matcher` · `graphify` · `dialectic` · `anthropic-skills:deep-research`
- **Ops:** `openclaw-health` · `heartbeat` · `preflight` · `superpowers:systematic-debugging` · `superpowers:verification-before-completion`
- **Memory:** `claude-mem:mem-search` · `para-memory-files`

Workspace copies with an RL Log (`skills/<name>/SKILL.md`) exist only where VOLTA writes lessons:
`/cut` and `/animate` (Editor "Apply & teach"), `/thumb` (Generations "Promote"). The `## Learned Preferences (RL Log)`
section is authoritative over the body above it; newest entry wins. Never rename that heading.

## 3. Model and cost routing

- No API billing for LLM text. Use OmniRoute combos (`config/llm-routes.json`) or local LM Studio `qwen/qwen3.5-9b` on `:1234`. `claude -p` on the Max plan is fine.
- JEV (Typesafe classifier) ranks and triages; it does not pick Claude tiers.
- Paid media (xAI, ElevenLabs, Gemini TTS, Runway, Replicate) needs a quote and Patrick's OK before spend.

## 4. Connector policy

CLI → API → MCP, lightest first. Never paste secrets into any workspace file; name the env var at most. Keys live in `~/Volta-OS/.env.local` and are server-side only.

## 5. Output rules

- Bulky output (renders, datasets, audio, indexes) goes to `/Volumes/Windsor/VOLTA/**`, never the SSD. Flag anything over 500 MB first.
- Workspace stays small text (< 2 MB). Artifacts: `artifacts/<project>/`, HTML-first, VOLTA `/robo` tokens.
- Every artifact or decision gets a one-line card in `MEMORY.md` (date · path · 8-word summary).
- Honest data: no invented numbers; label estimates.

## 6. /compact preservation rules

Preserve verbatim: this router table and §2; the task goal, acceptance criteria and every number Patrick gave;
every file path written this session with a 1-line note; open decisions and stated preferences; RL Log entries added.
Drop: tool output bodies, file contents already on disk, exploratory reads, failed attempts (keep "tried X, failed because Y").
After compacting, re-read only the active department router.

## 7. Safety

- Data sources are read-only: LTM SQLite, vaults, Notion, OpenClaw DBs, Honcho, iCloud placeholders (never read a dataless file; offer `brctl download`).
- `/clean-up` reports first and asks before removing anything outside `/tmp` and known caches.
- Drafts, never sends: email, Discord, Telegram, X. Cron Run-now/Pause needs Patrick's OK.
- Never commit `.env*`. Never load `~/.hermes/SOUL.md` or other agent persona files into a VOLTA task.
