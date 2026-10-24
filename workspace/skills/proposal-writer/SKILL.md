---
name: proposal-writer
description: Draft client proposals as /robo HTML decks from call recaps and pricing.
model: opus
effort: high
category: self-triggered
---

# /proposal-writer

Draft client proposals as /robo HTML decks from call recaps and pricing. Self-triggers after a `/call-recap`
whose decision list contains "send proposal".

## When to use
- Triggered by the agent when the task pattern matches (post-discovery, "send them something").
- Routed through Jev; default tier **OPUS** at **HIGH** effort — client-facing, persuasive, priced.

## Inputs
- `business/clients/<client>.md` (call recap, pains, stakeholders)
- `business/pricing.md` (rate card v4 — never go below the floor)
- `/robo` for layout, `/tone` business register for copy

## Deck structure (8 slides, 1280×720)
1. Title — client name, one-line outcome, date.
2. **Price up front** — the recommended tier and monthly figure (RL Log 2026-10-17 in `/robo`).
3. What we heard — 3 pains in the client's own words.
4. The plan — 3 phases with weeks.
5. ROI — hours saved/week × loaded hourly cost; payback period.
6. Tiers — max 3, middle one recommended.
7. Proof — 2 case studies, numbers only.
8. Next step — single CTA with a date.

## Output
`artifacts/<client>/proposal-<slug>.html` + index card in `MEMORY.md`. Draft only; never send.

## Learned Preferences (RL Log)
<!-- Appended by RUBRIC Editor / Recos. Newest last. -->
