---
name: call-recap
description: Turn call transcripts into decisions, action items and follow-up email drafts.
model: haiku
effort: high
category: self-triggered
---

# /call-recap

Turn call transcripts into decisions, action items and follow-up email drafts. Self-triggers when a new
transcript appears from the meeting recorder.

## When to use
- Triggered by the agent when the task pattern matches (transcript file lands, "recap that call").
- Routed through Jev; default tier **HAIKU** at **HIGH** effort — extraction, not invention.

## Output sections
1. **Decisions** — bullet list, each with who decided.
2. **Action items** — owner · task · due date (convert relative dates to absolute, AEST).
3. **Open questions** — anything unresolved.
4. **Follow-up email draft** — business register, ≤ 120 words, never sent automatically.

Append the recap to the client file and a one-line card to `MEMORY.md`.

## Learned Preferences (RL Log)
<!-- Appended by RUBRIC Editor / Recos. Newest last. -->
