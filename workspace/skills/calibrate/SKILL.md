---
name: calibrate
description: Re-tune a skill against recent feedback and RL log entries.
model: sonnet
effort: medium
category: artifact
---

# /calibrate

Re-tune a skill against recent feedback and RL log entries. Folds stable RL Log entries back into the skill
body so the log stays short and the body stays true.

## When to use
- Explicitly by command (`/calibrate <skill>`), or by the Friday recos routine when a skill's RL Log exceeds 12 entries.
- Routed through Jev; default tier **SONNET** at **MEDIUM** effort.

## Steps
1. Read the target skill and its RL Log.
2. Group entries by section they affect. An entry is **stable** if it has not been contradicted for 14 days.
3. Rewrite the affected body sections to include stable entries; keep wording minimal.
4. Move folded entries to `skills/<name>/RL-ARCHIVE.md` with the date folded. Keep unstable entries in the log.
5. Report: entries folded, entries kept, sections changed (as a diff).

## Learned Preferences (RL Log)
<!-- Appended by RUBRIC Editor / Recos. Newest last. -->
