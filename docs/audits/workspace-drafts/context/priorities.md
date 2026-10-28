# Priorities — now

> DRAFT 2026-10-28. Regenerate weekly (proposed routine: Friday with VOLTA Recos). Sources: `~/.openclaw/wiki/main/actions.md`
> (open `[ ]`, in-progress `[@]`, blocked `[!]`), `/api/routines` last status, VOLTA `docs/HANDOFF.md` "Next up" and the
> 2026-10-27 micro-apps audit. Patrick reorders; agents only append.

## Security and fleet health (blocking)
- [!] Finish the full-host scan for the compromised LiteLLM v1.107.0 release; pin below it. (actions.md)
- [@] Migrate the leftover plaintext secrets flagged by `openclaw secrets audit`. (actions.md)
- [@] Rotate the OpenCode-console-linked provider keys, and the keys HANDOFF lists as pasted or leaked. (actions.md, HANDOFF)
- [@] Update host Node.js (TLS cert-key patch) to unblock `openclaw update`. (actions.md)
- [!] Sentinel `x_search` fails with xAI 404 on the model id. (actions.md)
- [!] Scout went silent 10-23/24; no curated synthesis; `memory/raw/daily/` missing. (actions.md)
- Action Orchestrate (Tier 2) last run: error. Hermes gateway and OmniRoute autostart: error. (`/api/routines`)

## VOLTA OS (HANDOFF "Next up", in order)
1. Launchpad: list real GitHub repos with the GitHub token (84 of 91 local repos are iCloud placeholders).
2. Feeds: tighten JEV triage (98 of 343 items flagged needs-action).
3. Research phase 2: embeddings + clusters (needs Patrick's OK for batched iCloud hydration).
4. iPhone/iPad "Share to VOLTA" capture inbox.
5. Agent-built video presets in Studio. 6. VOLTA Cut (Editor timeline → HyperFrames/Remotion). 7. Orchestra OS ports.
- Move Editor working files off iCloud (audit top-1).

## Creative (soon-applicable)
- The Strangest Times / OMNI_VEO 90-day channel plan and Shorts Batch 1 in Notion → needs a channel calendar here.
- Suno for VANTA VECTOR waits on Patrick adding the Suno cookie to the suno-api service.
- Daily Briefing LaunchAgent (06:00) written but not loaded: Patrick to decide.

## Ventures
- EPSILON/ARGUS federal positioning items closed 2026-10-28 → TODO: next step (capability statement refresh? outreach?).

## Patrick's decisions waiting (from HANDOFF)
- Load the podcast LaunchAgent? · Approve research hydration (~4.4k files)? · Allow cron Run-now/Pause in VOLTA?
