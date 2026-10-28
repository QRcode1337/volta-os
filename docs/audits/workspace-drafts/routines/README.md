# Routines — index

> DRAFT 2026-10-28. Generated from VOLTA `GET /api/routines` (30 routines: OpenClaw cron + launchd). Times are America/New_York.
> VOLTA's Home and Second Brain already read the live list; this file is for agents, so they know what runs, when, and where output lands.
> Regenerate it rather than hand-editing schedules. Status = last run as of 2026-10-28.

## OpenClaw cron (agent `main`)
| Routine | Schedule | Last | Output / where to look |
|---|---|---|---|
| Heartbeat (main) | every 30 m | ok | — |
| COMPRESSOR — Memory Auto-Compression | 04:00 daily | ok | Feeds "COMPRESSOR" |
| Identity Guardian — Protect Core Identity Files | 06:00 daily | ok | Feeds |
| Sentinel — External Signal Monitor | 07:00, 13:00, 19:00 | ok | Feeds "Sentinel"; `x_search` failing (actions.md) |
| Action Capture (Tier 1) | 07:30 daily | ok | `~/.openclaw/wiki/main/actions.md` |
| Discord Monitor — Daily Archive | 09:05 daily | ok | Discord archive (ErisMornCloud) |
| Cron Health Supervisor — Daily Report | 09:10 daily | ok | Feeds "Cron Health" |
| Quantum_VAULT MTProto Archive | 09:20 daily | ok | Feeds |
| Action Orchestrate (Tier 2) | 09:30 daily | **error** | actions.md |
| Social Monitor — Moltbook/X Signals | 09:50, 21:50 | ok | Feeds |
| Scout — Proactive Discovery | 11:30 daily | ok | Feeds "Scout"; silent 10-23/24 (actions.md) |
| Action Digest (Tier 3) | 18:00 daily | ok | Feeds "Action Digest" |
| Curator — Knowledge Synthesis | 18:45 daily | skipped | Feeds "Curator" |
| Weekly Soul & Memory Integrity Check | Sun 03:00 | ok | Feeds |
| Action Weekly Rollup (Tier 3) | Sun 17:00 | skipped | Feeds "Weekly Rollup" |

## launchd
| Job | Schedule | Last |
|---|---|---|
| com.patrick.desktop-mirror | 02:30 daily | ok |
| com.local.openclaw-manual-backup | 03:15 daily | ok |
| ai.omniroute.scheduled-restart | 04:15 daily | ok |
| com.unvolta.ltm-prune | 04:30 daily | ok |
| com.unvolta.ltm-ingest | every 30 m | ok |
| com.unvolta.ltm-daemon | keep-alive | ok |
| ai.omniroute.breaker-decay | every 1 h | ok |
| com.patrick.cloudkit-watchdog | every 6 h | ok |
| com.local.cache-cleanup | Sat 10:00 | — |
| com.local.openclaw-health | Mon 09:00 | — |
| ai.openclaw.gateway | keep-alive | ok |
| ai.hermes.gateway | keep-alive | **error** |
| com.omniroute.autostart | keep-alive | **error** |
| com.patrick.hermes-revert | yearly Jul 7 | — |
| ai.openclaw.nocodex-revert | yearly Oct 7 | — |

## Written but not loaded
- `com.epsilon.volta-podcast` — VOLTA Daily Briefing at 06:00. Waiting on Patrick's OK.

## Template routines this replaces
| Template file | Fate | Real counterpart |
|---|---|---|
| `brandwatch.md` | replace | Sentinel + Social Monitor + Scout |
| `inbox.md` | replace | Action Capture → Orchestrate → Digest (no Gmail digest exists) |
| `memory-compact.md` | replace | COMPRESSOR + Weekly Soul & Memory Integrity Check |
| `pattern.md` | adapt | Curator — Knowledge Synthesis (closest analogue) |
| `recos.md` | adapt | VOLTA Recos (on demand from real signals; no cron) |
| `yt-analytics.md` | adapt, soon | Channel analytics once The Strangest Times / OMNI_VEO uploads start |
| `deliverables.md`, `lead-enrich.md`, `cache-keepalive.md` | remove | none |

Per-routine files (`routines/<slug>.md`, frontmatter `id/name/time/days/runner/mode/cap_usd`) are optional; add one only when a routine
needs agent instructions beyond its OpenClaw prompt. Note: VOLTA only parses `mode`/`cap_usd` for the template seed ids today.
