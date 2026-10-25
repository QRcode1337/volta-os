---
name: note
description: Capture a note into the right department file in the Second Brain.
model: haiku
effort: low
category: artifact
---

# /note

Capture a note into the right department file in the Second Brain.

## When to use
- Explicitly by command (`/note <text>`) or by another skill that needs to persist a fact.
- Routed through Jev; default tier **HAIKU** at **LOW** effort.

## Steps
1. Classify the note into one department (business, content, product, personal, community).
2. Pick the most specific existing file from that department's router; create one only if nothing fits.
3. Append under a dated heading. Keep the user's words; fix only obvious typos.
4. Add a one-line index card to `MEMORY.md` if the note introduces a new entity (client, project, person).

## Learned Preferences (RL Log)
<!-- Appended by RUBRIC Editor / Recos. Newest last. -->

## Applied Recos

### 2026-10-25 · rc-5 · Route /grammar & /note via Jev to Haiku
- Applied: 2026-10-25T03:23:17.064Z
- Source: VOLTA Recos (/apps/recos) · Skills · priority
- Expected impact: Saves ~$6.20/wk
- Change: Set model: haiku and effort: low in skills/grammar/SKILL.md and skills/note/SKILL.md, and add "jev: prefer-haiku" to both frontmatters.
