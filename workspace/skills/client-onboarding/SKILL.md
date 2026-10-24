---
name: client-onboarding
description: Spin up client folders, kickoff docs and shared trackers.
model: sonnet
effort: high
category: self-triggered
---

# /client-onboarding

Spin up client folders, kickoff docs and shared trackers. Self-triggers when a proposal is marked "signed"
in `business/pipeline.md`.

## When to use
- Triggered by the agent when the task pattern matches (signed proposal, "kick off <client>").
- Routed through Jev; default tier **SONNET** at **HIGH** effort.

## Steps
1. Create `business/clients/<slug>.md` sections: Contacts · Scope · Access needed · Cadence · Risks.
2. Create `artifacts/<slug>/` and a kickoff agenda (`kickoff.md`) from the proposal's phase plan.
3. Add the client to the `deliverables tracker sync` routine inputs.
4. Draft the welcome email (business register), access-request checklist, and first-week calendar holds.
5. Append index cards to `MEMORY.md` under Business.

## Learned Preferences (RL Log)
<!-- Appended by RUBRIC Editor / Recos. Newest last. -->
