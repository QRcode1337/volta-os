---
name: animate
description: Motion graphics and B-roll for documentaries and Shorts (HyperFrames / Remotion), synced to narration.
model: opus
effort: max
category: artifact
---

# /animate

Motion graphics and B-roll for The Strangest Times and Shorts: document reveals, map/globe moves, timelines, quote cards,
title cards. Built as HyperFrames HTML compositions or Remotion scenes, rendered through VOLTA Studio to Windsor.

## When to use
- Any script line marked `[ANIM]`, or any clip in VOLTA Editor of kind ANIMATION with review pins.
- Real skills for the craft: `hyperframes` (entry point), `hyperframes-animation`, `remotion-*`, `animated-documentary-motion`, `manim-video`.
  This file holds VOLTA's learned preferences.

## Scene library (sceneKey → purpose)

| sceneKey          | Purpose                                                              |
|-------------------|----------------------------------------------------------------------|
| `document-reveal` | Declassified page slides in, key line highlighted, source label held |
| `redaction-wipe`  | Redaction bars lift word by word in sync with narration             |
| `globe-fly`       | Globe/map push to a coordinate (ARGUS-style), label + date            |
| `timeline-strip`  | Dated events build left to right; current beat glows                 |
| `quote-card`      | Primary-source quote with speaker, date and citation                  |
| `title-card`      | Episode / chapter title lockup                                        |
| `outro-cta`       | Next-episode end screen + subscribe                                   |

## Motion rules
- Ease: `cubic-bezier(0.22, 1, 0.36, 1)` for entrances, `cubic-bezier(0.64, 0, 0.78, 0)` for exits (RL Log may override).
- Default durations: entrance 18f, hold ≥ 45f, exit 12f. Never animate two hero elements at once.
- Text on screen must be readable for at least 1.5× its reading time; every document on screen shows its source label.
- Sync every hero beat to a narration word timestamp (± 2 frames).
- Label reconstructions and AI imagery as such on screen when they could be mistaken for evidence.

## Steps
1. Read the clip's narration cues from the cut list; pick a sceneKey or compose a new one.
2. Build the scene with deterministic, frame-based timing (no wall clock).
3. Render a short contact sheet for review before the full render (Studio queue, output on Windsor).
4. Register the clip in `videos/clips/README.md`.

## Learned Preferences (RL Log)
<!-- Appended by VOLTA Editor / Generations / Recos. Newest last. Entries dated before 2026-10-28 came from the template sample project ("Claude 5.5 Agentic OS" master cut) — treat them as generic motion/pacing defaults, not Patrick-specific taste. -->
- 2026-10-21 · Ring zoom transitions run at 1.5x default speed; matched node glow intensity +40%.
- 2026-10-21 · Orb rotation slows ~30% while the voiceover says "every dot".

### 2026-10-23 · RUBRIC Editor feedback (Pin #1 & Pin #5 & Pin #8)
_Project: Claude 5.5 Agentic OS — Master Cut v3_

- **Rule (motion timing):** Default zoom / camera transitions to fast-out easing `cubic-bezier(0.16, 1, 0.3, 1)` at ~1.5x the previous speed; no single transition may exceed 600ms.
- **Rule (highlight contrast):** Active / matched elements get a high-contrast `#FF5500` glow (≥ 18px blur, 0.9 alpha) while inactive siblings dim to 35% opacity.
- **Rule (entrance sequencing):** Never animate primary and secondary blocks simultaneously — stagger secondary / wildcard elements to enter ~150ms after the primary block settles.
- **Rule (motion):** Apply by default (from Pin #8): Make the title reveal land 6 frames earlier
- _Evidence:_ Pin #1 (Clip 02 Home Dashboard Overview @ 00:01:28): "Speed up the zoom transition into the Artifact Ring by 1.5x and increase the orange glow (#FF5500) on the matched BETASHARES node."
- _Evidence:_ Pin #5 (Clip 04 Database Skills & Wildcards @ 00:04:07): "Wildcard 20% slice should animate in after the 80% block, not at the same time."
- _Evidence:_ Pin #8 (Clip 01 Hook @ 00:00:00): "Make the title reveal land 6 frames earlier"

### 2026-10-25 · VOLTA Editor feedback (Pin #1 & Pin #5)
_Project: Claude 5.5 Agentic OS — Master Cut v3_

- **Rule (motion timing):** Default zoom / camera transitions to fast-out easing `cubic-bezier(0.16, 1, 0.3, 1)` at ~1.5x the previous speed; no single transition may exceed 600ms.
- **Rule (highlight contrast):** Active / matched elements get a high-contrast `#FF5500` glow (≥ 18px blur, 0.9 alpha) while inactive siblings dim to 35% opacity.
- **Rule (entrance sequencing):** Never animate primary and secondary blocks simultaneously — stagger secondary / wildcard elements to enter ~150ms after the primary block settles.
- _Evidence:_ Pin #1 (Clip 02 Home Dashboard Overview @ 00:01:28): "Speed up the zoom transition into the Artifact Ring by 1.5x and increase the orange glow (#FF5500) on the matched BETASHARES node."
- _Evidence:_ Pin #5 (Clip 04 Database Skills & Wildcards @ 00:04:07): "Wildcard 20% slice should animate in after the 80% block, not at the same time."
