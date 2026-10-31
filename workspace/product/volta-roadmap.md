# VOLTA roadmap

> Replaces the template `rubric-os-roadmap.md`. Source of truth: `~/Volta-OS/docs/HANDOFF.md` "Next up" (2026-10-25)
> and the 2026-10-27/28 audits in `~/Volta-OS/docs/audits/`. Update HANDOFF first; this is a pointer list.

## Next up (HANDOFF order)
1. **Launchpad:** list real GitHub repos with `GITHUB_TOKEN` (most local repos are iCloud placeholders).
2. **Feeds:** tighten JEV triage (too many items marked needs-action).
3. **Research phase 2:** shipped 2026-10-30. Embeddings + 48 semantic threads on Windsor, hybrid search, nearest-by-meaning; built from local metadata, no iCloud hydration. Next: full text from Voltamachina mirror PDFs. Phase 3: cited research assistant.
4. **iPhone/iPad capture:** "Share to VOLTA" Shortcut → token-auth inbox route.
5. **Agent-built video** presets in Studio.
6. **VOLTA Cut:** Editor timeline → HyperFrames/Remotion project → Studio render.
7. **Orchestra OS ports:** agent 1:1 chat, status cards, faster routine reads; cron Run-now/Pause needs Patrick's OK.
8. **Housekeeping:** `/api/cache-status` mock numbers; claude-mem observer credentials; dead tailnet link.

## From the 2026-10-28 workspace audit
- Done 2026-10-28: workspace rebuilt for Patrick; departments now Business·EPSILON, Content·TST, Research, Agent fleet, VOLTA, Personal; template seeds removed from `/api/workspace`.
- Proposed: P5 channel desk (TST calendar + analytics), P9 ventures board (EPSILON pipeline + ARGUS), P6 teach live skills. See `~/Volta-OS/MICRO_APPS_SPEC.md` §4.
- `src/app/api/skills/run/reports.ts` simulated reports still mention template clients.
