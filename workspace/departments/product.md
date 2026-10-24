# Product — Department Router

> RUBRIC Agentic OS itself: the dashboard, /robo UI kit, Jev router, Second Brain, micro-apps.

## Files
- `product/rubric-os-roadmap.md` — Milestones, micro-app list, what ships next.
- `product/robo-ui-library.md` — Component inventory (HudPanel, ModelEffortBadge, PixelMascotLogo, Toggle, Modal, Toast).
- `product/jev-router.md` — Classification heuristics, override threshold (0.80), telemetry schema.
- `product/second-brain-spec.md` — Sphere / ring / bubbles / timeline views and data contract.

## Skills used here
`/robo` (all UI), `/clean-up` (dev box hygiene), `/calibrate` (skill tuning), `/search-connectors`, `/chromify`.

## Rules
- The OS bridge only writes inside `./workspace`.
- Live `claude -p` execution is opt-in (`RUBRIC_CLAUDE_LIVE=1`); default is simulated.
- No hydration mismatches: deterministic seeds in render paths.
