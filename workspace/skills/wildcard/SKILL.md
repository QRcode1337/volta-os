---
name: wildcard
description: Anti-overfitting directive: every batch is 80% corpus-aligned, 20% novel.
model: sonnet
effort: medium
category: database
---

# /wildcard

Anti-overfitting directive: every batch is 80% corpus-aligned, 20% novel. Database skills (`/tone`, `/thumb`,
`/robo`) learn from winners; if they only ever see winners they converge on one look and one voice. The
wildcard slot is how the system keeps exploring.

## When to use
- Automatically for any generative batch of **5 or more** items (hooks, titles, thumbnails, Shorts concepts, outreach subject lines).
- Manually with `/wildcard <batch>` to re-roll the novel slice of an existing batch.
- Tier routed by JEV (see `product/jev-router.md`); default **SONNET** at **MEDIUM** effort.

## The 80/20 directive
1. Generate the batch with the relevant database skill. Count `n`.
2. Reserve `ceil(n × 0.2)` slots as **WILDCARD**. The remaining slots are **CORPUS**.
3. CORPUS items must match an existing pattern in the database skill (cite which one).
4. WILDCARD items must break **at least one** of: structure, register, archetype, color, rhythm. Name what was broken.
5. Label every item `CORPUS` or `WILDCARD` in the output. Never hide which is which.
6. Never let the wildcard be a strawman. It must be something you would genuinely ship.

## Scoring & promotion
- Track each wildcard's metric (CTR, saves, reply rate) against the batch median.
- **Promote** a wildcard into the database skill after it beats the median in **2 consecutive** batches.
- **Retire** a corpus pattern after it trails the median in **4 consecutive** batches.
- Log promotions/retirements in the target skill's RL Log with the metric delta.

## Guardrails
- Wildcards never break brand safety (`/robo` don'ts, `/tone` banned words still apply).
- EPSILON client deliverables: the wildcard is offered as an "alternate direction" page, never mixed into the main proposal.
- Documentary content: a wildcard may break style, never sourcing.

## Learned Preferences (RL Log)
<!-- Appended by VOLTA Editor / Recos. Newest last. Entries dated before 2026-10-28 are template-era defaults. -->
- 2026-10-14 · Wildcard 20% slice should animate in after the 80% block, not simultaneously (explainer videos).
