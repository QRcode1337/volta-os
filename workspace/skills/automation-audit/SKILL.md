---
name: automation-audit
description: Audit a client workflow and rank automation opportunities by ROI.
model: sonnet
effort: medium
category: self-triggered
---

# /automation-audit

Audit a client workflow and rank automation opportunities by ROI. Self-triggers when a client file gains a
"Workflows" section with 3+ entries.

## When to use
- Triggered by the agent when the task pattern matches (process walkthrough recorded, "what should we automate?").
- Routed through Jev; default tier **SONNET** at **MEDIUM** effort.

## Scoring
`ROI score = (hours/week × people × $/hr × 52) ÷ (build days × day rate)` — rank descending.
Flag anything with a human-judgment step as "assist, don't automate".

## Output
A `/robo` report at `artifacts/<client>/automation-audit-report.html` (printed to PDF): workflow table,
top 3 picks with build estimate, risks, and a 30-day plan.

## Learned Preferences (RL Log)
<!-- Appended by RUBRIC Editor / Recos. Newest last. -->
