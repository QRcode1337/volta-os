# VOLTA workspace fit audit — 2026-10-28

Scope: `~/Volta-OS/workspace/` (75 files, ~70 KB) and `~/Volta-OS/MICRO_APPS_SPEC.md`, both scaffolded from a template of
Jay E's (RoboNuggets) Agentic OS. Question: what fits Patrick, what doesn't, what's missing, and what to swap in.
Method: read-only. Code grep of `src/`, live VOLTA APIs (`/api/routines`, `/api/skills-real`, `/api/mcp`, `/api/notion/*`,
`/api/launchpad`, `/api/studio/projects`, `/api/podcast/config`, `/api/feeds`, `/api/research/status`), OpenClaw wiki and
`actions.md`, `~/.hermes` listing, `~/ErisMorn/{MEMORY,USER,CASCADE}.md`, Patrick's `~/.claude/CLAUDE.md` and `MY-RULES.md`,
`~/Documents/PROJECTS` names. No secrets were read or copied. Nothing in `workspace/` or `src/` was changed.
Code references are from the start of this audit. A parallel refactor is editing `src/app/api/{workspace,skills/run,editor/apply-feedback}` (and deleted
`workspace/frontmatter.ts`), so line numbers may shift. Re-check §2 and §8 after it lands.

Drafts: `docs/audits/workspace-drafts/` (same relative paths they would have in `workspace/`; the spec draft sits at its repo-root name).

---

## 1. Top 10 gaps

1. **The template router steers live agent runs.** `src/app/api/skills/run/route.ts:123` runs `claude -p` with `cwd = workspace/`, so
   `workspace/CLAUDE.md` loads as project memory on every Skills-deck "Run". That file says *"Owner: Jay E · RoboNuggets · Sydney"*, routes to client
   proposals and pricing, and describes a Jev-picks-Haiku/Sonnet/Opus model that doesn't exist. Highest-priority swap.
2. **No "who is Patrick" layer.** Wrong owner, wrong timezone (template: Sydney; host clock and every OpenClaw cron: America/New_York), no priorities,
   people, glossary or decision log. ErisMorn's `USER.md` is also still an unfilled template, so no agent has a user model.
3. **The departments are someone else's.** Business = agency clients, Content = a 202k-sub YouTube channel, Community = Skool/Discord, Personal = macros.
   Patrick's real work has no router: **Research** (4 corpus roots, UAP, frontier tech, Voltamachine), **Agent fleet** (OpenClaw, Hermes, OmniRoute, Honcho,
   LTM), **Creative** as it really is (documentary channels in Notion, Shorts, VANTA VECTOR music, Daily Briefing podcast, Studio renders), **Ventures**
   (Epsilon LLC, ARGUS, EPSILON). VOLTA's department list is hard-coded to the template's five (`src/types/os.ts:6`, `workspace/route.ts:11`).
4. **Routines are fiction.** 8 template routines (3 "run by Hermes", which has zero cron jobs) vs **30 real** OpenClaw + launchd routines. Three are failing
   right now (Action Orchestrate Tier 2, `ai.hermes.gateway`, `com.omniroute.autostart`) and the podcast LaunchAgent is written but not loaded. None of that is in the workspace.
5. **Applications describe the wrong stack.** Premiere CLI, MyFitnessPal, Slack, AWS, Excalidraw. Missing: OmniRoute, LM Studio, Notion API, Honcho,
   LTM, `claude -p`, HyperFrames/Remotion, Suno, xAI/ElevenLabs/Gemini TTS. 5 of 22 MCP servers fail to connect (agent-cards, auggie, funes, jetbrains, my-pieces-memory).
6. **Skills are shadows.** 17 workspace `SKILL.md`s for skills that don't exist in `~/.claude/skills` (lead-research, proposal-writer…), while Patrick's ~100 real
   user skills (video, music, research, ops) aren't mapped anywhere agents read. Editor "Apply & teach" and Generations "Promote" write RL lessons to the workspace
   copy, not the live skill (`apply-feedback/route.ts:4`).
7. **No ops docs in the OS.** Storage map (SSD vs Windsor vs Voltamachina vs iCloud placeholders), the CloudKit leak, secrets policy and service runbooks exist,
   but only scattered across `~/.claude/CLAUDE.md`, `~/ErisMorn/MEMORY.md` and `docs/HANDOFF.md`.
8. **Template data also lives in code, not just files.** `src/lib/mock-data.ts` seeds (DEPT_FILES, SKILL_SEED, ROUTINES, CONNECTORS, ARTIFACT_SEED with BetaShares/Northwind,
   HOME_CLOCK = Sydney) still drive the Second Brain graph and artifact ring whatever the workspace holds. Deleting workspace files alone won't remove them from the graph.
   The "Applied Recos" blocks in 6 files are fossils: nothing in `src/` writes them any more.
9. **Invented numbers.** Jev benchmarks, "$437/mo saved", 202k subs, client MRR — all conflict with Patrick's "honest data, no invented numbers" rule.
10. **Soon-applicable work isn't captured.** Evidence: OMNI_VEO 90-day channel plan, The Strangest Times master project and Shorts Batch 1 (Notion); Suno for VANTA
    VECTOR (blocked on the cookie); the iPhone capture inbox (HANDOFF next-up #5); ARGUS/EPSILON federal-positioning items closed today in `actions.md`; security backlog
    (LiteLLM scan, plaintext-secret migration, key rotation).

**MICRO_APPS_SPEC:** specs 6 of VOLTA's 19 apps; the other 13 shipped apps aren't in it. Recos, Generations, Scripts and Carousels were built differently than specced. See §7.

---

## 2. What VOLTA actually reads from `workspace/` (load-bearing)

| Consumer | File(s) | Effect |
|---|---|---|
| `skills/run` (`claude -p`, cwd = workspace) | `CLAUDE.md` (auto-loaded by Claude Code) | **Steers every live skill run.** |
| `editor/apply-feedback` | `skills/cut/SKILL.md`, `skills/animate/SKILL.md` | Appends RL entries under `## Learned Preferences (RL Log)`; heading must exist. |
| `media/promote` | `skills/thumb/SKILL.md` | Appends promoted-asset rules under the RL Log heading. |
| `GET /api/workspace` → Second Brain | every file (tokens, mtime); `skills/*/SKILL.md` frontmatter `model`/`effort`; `routines/<seed-id>.md` frontmatter `mode`/`cap_usd` | Seed nodes from `mock-data.ts` get real sizes; extra files become nodes. Department = folder name, but only `business/content/personal/product/community` are recognised; everything else files under `memory`. |
| `GET/PUT /api/files` | any path | Quick-edit in the Second Brain; falls back to seed markdown when a file is missing. |
| `inferDepartment` artifact tags | `artifacts/<tag>/` | Tag → department map is template-only (betashares, robo, rubric…). |

Not load-bearing: Home ROUTINES and SKILLS DECK read the real `/api/routines` and `/api/skills-real`; `/api/skills/run` resolves skills from `~/.claude/skills`.
Contract: `INTEGRATION_CONTRACTS.md` §8 (workspace < 2 MB, text only; every taught skill keeps the RL Log heading).

---

## 3. Inventory (every file)

Fit: **yes** = applies as is · **adapt** = right idea, wrong content · **no** = someone else's business.

### Root
| File | What it is | Fit | Why |
|---|---|---|---|
| `CLAUDE.md` | Root router (Jay E/RoboNuggets/Sydney), skill lists, Jev routing, /compact rules | adapt | Structure and /compact rules are good; owner, routing, skills, model policy are wrong. Load-bearing. |
| `AGENTS.md` | Mirror for non-Claude agents; DESKTOP/HERMES runner split | adapt | Mirror idea is right; runner split and owner are fiction. |
| `MEMORY.md` | Index cards (BetaShares, scripts, macros…) + Applied Recos fossil | adapt | Card format is good; every card points at template content. |
| `.DS_Store` | Finder metadata | no | Junk; skipped by the loader but committed. |

### departments/
| File | What it is | Fit | Why |
|---|---|---|---|
| `business.md` | Clients/sponsors/pricing router | no | No clients or pricing; Ventures (ARGUS/EPSILON) fits the slot. |
| `content.md` | YouTube 202k / thumbnails / carousels router | adapt | Patrick does make video, but documentary channels via Notion + Studio, plus music and podcast. |
| `product.md` | RUBRIC OS / /robo / Jev router | adapt | VOLTA OS is real; Jev and RUBRIC env vars are not. |
| `personal.md` | Health, macros, travel | adapt | Slot is right; content is Jay's. Evidence for Patrick: Notion Dreams, My Life Wiki. |
| `community.md` | Skool 4,120 members, Discord FAQ | no | No community business. Signals (Discord archive, social monitor) belong under Research. |

### applications/
| File | What it is | Fit | Why |
|---|---|---|---|
| `api-media.md` | Flux/Kling/Runway/Ideogram/Recraft | adapt→replace | Real providers: xAI, ElevenLabs, Gemini TTS, Runway, Replicate. |
| `api-mfp.md` | MyFitnessPal scraper | no | No evidence. |
| `api-youtube.md` | YouTube Data API | adapt | Soon: channel analytics once uploads start (vidIQ connector available). |
| `cli-aws.md` | S3/Lambda | no | No evidence of AWS use. |
| `cli-ffmpeg.md` | ffmpeg recipes | yes | Studio "ffmpeg Tools" preset. |
| `cli-gh.md` | gh for RUBRIC repo | adapt | Real use: Launchpad repos `QRcode1337/*`. |
| `cli-premiere.md` | premiere-cli | no | Patrick edits in VOLTA Editor/HyperFrames/Remotion. |
| `mcp-excalidraw.md` | Excalidraw MCP (disabled) | no | Not configured. |
| `mcp-gcal.md` | Google Calendar MCP | adapt? | A calendar connector exists in Claude sessions; unclear if agents should use it. Ask. |
| `mcp-gmail.md` | Gmail MCP, drafts only | adapt? | Gmail connector exists in sessions; no digest routine. Ask. |
| `mcp-slack.md` | Slack MCP | no | Needs auth, unused. |

### artifacts/ and business/artifacts/
| File | What it is | Fit | Why |
|---|---|---|---|
| `artifacts/betashares/q4-sponsor-deck.html` | Sponsor deck | no | Jay's sponsor. |
| `artifacts/community/member-wins-roundup.html` | Skool wins | no | — |
| `artifacts/robo/hud-component-sheet.html` | /robo HUD components | adapt | /robo is VOLTA's real design system; verify against `src/components/robo-ui`. |
| `artifacts/robo/robo-brand-book.html` | /robo brand book | adapt | Same; Elements app is the live version. |
| `artifacts/rubric/jev-router-benchmarks.html` | Jev benchmark deck | no | Invented numbers. |
| `artifacts/rubric/pricing-one-pager.html` | Agency pricing | no | — |
| `business/artifacts/beta-shares-deck.html` | Deck working copy | no | — |

### business/, community/
| File | Fit | Why |
|---|---|---|
| `business/pipeline.md` | no | Agency deals. |
| `business/pricing.md` | no | Agency rate card. |
| `business/clients/betashares.md` | no | Jay's sponsor. |
| `business/clients/lumen-labs.md` | no | Fictional prospect. |
| `business/clients/northwind.md` | no | Fictional client. |
| `community/discord-faq.md` | no | Skool/Discord FAQ for RUBRIC template. |
| `community/member-wins.md` | no | — |
| `community/skool.md` | no | — |

### content/
| File | What it is | Fit | Why |
|---|---|---|---|
| `youtube-calendar.md` | Upload calendar | adapt→replace | Needed for OMNI_VEO/Strangest Times; generate from Notion. |
| `thumbnails-log.md` | A/B CTR log | adapt | Useful once uploads start; feeds `/thumb`. |
| `scripts/agentic-os-v3.md` | Jay's video script | no | Scripts live in Notion (VOLTA Scripts). |
| `scripts/mods-deep-dive.md` | Jay's outline | no | — |
| `carousels/post-14-arms.md` | Instagram carousel | no | Patrick's decks are Shorts decks in Notion. |

### personal/
| File | Fit | Why |
|---|---|---|
| `goals-2026.md` | adapt→replace | Goals file is useful; content is Jay's (subs, MRR). Needs Patrick. |
| `health.md` | no (ask) | No evidence; keep only if Patrick wants it. |
| `macros-log.md` | no | — |
| `travel.md` | no | — |

### product/
| File | What it is | Fit | Why |
|---|---|---|---|
| `jev-router.md` | Jev Haiku/Sonnet/Opus picker | adapt | Real JEV is a Typesafe classifier for ranking/triage (`src/lib/server/jev`). |
| `robo-ui-library.md` | /robo component table | adapt | Real components; point at `src/components/robo-ui` + Elements. |
| `rubric-os-roadmap.md` | RUBRIC Q4 roadmap | replace | Use HANDOFF "Next up" + PATHFINDER. |
| `second-brain-spec.md` | Views + data contract | adapt | Mostly right; "424,846 files" is a procedural fake. |

### routines/
| File | Template meaning | Fit | Real counterpart |
|---|---|---|---|
| `brandwatch.md` | Competitor/brand scanner | replace | Sentinel + Social Monitor + Scout |
| `cache-keepalive.md` | Recos fossil, no frontmatter | no | — |
| `deliverables.md` | Client deliverables (Hermes) | no | — |
| `inbox.md` | Gmail digest | replace | Action Capture → Orchestrate → Digest |
| `lead-enrich.md` | Lead research (Hermes) | no | — |
| `memory-compact.md` | MEMORY.md hygiene | replace | COMPRESSOR + Weekly Soul & Memory Integrity |
| `pattern.md` | Session pattern scanner | adapt | Curator — Knowledge Synthesis |
| `recos.md` | Friday recos generator | adapt | VOLTA Recos (on demand, real signals) |
| `yt-analytics.md` | YouTube analytics pull (Hermes) | adapt (soon) | Channel analytics after launch |

### skills/
| Skill | Fit | Why |
|---|---|---|
| `animate` | adapt | **Load-bearing** (Editor RL target). Rewrite body for HyperFrames/Remotion documentary motion; keep RL Log. |
| `cut` | adapt | **Load-bearing**. Rewrite for VOLTA Editor NLE + ffmpeg; drop premiere-cli. |
| `thumb` | adapt | **Load-bearing** (Generations Promote). Reset references to Patrick's channels. |
| `tone` | adapt | Voice database is valuable, but needs Patrick's corpus (Notion scripts). |
| `robo` | adapt | Real VOLTA design system. |
| `wildcard` | adapt | 80/20 novelty rule matches "ambitious, experimental" preference. |
| `clean-up` | adapt | Wire to `~/bin/disk-cleanup.sh` and the storage policy. |
| `calibrate` | adapt | RL-log tuner; useful if teach targets live skills. |
| `note` | adapt | Capture into the right department; pairs with the capture inbox proposal. |
| `automation-audit`, `call-recap`, `client-onboarding`, `lead-research`, `proposal-writer` | no | Agency workflows. |
| `chromify` | no | Real browser tools exist (Claude in Chrome, Playwright). |
| `grammar` | no | Use `humanizer` / `elements-of-style`. |
| `search-connectors` | no | Policy lives in CLAUDE.md §4. |

### videos/
| File | Fit | Why |
|---|---|---|
| `videos/clips/README.md` | adapt | Clip-bin note for Jay's master cut; repoint at Patrick's active project and the NLE root (move off iCloud). |

---

## 4. Patrick's real world (evidence summary)

- **Identity:** Patrick, Epsilon LLC (`mock-data.ts:35`), GitHub `QRcode1337`, US Eastern (host clock EDT; all OpenClaw crons `America/New_York`).
- **Agent stack:** OpenClaw gateway (agent `main` = ErisMorn; 15 crons), Hermes gateway (no cron jobs; status error), OmniRoute (combos agem/SmartSpread/codex-first/
  free-stack/top-tier/video), Honcho (`:8000`), LM Studio `qwen3.5-9b` (`:1234`), LTM/unvolta (launchd), claude-mem (`:37777`), Pieces-Vault, Tailscale, Aperture.
- **Routines:** 30 (15 OpenClaw, 15 launchd) — full table in `workspace-drafts/routines/README.md`.
- **Skills:** 183 catalogued, 99 user skills: HyperFrames ×9, Remotion ×14, documentary/video ×8, music ×4, `uap-object-dossier`, `clip-description-matcher`, `graphify`,
  `openclaw-health`, agentdb/flow-nexus/swarm, github-*. 30-day usage is low and dev-centric (codebase-context, systematic-debugging, parallel agents).
- **MCP:** 22 servers (14 user, 4 project incl. `jev`/`exa`/`aperture`/`cmem`, 4 plugin incl. Notion). 5 failing.
- **Notion:** pins Dreams, My Life Wiki, Video Production. Catalog groups: Internet Lore series (Ep 1–4), The Strangest Times (master project, TST-YT script spec,
  OMNI_VEO 90-day plan), Shorts (Batch 1), Ideas (ALIENS AND ANGELS, THE RULERS, EPSILON YouTube packet), playbooks (AI video business, faceless explainer, narrative cadence), creative projects.
- **Launchpad:** services OpenClaw, OmniRoute, Hermes, claude-mem, Honcho; repos Volta-OS, liminal_backrooms, ErisMorn, automaker; Netlify 1 site.
- **Studio:** 9 presets (Hermes Video Pipeline, Hermes Remotion Promo, OpenMontage Composer, Dialectics Video, Remotion Animation Workflow, TikTok Four Files,
  TikTok Warm Grain Grid, Universal Consciousness P1, ffmpeg Tools).
- **Podcast:** VOLTA Daily Briefing, hosts Mira & Dex; topics neuromorphic, BCIs, quantum memristors, photonics, AI, quantum computing, physics, UAP.
- **Research:** roots Science, Artificial Intelligence, Q, VOLTA GRIMIORE (6,886 files); Voltamachine; Windsor holds AARO releases and UAP case files.
- **Feeds:** 26 sources, 343 items, 98 flagged needs-action.
- **Projects folder:** Argus, argus-pneuma, CASCADE (archived), PNEUMA, paperclip, epsilonllc, epsilon-youtube-packet-main, hermes-video-pipeline, OpenMontage,
  RemotionAnimation-Workflow, dialectics(-video), tiktok-*, universal-consciousness-p1, liminal_backrooms, SYNTHETIC-CONSCIOUSNESS, video-production-platform, yt-analyzer…
- **Agent memory:** `~/ErisMorn/MEMORY.md` (active projects ARGUS, Orchestra OS, Voltamachine, EPSILON dormant; CASCADE done), OpenClaw wiki entities (CASCADE, Curator,
  Kalshi bot, Memory Palace, Quantum_VAULT, Voltamachine). No auto-memory index exists for this repo.
- **Caution:** `~/.hermes/SOUL.md` is a persona file whose text tries to disable an agent's refusals and safety filters. Don't import it or link it from the workspace (the CLAUDE.md draft says so).

---

## 5. Gap analysis (what a workspace for Patrick needs)

| Area | Have | Need | Soon-applicable evidence |
|---|---|---|---|
| Identity & context | Jay's owner line | profile, priorities, decisions, glossary, people | ErisMorn `USER.md` still a template; wiki person directory empty |
| Creative | YouTube agency files | channels, calendar, production pipeline, music, podcast | OMNI_VEO 90-day plan, Shorts Batch 1, Suno pending, podcast LaunchAgent unloaded |
| Research | nothing | router, UAP case index, frontier-tech watchlist, ARGUS eval pointer | Research phase 2/3 in HANDOFF; podcast topics |
| Agent fleet | 8 fake routines | services table, real routine map, runbooks, failure triage | 3 failing jobs; `actions.md` blockers |
| Ventures | agency CRM | Epsilon LLC, ARGUS, EPSILON one-pagers | GSA AI clause positioning items closed 2026-10-28 |
| Personal | macros/travel | Dreams + Life Wiki pointers, goals | Notion pins; `/api/notion/dreams` |
| Ops | none | storage map, secrets policy | disk rules in 3 places; secret migration in progress |
| Apps/connectors | Jay's 11 | real CLI/API/MCP index, failing-MCP list | 5 MCP failures |
| Skills | 17 shadows | map of real skills; RL targets that reach the live skills | Editor/Generations teach paths |

---

## 6. Proposal (workspace)

Priority: (1) what the UI and `claude -p` read, (2) what agents use daily, (3) the rest.
"Source" = what an ADD/REPLACE would be filled from. **Auto** = can be generated now from that source; **Input** = needs Patrick.

### KEEP (1)
| File | Note |
|---|---|
| `applications/cli-ffmpeg.md` | Real; used by Studio. |

### ADAPT (25)
| File(s) | Change | Auto/Input |
|---|---|---|
| `skills/cut`, `skills/animate`, `skills/thumb` (P1, load-bearing) | Rewrite bodies for HyperFrames/Remotion/VOLTA Editor and Patrick's channels; **keep the RL Log heading and existing entries** | Auto (from his real skills); thumb references need Input |
| `departments/product.md` | VOLTA OS + Launchpad repos; drop RUBRIC env var, Jev tiers | Auto (HANDOFF, PATHFINDER) |
| `departments/personal.md` | Dreams + My Life Wiki pointers, goals; private | Input |
| `product/jev-router.md` | Describe the real Typesafe JEV (ranking/triage, telemetry on Windsor) | Auto (`src/lib/server/jev`) |
| `product/robo-ui-library.md`, `product/second-brain-spec.md` | Point at `src/components/robo-ui`, Elements; drop the 424,846 fake | Auto |
| `artifacts/robo/*.html` (2) | Re-tag as VOLTA design-system artifacts; verify tokens | Auto |
| `content/thumbnails-log.md` | Empty table for Patrick's uploads | Auto (empty) |
| `routines/pattern.md`, `routines/recos.md`, `routines/yt-analytics.md` | Repoint to Curator / VOLTA Recos / future channel analytics | Auto |
| `applications/api-youtube.md`, `cli-gh.md` | Patrick's channel (soon) / `QRcode1337` repos | Auto + Input (channel id) |
| `applications/mcp-gcal.md`, `mcp-gmail.md` | Keep with drafts-only rule **if** email/calendar are in scope | Input |
| `skills/tone`, `robo`, `wildcard`, `clean-up`, `calibrate`, `note` | Retarget at Patrick's voice corpus, design system, disk playbook, capture | Mixed (tone needs his corpus) |
| `videos/clips/README.md` | Active project clip bin; NLE root off iCloud | Auto |

### REPLACE (12)
| File | With | Auto/Input | Draft |
|---|---|---|---|
| `CLAUDE.md` (P1) | Patrick's router: real departments, real skills map, OmniRoute/no-API-billing, Windsor rules | Auto | ✓ |
| `AGENTS.md` | Real runner split (OpenClaw/launchd/Hermes/claude -p) | Auto | ✓ |
| `MEMORY.md` | Cards pointing at real configs, wiki, audits | Auto | ✓ |
| `departments/content.md` | Creative Studio router | Auto | ✓ |
| `departments/business.md` | Ventures router (Epsilon LLC, ARGUS, EPSILON) | Mostly Input | ✓ |
| `applications/api-media.md` | xAI, ElevenLabs, Gemini TTS, Runway, Replicate (quote first) | Auto | (in applications/README) |
| `content/youtube-calendar.md` | `content/calendar.md` generated from Notion Video Production | Auto + Input | — |
| `personal/goals-2026.md` | Patrick's goals | Input | — |
| `product/rubric-os-roadmap.md` | `product/volta-roadmap.md` from HANDOFF next-up + audits | Auto | — |
| `routines/brandwatch.md`, `inbox.md`, `memory-compact.md` | Real routines (Sentinel/Social/Scout; Action tiers; COMPRESSOR) — or fold into `routines/README.md` | Auto | ✓ (README) |

### REMOVE (37)
`.DS_Store`; `departments/community.md`; `business/` (6); `community/` (3); `content/scripts/` (2), `content/carousels/post-14-arms.md`;
`personal/{health,macros-log,travel}.md`; `artifacts/{betashares,community,rubric}/*` (4); `applications/{api-mfp,cli-aws,cli-premiere,mcp-excalidraw,mcp-slack}.md`;
`routines/{cache-keepalive,deliverables,lead-enrich}.md`; `skills/{automation-audit,call-recap,chromify,client-onboarding,grammar,lead-research,proposal-writer,search-connectors}`.
Also strip the 6 "Applied Recos" fossil blocks from files that stay. Note: seeded nodes keep appearing in the Second Brain until `mock-data.ts` is cleaned (§8).

### ADD (23)
| New file | Purpose | Source | Auto/Input | Draft |
|---|---|---|---|---|
| `context/profile.md` | Who, TZ, projects, working rules | MY-RULES, `~/.claude/CLAUDE.md`, ErisMorn MEMORY | Auto + Input | ✓ |
| `context/priorities.md` | Now-list | `actions.md`, `/api/routines`, HANDOFF, audits | Auto (weekly) | ✓ |
| `context/decisions.md` | Permanent decisions | ErisMorn MEMORY, wiki DECISIONS, HANDOFF | Auto | ✓ |
| `context/glossary.md` | Names agents trip on | all of the above | Auto | ✓ |
| `context/people.md` | Collaborators, platforms, accounts (no credentials) | — | Input | — |
| `departments/research.md` | Research router | `config/research.json`, podcast topics, wiki | Auto | ✓ |
| `departments/agents.md` | Agent-fleet router + services table | `/api/launchpad`, `/api/routines`, ErisMorn MEMORY | Auto | ✓ |
| `research/uap.md` | Case index + evidence standard | Windsor AARO/Bentwaters files, `uap-object-dossier` | Auto + Input | — |
| `research/frontier-tech.md` | Watchlist per podcast topic | `config/podcast.json`, Feeds | Auto | — |
| `research/argus-eval.md` | Pointer card | wiki concept page | Auto | — |
| `content/channels.md` | One row per channel/series | Notion catalog | Auto + Input | — |
| `content/music-vanta-vector.md` | Releases, Suno setup, style rules | `config/music.json`, Music app | Auto + Input | — |
| `content/podcast-briefing.md` | Show bible: hosts, topics, cost caps | `config/podcast.json` | Auto | — |
| `business/epsilon-llc.md` | Company one-pager | `~/Documents/PROJECTS/epsilonllc` | Input | — |
| `business/argus.md` | Product one-pager | argus-pneuma, wiki | Auto + Input | — |
| `business/archive-cascade.md` | Archive note | `~/ErisMorn/CASCADE.md` | Auto | — |
| `personal/dreams.md`, `personal/life-wiki.md` | Pointers to Notion pages (read-only) | Notion links | Auto | — |
| `ops/storage.md` | Volumes, offload, iCloud, secrets policy | `~/.claude/CLAUDE.md`, ErisMorn MEMORY, HANDOFF | Auto | ✓ |
| `ops/runbooks.md` | Restart/repair per service | ErisMorn MEMORY "Environment gotchas", HANDOFF | Auto | — |
| `routines/README.md` | All 30 real routines + fate of template ones | `/api/routines` | Auto (regenerate) | ✓ |
| `routines/daily-briefing.md` | Podcast routine (once loaded) | podcast config, LaunchAgent | Auto | — |
| `applications/README.md` | Real connector + MCP index, failing list | `/api/mcp`, HANDOFF | Auto | ✓ |
| `applications/{api-omniroute,api-lmstudio,api-notion,api-suno,cli-claude,cli-openclaw,cli-hyperframes}.md` | Per-connector cards (template frontmatter) | same | Auto | — |

**Swap totals (workspace): KEEP 1 · ADAPT 25 · REPLACE 12 · REMOVE 37 · ADD 23.**

---

## 7. MICRO_APPS_SPEC fit

`MICRO_APPS_SPEC.md` is the template's spec for 6 apps (Editor, Recos, Generations, Carousels, Scripts, Elements) plus a 4-sub-agent build split.

| Spec section | VOLTA today (feature #) | Built as specced? | Fits Patrick | Verdict |
|---|---|---|---|---|
| Title/intro "RUBRIC AGENTIC OS" | — | — | no | **REPLACE** with VOLTA intro and shared rules from HANDOFF |
| §1 Sub-agent split & file ownership | superseded by INTEGRATION_CONTRACTS + PATHFINDER | n/a | no | **REMOVE** (build history) |
| §2 Editor (5A) | `/apps/editor` (#9): Review mode (spatial pins, box regions, dictation, compiled prompt, Apply & teach) + Edit mode (NLE) | Diverged: real Studio/Generations renders and Notion episode tagging replace the 5 procedural sample scenes; NLE added | yes | **ADAPT**: describe real inputs; drop Jay's project names and BetaShares sample; keep RL contract |
| §2.4 Clipboard prompt format | `components/editor/prompt.ts` | Mostly | yes | **ADAPT**: keep structure, drop sample content |
| §3 Recos (5B) | `/apps/recos` (#12) | Diverged: real signals (failing routines, Systems, Notion playbooks); no savings estimates; no `/api/recos/apply` writing the workspace (cart + copy-prompt remain) | yes | **ADAPT** to the real design |
| §4 Generations (5C) | `/apps/generations` (#11) | Diverged: xAI image/video + ElevenLabs voice, quote → confirm → daily budget; Promote to `/thumb` kept; no wildcard toggle or Flux/Kling/Ideogram/Recraft | yes | **ADAPT** |
| §4 Carousels (5C) | `/apps/carousels` (#12) | Diverged: Shorts decks from Notion (not Instagram) | adapt (Shorts) | **ADAPT** |
| §5 Scripts (5D) | `/apps/scripts` (#12) | Diverged: Notion outlines, source ledgers, teleprompter, push to Editor; no `/tone`/wildcard hook generator | yes | **ADAPT** |
| §5 Elements (5D) | `/apps/elements` (#15) | Largely | yes (platform) | **KEEP** |
| *missing* | LTM, Honcho, Sessions, Search, Second Brain (#1–3) | — | yes | **ADD** (5) |
| *missing* | Tasks, Systems, Feeds, Launchpad (#5–8) | — | yes | **ADD** (4) |
| *missing* | Research (#4) | — | yes | **ADD** (1) |
| *missing* | Studio, Music, Podcast (#10, #13, #14) | — | yes | **ADD** (3) |
| *proposals* | P1 capture inbox · P2 agent-built video presets · P3 VOLTA Cut · P4 agent console + cron controls · P5 channel desk · P6 teach live skills · P7 Dreams · P8 research assistant · P9 ventures board (if confirmed) | not built | soon | **ADD as proposals** (9) |

**Spec totals: KEEP 1 · ADAPT 6 · REPLACE 1 · REMOVE 1 · ADD 13 shipped apps + 9 proposals.**
Apps Patrick uses most, judging by data volume and in-flight work: Tasks, Feeds, Systems, Podcast, Studio, Editor, Research, Search. None of these are in the template spec.
Draft: `workspace-drafts/MICRO_APPS_SPEC.md` (real apps first, contracts kept, removals, proposals with evidence).

---

## 8. Code follow-ups (not done — `src/` is being refactored; do after that lands)

1. `src/lib/mock-data.ts`: replace DEPT_FILES, SKILL_SEED/SKILL_DEPT_LINKS, ROUTINES/ROUTINE_DISPLAY_NAMES, CONNECTORS, ARTIFACT_SEED (BetaShares/Northwind/Stripe…), HOME_CLOCK (Sydney → New York).
   Better: have `/api/workspace` build skills/routines/connectors from the real sources (`/api/skills-real`, `/api/routines`, `/api/mcp`) and drop the seeds.
2. Departments: add `research` and `agents` (and rename business→ventures, content→creative if wanted) in `src/types/os.ts` Department, `DEPT_ROUTERS` + `ARTIFACT_TAG_DEPT` in
   `src/app/api/workspace/route.ts`, labels/colours in `mock-data.ts`. Remove `community` once its seed is gone.
3. `loadRoutines` reads `routines/<seed-id>.md` only; key it off real routine ids or drop it.
4. Proposal P6: Editor apply-feedback and media promote write RL entries to the live `~/.claude/skills/<skill>/SKILL.md` (diff + confirm), with a map /cut→`documentary-video-editing`, /animate→`hyperframes-animation`.
5. `skills/run/reports.ts` simulated reports still mention template paths.

---

## 9. Questions for Patrick

1. **Timezone and one-liner:** America/New_York? In one line, what do you do, and where should income come from over the next 6 months?
2. **Departments:** approve Creative · Research · Agent fleet · VOLTA/builds · Ventures · Personal (Community removed)? OK to add `research`/`agents` to VOLTA's department list after the refactor?
3. **Ventures:** are ARGUS and EPSILON active, dormant, or done? Is a career or job search in scope? (Windsor has an agentic-AI-engineer job description.)
4. **Channels:** which are real and active (The Strangest Times, OMNI_VEO, Internet Lore, Shorts)? Cadence? Channel handle for analytics?
5. **Email/calendar:** should agents use Gmail/Calendar (drafts only), or drop both connector files?
6. **Hermes:** keep, fix (gateway error, no jobs), or retire? Status of Kalshi bot/phantom, paperclip, PNEUMA, Orchestra OS, liminal_backrooms?
7. **Personal:** what belongs here: Dreams, My Life Wiki, goals, health? Anything strictly off-limits to agents?
8. **Deletions:** OK to delete the 37 template files and the 5 failing MCP entries?
9. **Teaching:** should Editor/Generations lessons write to your live `~/.claude/skills` (with a diff and confirm) instead of the workspace copies?
10. **Pending from HANDOFF:** load the 06:00 podcast LaunchAgent? approve research hydration (~4.4k files)? allow cron Run-now/Pause in VOLTA?

## 10. Drafts written

`docs/audits/workspace-drafts/`: `CLAUDE.md`, `AGENTS.md`, `MEMORY.md`, `context/{profile,priorities,decisions,glossary}.md`,
`departments/{content,research,agents,business}.md`, `routines/README.md`, `applications/README.md`, `ops/storage.md`, `MICRO_APPS_SPEC.md`.
To adopt: review, fill the TODOs, copy into `workspace/` (and the repo root for the spec), then delete the REMOVE list. Nothing is committed.
