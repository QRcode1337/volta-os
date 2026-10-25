---
name: cut
description: Assemble A-roll cuts from transcripts: pacing, dead-air trims, jump cuts.
model: opus
effort: high
category: artifact
---

# /cut

Assemble A-roll cuts from transcripts: pacing, dead-air trims, jump cuts. Input is a word-level transcript
(JSON with per-word start/end) plus the raw take; output is an EDL/FCPXML timeline and a cut list markdown
file that RUBRIC Editor loads into the A-ROLL track.

## When to use
- After recording, before `/animate`. Also re-run on any clip with status CHANGES REQUESTED in RUBRIC Editor.
- Routed through Jev; default tier **OPUS** at **HIGH** effort (pacing is taste).

## Steps
1. Align transcript to the script in `content/scripts/<video>.md`; mark retakes (same line spoken 2+ times).
2. Keep the **last clean take** of each line unless the RL Log says otherwise.
3. Trim dead air longer than the threshold below; keep 4 frames of room tone each side.
4. Remove filler words (`um`, `uh`, `like`, `you know`, `so yeah`) only when they are standalone.
5. Insert jump cuts on sentence boundaries; if a jump cut lands mid-gesture, flag it for B-roll cover.
6. Export `videos/clips/<nn>-<slug>.cut.md` (cut list) + timeline via `premiere-cli` (CLI connector).

## Parameters (defaults)

| Parameter               | Value      |
|-------------------------|------------|
| Dead-air threshold      | 0.8 s      |
| Room-tone handles       | 4 frames   |
| Max jump cuts / minute  | 9          |
| B-roll cover on jump    | 6 frames   |
| Frame rate              | 30 fps     |

## Output format
```
CLIP 02 · Home Dashboard Overview · 01:11 → 02:25
- 00:00:17:12  trim 1.8s dead air  (before matrix popover)
- 00:00:41:03  jump cut            cover: 6f B-roll (ring)
- 00:00:58:20  retake → keep take 3
```

## Learned Preferences (RL Log)
<!-- Appended by RUBRIC Editor / Recos. Newest last. -->
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
