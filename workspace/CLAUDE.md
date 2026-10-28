# VOLTA OS workspace — root router

> Loaded automatically by every `claude -p` run VOLTA starts with `cwd = ./workspace` (Skills deck "Run").
> It routes; it does not explain. Detail lives in the files it points to. Rebuilt 2026-10-28 from the workspace-fit audit
> (`~/Volta-OS/docs/audits/2026-10-28-workspace-fit.md`) and Patrick's answers that day.

Owner: **Patrick Galloway** · EPSILON LLC (epsilonsec.ai) · Maryland · **America/New_York**
Dashboard: VOLTA OS at `http://localhost:50000` (repo `~/Volta-OS`, LaunchAgent `com.epsilon.volta-os`).
Framework: **ARMS**: Apps (`applications/`), Routines (`routines/`), Memory (this file, `MEMORY.md`, `context/`), Skills (`~/.claude/skills`, mapped in §2).

**Top priority (2026-10-28): land EPSILON LLC's first paying clients for AI optimization + digital marketing.**
Second: grow The Strangest Times to YouTube ad revenue and sponsors. When a task could serve either, say how.

## 1. Router map (load only what the task needs)

| If the task is about… | Read first |
|---|---|
| EPSILON LLC clients, offer, outreach, pricing, ARGUS, other ventures | `departments/business.md` → `business/epsilon.md` |
| The Strangest Times, Shorts, TikTok/X/Telegram/Instagram, scripts, thumbnails, music, podcast | `departments/content.md` → `content/channels.md` |
| Research corpus, UAP, quantum/neuromorphic/photonics, Voltamachine, ARGUS eval research | `departments/research.md` |
| OpenClaw, Hermes, OmniRoute, Honcho, LTM, claude-mem, cron health, routines, IFTTT | `departments/agents.md` |
| VOLTA OS itself, Launchpad repos, other software builds | `departments/product.md` |
| Goals, Dreams, life wiki | `departments/personal.md` |
| Who Patrick is, priorities, decisions, names you don't recognise | `context/profile.md`, `context/priorities.md`, `context/decisions.md`, `context/glossary.md` |
| Disk, Windsor/Voltamachina/iCloud, secrets | `ops/storage.md` (read before any large write) |
| "What happened / where is X?" | `MEMORY.md` (index cards only) |
| Which connector to use | `applications/README.md` |

Never load more than two department routers in one turn without saying why.

## 2. Skills (real ones live in `~/.claude/skills` and plugins, not here)

- **Marketing/sales:** `agentic-council:herald-messaging-strategy` · `agentic-council:herald-growth-engineering` · `agentic-council:scout-competitive-analysis` · `agentic-council:revenue-council` · `humanizer` · `elements-of-style:writing-clearly-and-concisely`
- **Video:** `hyperframes` (entry point) · `remotion-*` · `documentary-video-editing` · `epistemic-documentary-blueprint` · `animated-documentary-motion` · `fully-specd-screenplay` · `youtube-content` · `kanban-video-orchestrator` · `hermes-video-pipeline` · `manim-video`
- **Music/audio:** `songwriting-and-ai-music` · `songsee` · `heartmula` · `audiocraft-audio-generation`
- **Research:** `uap-object-dossier` · `clip-description-matcher` · `graphify` · `dialectic` · `anthropic-skills:deep-research`
- **Ops:** `openclaw-health` · `heartbeat` · `superpowers:systematic-debugging` · `superpowers:verification-before-completion`
- **Memory:** `claude-mem:mem-search` · Pieces vault (`pieces-vault-memory` MCP)

Workspace copies with an RL Log (`skills/<name>/SKILL.md`) exist where VOLTA writes lessons:
`/cut` and `/animate` (Editor "Apply & teach"), `/thumb` (Generations "Promote"), plus `/tone`, `/robo`, `/wildcard`,
`/clean-up`, `/calibrate`, `/note`. The `## Learned Preferences (RL Log)` section is authoritative over the body above it;
newest entry wins. Never rename that heading, and keep it the last `##` section of the file.

## 3. Model and cost routing

- No API billing for LLM text. Use OmniRoute combos (`config/llm-routes.json`) or local LM Studio `qwen/qwen3.5-9b` on `:1234`. `claude -p` on the Max plan is fine.
- JEV tier-routes every dashboard skill run (HAIKU/SONNET/OPUS), and also triages feeds and ranks podcast/research items. Details: `product/jev-router.md` (the reference; don't restate it).
- Paid media (xAI, ElevenLabs, Gemini TTS, Runway, Replicate) needs a quote and Patrick's OK before spend.

## 4. Connector policy

CLI → API → MCP, lightest first. Never paste secrets into any workspace file; name the env var at most. Keys live in `~/Volta-OS/.env.local` and are server-side only.

## 5. Output rules

- Bulky output (renders, datasets, audio, indexes) goes to `/Volumes/Windsor/VOLTA/**`, never the SSD. Flag anything over 500 MB first.
- Workspace stays small text (< 2 MB). Artifacts: `artifacts/<project>/`, HTML-first, VOLTA `/robo` tokens.
- Every artifact or decision gets a one-line card in `MEMORY.md` (date · path · 8-word summary).
- Honest data: no invented numbers, clients, testimonials or results; label estimates as estimates.

## 6. /compact preservation rules

Preserve verbatim: this router table and §2; the task goal, acceptance criteria and every number Patrick gave;
every file path written this session with a 1-line note; open decisions and stated preferences; RL Log entries added.
Drop: tool output bodies, file contents already on disk, exploratory reads, failed attempts (keep "tried X, failed because Y").
After compacting, re-read only the active department router.

## 7. Safety

- Data sources are read-only: LTM SQLite, vaults, Notion, OpenClaw DBs, Honcho, iCloud placeholders (never read a dataless file; offer `brctl download`).
- `/clean-up` reports first and asks before removing anything outside `/tmp` and known caches.
- Drafts, never sends: email, Discord, Telegram, X, TikTok, Instagram, client outreach. Nothing goes out without Patrick saying "send".
- IFTTT applets and cron Run-now/Pause change live automations: propose, don't toggle, without Patrick's OK.
- Never commit `.env*`. Never load `~/.hermes/SOUL.md` or other agent persona files into a VOLTA task.
- Personal details (family, health, legal, finances) stay out of workspace files and out of anything public.
