---
name: thumb
description: Thumbnail reference database for The Strangest Times: archetypes, rules, and real A/B results.
model: sonnet
effort: high
category: database
---

# /thumb

Thumbnail reference database for The Strangest Times (long-form) and Shorts covers. Every brief is generated from this
database plus a wildcard slot (`/wildcard`). Results flow back via `content/thumbnails-log.md` (real CTR only) and
VOLTA Generations "Promote to /thumb".

## When to use
- Any new long-form upload: brief 5 concepts, render 2, A/B the best pair (YouTube Test & Compare).
- Called by VOLTA Generations when an image is promoted as a reference.

## Layout archetypes (hypotheses until the log has data)

| # | Archetype            | Description                                                          | Measured CTR |
|---|----------------------|----------------------------------------------------------------------|-------------:|
| 1 | The Document         | One real declassified page or artifact, one highlighted line, 2–3 word tag | — |
| 2 | Object in the Dark   | Single glowing object (craft, artifact, symbol) on near-black         | — |
| 3 | Map + Marker         | Globe/map crop with one marker and a date                             | — |
| 4 | Then / Now           | Split frame: ancient source vs modern photo or claim                  | — |

## Rules
- Max **3 words** of text. Text height ≥ 18% of frame. Readable at 168×94 px.
- One accent color per thumbnail. No fake "evidence": a reconstruction is styled so it can't pass as a real photo.
- The thumbnail promise must be paid off in the first 30 seconds (the "one named document" rule).
- Never reuse the previous upload's archetype. CTR numbers only from YouTube Analytics.

## Wildcard slot
Every brief of 5 concepts includes exactly **1 WILDCARD** that uses no archetype above. A wildcard that beats the batch
median CTR twice becomes a new archetype row.

## Learned Preferences (RL Log)
<!-- Appended by VOLTA Editor / Generations / Recos. Newest last. Entries dated before 2026-10-28 came from the template sample project ("Claude 5.5 Agentic OS" master cut) — treat them as generic motion/pacing defaults, not Patrick-specific taste. -->
- 2026-10-12 · Prefer real dashboard screenshots over mockups; mockups lost 3 of 3 A/B tests.
- 2026-10-21 · Tag text in Outfit 700, not Doto, when there is also a face in frame.
