# VOLTA — Department Router

> VOLTA OS itself (`~/Volta-OS`, `localhost:50000`) and Patrick's other software builds. Keeps the `product.md` filename so
> VOLTA's Second Brain files it under `product` (labelled "VOLTA").

## Files
- `product/volta-roadmap.md` — what ships next (from `docs/HANDOFF.md` "Next up" and the 2026-10-28 audits).
- `product/jev-router.md` — JEV: tier routing for skill runs, feeds triage, ranking. Owned by the JEV work; read, don't restate.
- `product/robo-ui-library.md` — `/robo` component inventory (`src/components/robo-ui`, Elements app).
- `product/second-brain-spec.md` — Second Brain views and data contract.
- Repo docs: `~/Volta-OS/docs/HANDOFF.md`, `~/Volta-OS/MICRO_APPS_SPEC.md`, `~/Volta-OS/INTEGRATION_CONTRACTS.md`, `~/Volta-OS/PATHFINDER-2026-10-28/`.
- Other builds (ARGUS, MBRSP, Phantom…): `business/ventures/`.

## Skills used here
`/robo` (all UI) · `/clean-up` (dev box hygiene) · `/calibrate` (skill tuning) · `superpowers:systematic-debugging` ·
`superpowers:verification-before-completion` · `claude-mem:mem-search` (earlier work).

## Rules
- The OS bridge only writes inside `./workspace`, `config/`, or `/Volumes/Windsor/VOLTA/**`.
- Local-only guards, read-only data sources, no API billing for text, quote-before-spend, honest data (no fake numbers or seeds shown as real).
- No hydration mismatches: deterministic seeds in render paths.
- Finished batches: commit with a sensible message, push to main, then test (Patrick's rule) — only when Patrick asks for the commit.
