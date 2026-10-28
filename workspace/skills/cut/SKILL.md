---
name: cut
description: Assemble documentary cuts from narration and footage: pacing, dead-air trims, jump-cut cover, chapter beats.
model: opus
effort: high
category: artifact
---

# /cut

Assemble cuts for The Strangest Times (long-form) and Shorts. Input: narration audio with a word-level transcript
(Patrick's own voice or TTS), the episode's source ledger, and Studio renders / Generations clips. Output: a cut list
markdown file plus a timeline VOLTA Editor (Edit mode) can load; heavy renders go through Studio (HyperFrames/Remotion/ffmpeg).

## When to use
- After narration is recorded and visuals are rendered, before `/thumb`.
- Re-run on any clip with status CHANGES REQUESTED in VOLTA Editor.
- Real skill for the craft: `documentary-video-editing`; this file holds VOLTA's learned preferences.

## Steps
1. Align the transcript to the script (Notion VOLTA Scripts); mark retakes (same line spoken 2+ times).
2. Keep the **last clean take** of each line unless the RL Log says otherwise.
3. Trim dead air longer than the threshold below; keep room-tone handles.
4. Every claim on screen must match a source-ledger entry; flag unsourced lines instead of cutting around them.
5. Cover jump cuts with B-roll, archival document close-ups or a J-cut; never leave a bare jump on a talking head.
6. Long-form: mark chapter beats every 2–4 minutes for YouTube chapters. Shorts: hook in the first 1.5 s, no dead air at all.
7. Export `videos/clips/<nn>-<slug>.cut.md` (cut list); concat/proxies via `ffmpeg` (`applications/cli-ffmpeg.md`).

## Parameters (defaults; RL Log overrides)

| Parameter               | Long-form | Shorts |
|-------------------------|-----------|--------|
| Dead-air threshold      | 0.6 s     | 0.25 s |
| Room-tone handles       | 4 frames  | 2 frames |
| B-roll cover on jump    | 6 frames  | 4 frames |
| Frame rate              | 30 fps    | 30 fps (1080×1920) |

## Output format
```
CLIP 03 · The Document · 04:12 → 06:40
- 00:00:17:12  trim 1.1s dead air
- 00:00:41:03  jump cut            cover: 6f archival close-up (ledger #4)
- 00:00:58:20  retake → keep take 3
- 00:02:10:00  CHAPTER "What the file actually says"
```

## Learned Preferences (RL Log)
<!-- Appended by VOLTA Editor / Generations / Recos. Newest last. Entries dated before 2026-10-28 came from the template sample project ("Claude 5.5 Agentic OS" master cut) — treat them as generic motion/pacing defaults, not Patrick-specific taste. -->
- 2026-10-18 · Dead-air threshold lowered to 0.6 s for screen walkthrough segments.
- 2026-10-22 · Never cut on the word "so" at the start of a walkthrough line — it's the voice's signature.

### 2026-10-23 · RUBRIC Editor feedback (Pin #2 & Pin #4)
_Project: Claude 5.5 Agentic OS — Master Cut v3_

- **Rule (pacing):** Auto-trim any dead-air pause longer than `0.4s`, especially right before UI popovers or scene transitions.
- **Rule (cut smoothing):** Cover abrupt jump cuts with ≥ 6 frames (0.2s @ 30fps) of B-roll or a 4-frame J-cut; never leave a bare jump cut on a talking head.
- _Evidence:_ Pin #2 (Clip 02 Home Dashboard Overview @ 00:02:08): "Cut the 1.8s dead air pause right before the Haiku/Sonnet/Opus matrix popover opens."
- _Evidence:_ Pin #4 (Clip 01 Hook @ 00:00:41): "Jump cut here feels abrupt — add 6 frames of B-roll to cover it."

### 2026-10-25 · VOLTA Editor feedback (Pin #2 & Pin #4)
_Project: Claude 5.5 Agentic OS — Master Cut v3_

- **Rule (pacing):** Auto-trim any dead-air pause longer than `0.4s`, especially right before UI popovers or scene transitions.
- **Rule (cut smoothing):** Cover abrupt jump cuts with ≥ 6 frames (0.2s @ 30fps) of B-roll or a 4-frame J-cut; never leave a bare jump cut on a talking head.
- _Evidence:_ Pin #2 (Clip 02 Home Dashboard Overview @ 00:02:08): "Cut the 1.8s dead air pause right before the Haiku/Sonnet/Opus matrix popover opens."
- _Evidence:_ Pin #4 (Clip 01 Hook @ 00:00:41): "Jump cut here feels abrupt — add 6 frames of B-roll to cover it."
