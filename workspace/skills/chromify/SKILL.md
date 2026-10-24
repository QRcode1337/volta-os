---
name: chromify
description: Drive the browser to complete a web task end to end.
model: sonnet
effort: high
category: artifact
---

# /chromify

Drive the browser to complete a web task end to end — dashboards without APIs, form-heavy portals,
visual QA of published artifacts.

## When to use
- Explicitly by command, only after `/search-connectors` confirms no CLI or API covers the task.
- Routed through Jev; default tier **SONNET** at **HIGH** effort.

## Rules
- Never enter passwords, payment details or 2FA codes. Stop and hand back to Jay.
- Never click send/submit/publish without explicit confirmation in the current session.
- Decline non-essential cookies. Screenshot before and after every irreversible step.
- Log the URL path (no query strings) and outcome in the run report.

## Learned Preferences (RL Log)
<!-- Appended by RUBRIC Editor / Recos. Newest last. -->
