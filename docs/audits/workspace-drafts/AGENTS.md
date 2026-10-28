# AGENTS.md — VOLTA OS workspace (non-Claude agents)

> DRAFT 2026-10-28. Mirror of `CLAUDE.md` for OpenClaw (ErisMorn), Hermes, Codex, Gemini CLI and any agent that reads `AGENTS.md`.
> `CLAUDE.md` is the source of truth. If they disagree, follow `CLAUDE.md` and add a drift card to `MEMORY.md`.

## Who you are working for
Patrick · Epsilon LLC · US Eastern. Builds a personal agentic OS (VOLTA) over his memory systems, research corpus,
creative/video tools and agent fleet. Projects: faceless documentary channels and Shorts, VANTA VECTOR music,
the VOLTA Daily Briefing podcast, ARGUS geospatial intelligence, EPSILON GovCon positioning. See `context/profile.md`.

## Router map
- Creative (channels, Shorts, scripts, music, podcast, renders) → `departments/content.md`
- Research (corpus, UAP, frontier tech, Voltamachine) → `departments/research.md`
- Agent fleet (OpenClaw, Hermes, OmniRoute, Honcho, LTM, routines) → `departments/agents.md`
- VOLTA OS and builds → `departments/product.md`
- Ventures (Epsilon LLC, ARGUS, EPSILON) → `departments/business.md`
- Personal → `departments/personal.md`
- Index of everything → `MEMORY.md` (relevant section only)

## Runner split (real, 2026-10-28)

| Runner | Owns |
|---|---|
| OPENCLAW (agent `main`, gateway `:18789`) | Heartbeat, Sentinel, Scout, Curator, Action Capture/Orchestrate/Digest, Social + Discord monitors, Quantum_VAULT archive, COMPRESSOR, Identity Guardian, cron health — see `routines/README.md` |
| LAUNCHD | VOLTA server, OmniRoute, LTM daemon/ingest/prune, desktop mirror, backups, cache cleanup, CloudKit watchdog |
| HERMES | Gateway only; **no cron jobs** in `~/.hermes/cron/jobs.json` and the gateway shows an error state. Do not assume Hermes runs anything. |
| CLAUDE (`claude -p`, Max plan) | VOLTA skill runs, podcast research, Systems "Fix with agent" |

Agents write results as plain markdown into the matching `routines/<id>.md` "Last run" block or their own logs
(OpenClaw wiki `~/.openclaw/wiki/main/`). Propose skill changes as VOLTA Recos candidates; never edit skills directly.

## Skills
Real skills: `~/.claude/skills` + plugins (catalogue in VOLTA `/api/skills-real`). Workspace `skills/<name>/SKILL.md`
copies exist only for `/cut`, `/animate`, `/thumb` RL Logs. Only VOLTA Editor, Generations Promote, Recos and `/calibrate`
may append to a `## Learned Preferences (RL Log)` section.

## Hard rules
1. CLI → API → MCP. Lightest connector wins.
2. No secrets in files. Env var names at most.
3. VOLTA bridge writes stay inside `./workspace`, `config/`, or `/Volumes/Windsor/VOLTA/**`.
4. No API billing for LLM text (OmniRoute or local model). Paid media needs a quote and an OK.
5. On compaction, follow `CLAUDE.md` §6 exactly.
6. Every artifact or decision → one index card line in `MEMORY.md`.
