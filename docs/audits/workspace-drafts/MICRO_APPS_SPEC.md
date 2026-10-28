# VOLTA OS — Micro-Apps Specification

> DRAFT 2026-10-28 (workspace-fit audit). Replaces the RUBRIC template spec, which described 6 apps for a YouTube/agency
> business and a 4-agent build split. This version lists what VOLTA actually ships, on what data, then proposals.
> All apps are routes of the one Next.js server on `localhost:50000` (`src/app/apps/<id>`). Shared rules: `docs/HANDOFF.md`
> (local-only guards, read-only sources, no API billing for text, quote-before-spend, honest data, 60 s polling).
> Status column = `docs/audits/micro-apps-audit-2026-10-27.md`. Feature ids = `PATHFINDER-2026-10-28/00-features.md`.

## 1. Shipped apps (real data)

### Memory and capture
| App | Route | Does | Reads | Status |
|---|---|---|---|---|
| LTM | `/apps/ltm` | Screen-memory timeline, search, screenshots | unvolta LTM SQLite (read-only) | partial: locked-DB 500s, no phone layout |
| Honcho | `/apps/honcho` | Peer memory: cards, sessions, conclusions, streaming chat | Honcho `:8000` | partial: phone |
| Sessions | `/apps/sessions` | Claude Code projects, sessions, tokens | `~/.claude/projects` transcripts | partial: phone, metadata-only search |
| Search | `/apps/search` + ⌘K | One search across memory sources, JEV re-rank | all sources | working; add Sessions, Research |
| Second Brain | `/second-brain` | Graph of vault, LTM timeline, routines, skills, MCP, workspace | `/api/workspace` + real sources | partial: workspace layer still seeded with template data |

### Agents and systems
| App | Route | Does | Reads | Status |
|---|---|---|---|---|
| Tasks | `/apps/tasks` | OpenClaw action board; "Awaiting you" badge | `~/.openclaw/wiki/main/actions.md` | working, read-only |
| Systems | `/apps/systems` | Services, models, storage health; Fix with agent | one service registry, probes | working |
| Feeds | `/apps/feeds` | Cron outputs with JEV triage | OpenClaw/Hermes logs | working; triage too noisy |
| Launchpad | `/apps/launchpad` | Services, repos, Netlify, Tailscale serve, Notion pins | registry, git, Netlify, Notion | partial |
| Recos | `/apps/recos` | Weekly improvement cards from real signals (failing routines, Systems, Notion playbooks) | routines, systems, Notion | working |

### Research
| App | Route | Does | Reads | Status |
|---|---|---|---|---|
| Research | `/apps/research` | Corpus inventory, threads, graphs, syntheses (phase 1) | Science/AI/Q/GRIMIORE, Voltamachine | partial: placeholder graphs |

### Creative
| App | Route | Does | Reads / writes | Status |
|---|---|---|---|---|
| Scripts | `/apps/scripts` | Notion outlines, source ledgers, teleprompter; push cues to Editor | Notion Video Production | phone broken |
| Carousels | `/apps/carousels` | Shorts decks from Notion: review, pin, approve, export PNG | Notion | desktop only |
| Generations | `/apps/generations` | xAI image/video, ElevenLabs voice; quote → confirm → daily budget; Promote to `/thumb` | `/api/media/*`, writes `workspace/skills/thumb/SKILL.md` | working |
| Studio | `/apps/studio` | Render queue: HyperFrames, Remotion, ffmpeg presets; Flow tab | `config/studio-projects.json` | partial: evicted project files |
| Editor | `/apps/editor` | Review mode (spatial pins, dictation, compiled agent prompt, Apply & teach) + Edit mode (NLE) | Studio renders, Generations, Notion episodes; writes `workspace/skills/{cut,animate}/SKILL.md` | partial: NLE state on iCloud |
| Music | `/apps/music` | VANTA VECTOR library, player, lyrics/credits; Suno panel | `config/music.json`, Windsor meta, suno-api `:3010` | partial: tracks not local, Suno pending |
| Podcast | `/apps/podcast` | VOLTA Daily Briefing: research → script → two-host TTS → private RSS | `config/podcast.json`, Windsor | working, degraded research step |

### Platform
| App | Route | Does | Reads | Status |
|---|---|---|---|---|
| Elements | `/apps/elements` | `/robo` design system and shared kit showcase | `src/components/robo-ui`, `elements/kit` | phone nav broken |

## 2. Contracts kept from the template
- **RL Log contract:** any skill VOLTA teaches has a `## Learned Preferences (RL Log)` heading; Editor and Generations append dated entries under it. Today these are workspace copies, not `~/.claude/skills` (see §4, P6).
- **Editor inbox:** Scripts, Carousels and Generations hand items to the Editor via `src/lib/editor-inbox.ts` (per-browser today).
- **Spend:** every paid media call returns a quote first; confirm above $0.50, daily cap enforced server-side.

## 3. Removed from the template
- The 4-sub-agent ownership split (5A–5D) and its owned-path table: build history, superseded by `INTEGRATION_CONTRACTS.md` and PATHFINDER.
- Hard-coded sample content: "Claude 5.5 Agentic OS" project, BetaShares nodes, Post #14–16 carousels, Flux/Kling/Ideogram/Recraft model list,
  Recos savings estimates and `/api/recos/apply` (Recos no longer writes the workspace; it links evidence and steps).

## 4. Proposals (not built — evidence in brackets)
| # | Proposal | Why / evidence | Home |
|---|---|---|---|
| P1 | **Capture inbox** ("Share to VOLTA" iOS Shortcut → token-auth route → workspace/Notion) | HANDOFF next-up #5 | new app or Tasks tab |
| P2 | **Agent-built video presets** (brief Claude Code/Codex/Manus to build with Blender MCP, three.js, HyperFrames, Remotion) | HANDOFF #6 | Studio |
| P3 | **VOLTA Cut** — Editor timeline exports a HyperFrames/Remotion project and renders via Studio | HANDOFF #7; Edit mode partly exists | Editor |
| P4 | **Agent console** — 1:1 chat via OmniRoute, agent status cards, cron Run-now/Pause with confirm | HANDOFF #8 (Orchestra OS ports); open question on cron controls | Systems or new app |
| P5 | **Channel desk** — calendar + analytics for The Strangest Times / OMNI_VEO / Shorts | Notion OMNI_VEO 90-day plan, Shorts Batch 1; vidIQ connector available | new app or Scripts tab |
| P6 | **Skill teacher** — Apply & teach writes to the live `~/.claude/skills/<skill>` (with diff + confirm) instead of a workspace copy; map /cut→`documentary-video-editing`, /animate→`hyperframes-animation`/`animated-documentary-motion` | `apply-feedback/route.ts` notes it only writes the copy | Editor + Generations |
| P7 | **Dreams** journal view | Notion "Dreams" pinned; `/api/notion/dreams` exists, only used in the Honcho rail | new app or Honcho tab |
| P8 | **Research assistant** (phase 3: cited answers over the corpus) | HANDOFF #4 | Research |
| P9 | **Ventures board** (ARGUS/EPSILON status, deadlines) — only if Patrick confirms ventures are active | actions.md 2026-10-28 positioning items | Launchpad tab |
