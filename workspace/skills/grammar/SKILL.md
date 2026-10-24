---
name: grammar
description: Fast grammar and clarity pass on any draft.
model: haiku
effort: low
category: artifact
---

# /grammar

Fast grammar and clarity pass on any draft. Runs after `/tone`; never changes voice, only correctness.

## When to use
- Explicitly by command or by another skill (always last before publish).
- Routed through Jev; default tier **HAIKU** at **LOW** effort.

## Rules
- Australian English spelling for community and business; US English for YouTube titles.
- Fix: typos, agreement, punctuation, doubled words, ambiguous pronouns.
- Do not: rewrite sentences for style, remove contractions, add Oxford commas to titles.
- Return a diff-style list of changes, then the clean text.

## Learned Preferences (RL Log)
<!-- Appended by RUBRIC Editor / Recos. Newest last. -->
