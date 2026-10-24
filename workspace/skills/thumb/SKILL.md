---
name: thumb
description: YouTube thumbnail reference database with winning layouts and CTR notes.
model: sonnet
effort: high
category: database
---

# /thumb

YouTube thumbnail reference database with winning layouts and CTR notes. Every new thumbnail brief is
generated from this database plus a 20% wildcard slot. Results flow back in via `content/thumbnails-log.md`
and RUBRIC Generations "Promote to /thumb".

## When to use
- Any new long-form upload (brief 5 concepts, render 2, A/B the best pair).
- Called by RUBRIC Generations when an image is promoted as a reference.
- Routed through Jev; default tier **SONNET** at **HIGH** effort.

## Layout archetypes (ranked by median 48h CTR)

| # | Archetype          | Description                                                   | Median CTR | Uses |
|---|--------------------|---------------------------------------------------------------|-----------:|-----:|
| 1 | Screen + Face Left | Dashboard screenshot right 60%, face left, 3-word orange tag  | 9.4%       | 11   |
| 2 | Big Number         | One Doto number (e.g. "424,846") + tiny label, no face        | 8.7%       | 6    |
| 3 | Before / After     | Split frame, red-tinted left, clean right, arrow in `#FF5500` | 8.1%       | 4    |
| 4 | Object Hero        | Single glowing object (orb, ring) centered on obsidian        | 7.6%       | 3    |

## Reference entries (top performers)

| Video                                   | Archetype | CTR 48h | Notes                                           |
|-----------------------------------------|-----------|--------:|-------------------------------------------------|
| Claude 5.5 Agentic OS — full build      | 1         | 9.8%    | Orange "MY OS" tag outperformed "FULL BUILD" by 1.6pt |
| Why your MCPs are draining context      | 3         | 8.9%    | Red token meter on left read instantly at mobile size |
| Database skills vs wildcards            | 2         | 8.2%    | "80/20" in Doto, no face; best on browse surface |
| Prompt cache explained                  | 2         | 7.9%    | "$4.92" outperformed "$5" — specific numbers win |
| Second Brain tour                       | 4         | 7.4%    | Orb alone underperformed; adding 1 label +0.7pt |

## Rules
- Max **3 words** of text. Text height ≥ 18% of frame. Readable at 168×94 px.
- One orange element per thumbnail. Background obsidian or a real screenshot, never a gradient.
- Face (when used) looks at the text or the object, never at camera, eyes in the top third.
- Never reuse the previous upload's archetype.

## Wildcard slot
Every brief of 5 concepts includes exactly **1 WILDCARD** that uses no archetype above (see `/wildcard`).
If a wildcard beats the batch median CTR by ≥ 1pt it becomes a new archetype row.

## Learned Preferences (RL Log)
<!-- Appended by RUBRIC Editor / Recos / Generations. Newest last. -->
- 2026-10-12 · Prefer real dashboard screenshots over mockups; mockups lost 3 of 3 A/B tests.
- 2026-10-21 · Tag text in Outfit 700, not Doto, when there is also a face in frame.
