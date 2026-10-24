---
name: lead-research
description: Enrich inbound leads with company, stack and buying-signal research.
model: haiku
effort: high
category: self-triggered
---

# /lead-research

Enrich inbound leads with company, stack and buying-signal research. Self-triggers when a new lead lands in
the LEADS email category or `business/pipeline.md` gains a row with an empty "Research" column.

## When to use
- Triggered by the agent when the task pattern matches (new lead, "who is this?", pre-call prep).
- Routed through Jev; default tier **HAIKU** at **HIGH** effort — breadth over depth.

## Steps
1. Resolve the company domain from the sender address; skip free-mail domains (ask instead).
2. Pull: headcount band, funding stage, HQ timezone, tech stack signals (job posts, public repos, site headers).
3. Score buying signals 0–5: hiring ops roles, recent funding, manual-process complaints, existing AI tooling.
4. Write a 10-line brief to `business/clients/<slug>.md` (create if missing) and update the pipeline row.
5. Recommend next action: book call / nurture / disqualify, with one-line reason.

## Output
`Lead brief · <Company> · fit 4/5 · signal: hiring 2 RevOps roles · next: book discovery call`

## Learned Preferences (RL Log)
<!-- Appended by RUBRIC Editor / Recos. Newest last. -->
