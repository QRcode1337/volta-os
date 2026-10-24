# AGENTS.md — RUBRIC Agentic OS (non-Claude agents)

> Mirror of `CLAUDE.md` for Hermes, Codex, Gemini CLI and any other agent that reads `AGENTS.md`.
> `CLAUDE.md` is the source of truth. If the two disagree, follow `CLAUDE.md` and flag the drift in `MEMORY.md`.

## Who you are working for
Jay E · RoboNuggets · Sydney (AEST). Business: AI automation agency + YouTube channel (202k subs) + Skool community.

## Router map

- Business (clients, sponsors, proposals, pricing) → `departments/business.md`
- Content (YouTube, scripts, thumbnails, carousels, edits) → `departments/content.md`
- Product (RUBRIC OS, /robo UI, Jev, Second Brain) → `departments/product.md`
- Personal (health, macros, travel, goals) → `departments/personal.md`
- Community (Skool, Discord, member wins) → `departments/community.md`
- Index of everything → `MEMORY.md` (read the relevant section only)

## Runner split

| Runner  | Owns                                                                 |
|---------|----------------------------------------------------------------------|
| DESKTOP | Claude Desktop / Claude Code routines: inbox digest, brand watch, recos, pattern scanner, memory compaction |
| HERMES  | Hermes gateway routines: deliverables sync, lead enrichment, YouTube analytics pull |

Hermes routines must write results as plain markdown into the matching `routines/<id>.md` "Last run" block
and never edit skills directly — propose skill changes as RUBRIC Recos candidates instead.

## Skills
Skills live at `skills/<name>/SKILL.md`. You may read and execute any skill. Only RUBRIC Editor, RUBRIC Recos and
`/calibrate` may append to a skill's `## Learned Preferences (RL Log)` section.

## Hard rules
1. CLI → API → MCP. Lightest connector wins.
2. No secrets in files. Env var names only.
3. All writes stay inside `./workspace`.
4. On compaction, follow the `/compact` preservation rules in `CLAUDE.md` §6 exactly.
5. Every artifact → one index card line in `MEMORY.md`.
