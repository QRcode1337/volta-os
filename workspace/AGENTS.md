# AGENTS.md — VOLTA OS workspace (non-Claude agents)

> Mirror of `CLAUDE.md` for OpenClaw (ErisMorn), Hermes, Codex, Gemini CLI and any agent that reads `AGENTS.md`.
> `CLAUDE.md` is the source of truth. If they disagree, follow `CLAUDE.md` and add a drift card to `MEMORY.md`.

## Who you are working for
Patrick Galloway · EPSILON LLC (epsilonsec.ai) · America/New_York. Designer, filmmaker and software builder running a personal
agentic OS (VOLTA) over his memory systems, research corpus, video tools and agent fleet. See `context/profile.md`.
**Top priority:** first paying clients for EPSILON's AI optimization + digital marketing offer (`business/epsilon.md`).
**Second:** The Strangest Times YouTube channel to ad revenue and sponsors (`content/channels.md`).

## Router map
- EPSILON LLC, clients, offer, ARGUS, ventures → `departments/business.md`
- The Strangest Times, socials, Shorts, scripts, music, podcast → `departments/content.md`
- Research (corpus, UAP, frontier tech, Voltamachine) → `departments/research.md`
- Agent fleet (OpenClaw, Hermes, OmniRoute, Honcho, LTM, routines, IFTTT) → `departments/agents.md`
- VOLTA OS and builds → `departments/product.md`
- Personal → `departments/personal.md`
- Index of everything → `MEMORY.md` (relevant section only)

## Runner split (2026-10-28)

| Runner | Owns |
|---|---|
| OPENCLAW (agent `main`, gateway `:18789`) | Heartbeat, Sentinel, Scout, Curator, Action Capture/Orchestrate/Digest, Social + Discord monitors, Quantum_VAULT archive, COMPRESSOR, Identity Guardian, cron health — see `routines/README.md` |
| LAUNCHD | VOLTA server, OmniRoute, LTM daemon/ingest/prune, desktop mirror, backups, cache cleanup, CloudKit watchdog |
| IFTTT (cloud) | Social cross-posting: X → Discord/Sheets/Docs/Evernote, Quantum_VAULT Telegram → Facebook — see `applications/ifttt.md` |
| HERMES | Gateway only; **no cron jobs** in `~/.hermes/cron/jobs.json` and the gateway shows an error state. Do not assume Hermes runs anything. |
| CLAUDE (`claude -p`, Max plan) | VOLTA skill runs, podcast research, Systems "Fix with agent" |

Agents write results as plain markdown into the matching `routines/<id>.md` "Last run" block or their own logs
(OpenClaw wiki `~/.openclaw/wiki/main/`). Propose skill changes as VOLTA Recos candidates; never edit skills directly.

## Skills
Real skills: `~/.claude/skills` + plugins (catalogue in VOLTA `/api/skills-real`). Workspace `skills/<name>/SKILL.md`
copies exist for the RL Logs VOLTA writes (`/cut`, `/animate`, `/thumb`) and a few house skills. Only VOLTA Editor,
Generations Promote, Recos and `/calibrate` may append to a `## Learned Preferences (RL Log)` section.

## Hard rules
1. CLI → API → MCP. Lightest connector wins.
2. No secrets in files. Env var names at most.
3. VOLTA bridge writes stay inside `./workspace`, `config/`, or `/Volumes/Windsor/VOLTA/**`.
4. No API billing for LLM text (OmniRoute or local model). Paid media needs a quote and an OK.
5. Drafts only for any outreach or social post; nothing is sent or posted without Patrick saying "send".
6. No invented numbers, clients or testimonials.
7. On compaction, follow `CLAUDE.md` §6 exactly.
8. Every artifact or decision → one index card line in `MEMORY.md`.
