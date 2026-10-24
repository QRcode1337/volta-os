# RUBRIC Agentic OS — Root Router

> Loaded on **every** session. Keep this file under ~2.5k tokens. Detail lives in the department
> routers below; this file only points. If you are about to add a paragraph here, add a pointer instead.

Owner: Jay E · RoboNuggets · Sydney (AEST). Local OS runs at `localhost:50000`.
Framework: **ARMS** — **A**pps, **R**outines, **M**emory, **S**kills. Everything is plain text Claude can route.

## 1. Router map (load only what the task needs)

| If the task is about…                                   | Read first                     |
|---------------------------------------------------------|--------------------------------|
| Clients, sponsors, proposals, pricing, pipeline         | `departments/business.md`      |
| YouTube, scripts, thumbnails, carousels, edits          | `departments/content.md`       |
| RUBRIC OS itself, /robo UI, Jev, Second Brain           | `departments/product.md`       |
| Health, macros, travel, goals                           | `departments/personal.md`      |
| Skool, Discord, member wins, live Q&A                   | `departments/community.md`     |
| "What happened / where is X?"                           | `MEMORY.md` (index cards only) |
| Scheduled automations                                   | `routines/*.md`                |
| Which connector to use                                  | `applications/*.md` → run `/search-connectors` |

Never load more than **two** department routers in one turn without saying why.

## 2. Skills (self-triggered first)

Self-triggered — invoke without being asked when the pattern matches:
`/lead-research` · `/proposal-writer` · `/client-onboarding` · `/automation-audit` · `/call-recap` · `/clean-up`

Database skills — memory with taste, always apply when producing that output type:
`/tone` (any prose) · `/thumb` (any thumbnail) · `/robo` (any visual artifact) · `/wildcard` (any batch ≥ 5)

Artifact skills — on command: `/animate` · `/cut` · `/grammar` · `/note` · `/calibrate` · `/search-connectors` · `/chromify`

Each skill lives at `skills/<name>/SKILL.md`. The `## Learned Preferences (RL Log)` section at the bottom of
each skill is **authoritative** and overrides the body above it when they conflict. Newest entry wins.

## 3. Model routing (Jev)

- Every skill call is classified by **Jev** first (~0.006 s, ~$0.00004). Jev picks HAIKU / SONNET / OPUS.
- Jev may override the frontmatter tier only at **≥ 0.80 confidence**. FABLE is never auto-selected; it is a manual pin.
- Default bias: if Haiku can do it, Haiku does it. Opus is for taste, motion, long-horizon planning, and client-facing decks.

## 4. Connector policy

Prefer **CLI → API → MCP**, in that order. MCPs preload context every session — an MCP used fewer than
5×/week is a candidate for removal (see `applications/`). Never paste secrets into any workspace file; reference env var names only.

## 5. Output rules

- Visual artifacts are **HTML-first**, styled with `/robo` tokens, saved under `artifacts/<client-or-tag>/`.
- Every artifact gets a one-line index card appended to `MEMORY.md` (date · path · 8-word summary).
- Prose passes through `/tone`, then `/grammar`. Batches of ideas pass through `/wildcard`.

## 6. /compact preservation rules

When compacting (manual `/compact` or auto at 80% context), **preserve verbatim**:

1. This router table (section 1) and the skill lists (section 2).
2. The current task's goal, acceptance criteria, and any numbers the user gave (prices, dates, frame counts, timestamps).
3. Every file path written or edited this session, with a 1-line note of what changed.
4. Open decisions and the user's stated preferences from this session (they become RL Log candidates).
5. Any `RL Log` entries added this session.

**Drop** on compact: tool output bodies, file contents already saved to disk, exploratory reads, failed attempts
(keep a one-line "tried X, failed because Y"), and greeting/acknowledgement turns.

After compacting, re-read only the department router for the active task — never `MEMORY.md` in full.

## 7. Safety

- `/clean-up` reports first and asks before removing anything outside `/tmp` and known caches.
- Never write outside `./workspace` from the OS bridge. Never commit `.env*`.
- Client data stays in its client folder; never mix BetaShares and competitor material in one artifact.
