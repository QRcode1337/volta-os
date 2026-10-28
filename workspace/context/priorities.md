# Priorities — now

> Updated 2026-10-28 with Patrick's answers. Regenerate weekly (proposed: Friday with VOLTA Recos). Sources:
> Patrick (2026-10-28), `~/.openclaw/wiki/main/actions.md` (open `[ ]`, in-progress `[@]`, blocked `[!]`), `/api/routines`,
> VOLTA `docs/HANDOFF.md` "Next up", IFTTT activity feed. Patrick reorders; agents only append.

## 1. EPSILON LLC — first clients (top business priority)
- [ ] Pick one offer and one niche for the first 30 days (see `business/epsilon.md` — AI optimization + digital marketing).
- [ ] Fix the site so it sells that offer: epsilonsec.ai still runs the older "Choose Your Path" page (CASCADE / ARGUS / PRISM VECTOR) and a template contact line.
- [ ] Build a 50-prospect list and draft the first outreach sequence (drafts only; Patrick sends).
- [ ] Set pricing (TODOs in `business/epsilon.md`).
- [ ] Make one proof asset: a before/after AI-visibility audit of a real local business (with permission) or of epsilonsec.ai itself.
- [ ] Business email: Google Workspace for the domain was reported suspended around 2026-08; confirm outreach email works before sending anything. [1 src: claude-mem]

## 2. The Strangest Times — ad revenue + sponsors
- [ ] Publish on a cadence (OMNI_VEO plan: 1 Short/day + 1 long episode/week). The channel needs uploads before YouTube Partner Program thresholds can be reached.
- [ ] Confirm the YouTube channel URL/handle so analytics can be wired (`routines/yt-analytics.md`).
- [ ] Ship VIDEO_1 (18 storyboard frames done; self-recorded narration; one clip licence to clear). [Notion Ledger, claude-mem]
- [ ] TikTok "Four Files, One Sky" trailer (74 s) awaiting Patrick's approval since 2026-09-30. [Pieces, claude-mem]
- [ ] Sponsor one-pager once there are real channel numbers (no invented stats).

## 3. Automations and fleet health
- IFTTT failures in the last 31 days: X → Discord (trigger errors 09-28, 10-16), The Strangest Times link post → Discord (10-06, 10-16), Google Docs → Dropbox (10-05, 10-14), Facebook photo backups (10-11, 10-21, 10-25). See `applications/ifttt.md`.
- [!] Full-host scan for the compromised LiteLLM v1.107.0 release; pin below it. (actions.md)
- [@] Migrate leftover plaintext secrets flagged by `openclaw secrets audit`; rotate keys HANDOFF lists as pasted or leaked. (actions.md, HANDOFF)
- [@] Update host Node.js (TLS cert-key patch) to unblock `openclaw update`. (actions.md)
- [!] Sentinel `x_search` fails with xAI 404 on the model id; Scout went silent 10-23/24. (actions.md)
- Action Orchestrate (Tier 2), Hermes gateway and OmniRoute autostart last status: error. (`/api/routines`)

## 4. VOLTA OS (HANDOFF "Next up", in order)
1. Launchpad: list real GitHub repos with the GitHub token. 2. Feeds: tighten JEV triage. 3. Research phase 2 (needs OK for iCloud hydration).
4. iPhone/iPad "Share to VOLTA" capture inbox. 5. Agent-built video presets in Studio. 6. VOLTA Cut. 7. Orchestra OS ports.
- Move Editor working files off iCloud.

## Patrick's decisions waiting
- Load the 06:00 podcast LaunchAgent? · Approve research hydration (~4.4k files)? · Allow cron Run-now/Pause in VOLTA?
- Should agents use Gmail/Calendar (drafts only)? · Keep, fix or retire Hermes? · Should Editor lessons write to live `~/.claude/skills`?
