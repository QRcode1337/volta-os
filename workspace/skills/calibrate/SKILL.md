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
- Explicitly by command (`/calibrate <skill>`), or from VOLTA Recos when a skill's RL Log exceeds 12 entries.
- Tier routed by JEV (see `product/jev-router.md`); default **SONNET** at **MEDIUM** effort.

## Steps
1. Read the target skill and its RL Log.
2. Group entries by section they affect. An entry is **stable** if it has not been contradicted for 14 days.
3. Rewrite the affected body sections to include stable entries; keep wording minimal.
4. Move folded entries to `skills/<name>/RL-ARCHIVE.md` with the date folded. Keep unstable entries in the log.
5. Report: entries folded, entries kept, sections changed (as a diff).

## Learned Preferences (RL Log)
<!-- Appended by VOLTA Editor / Recos. Newest last. Entries dated before 2026-10-28 are template-era defaults. -->
