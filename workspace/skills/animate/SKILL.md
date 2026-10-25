---
name: animate
description: Generate HTML/Canvas motion graphics and B-roll animations for videos.
model: opus
effort: max
category: artifact
---

# /animate

Generate HTML/Canvas motion graphics and B-roll animations for videos. Each animation is a single
self-contained React/TSX or HTML scene (`videos/clips/<nn>-<slug>.tsx`) rendered at 1920×1080, 30 fps,
using `/robo` tokens, then recorded to ProRes via the headless renderer.

## When to use
- Any script line marked `[ANIM]`, or any clip in RUBRIC Editor of kind ANIMATION with review pins.
- Routed through Jev; default tier **OPUS** at **MAX** effort (motion is the most taste-sensitive output).

## Scene library (sceneKey → purpose)

| sceneKey         | Purpose                                                       |
|------------------|---------------------------------------------------------------|
| `title-reveal`   | Doto title lockup with pixel mascot, orange underline sweep   |
| `ring-zoom`      | Camera push into the 36-node Artifact Ring, matched node glows |
| `arms-stack`     | Four ARMS layers stack up with labels                         |
| `wildcard-split` | 80% block fills, then 20% WILDCARD slice animates in          |
| `cache-meter`    | WARM→COLD meter with dollar counter                           |
| `brain-orb`      | Dotted sphere fly-through, department colors                  |
| `jev-router`     | Prompts fly into Jev, fan out to HAIKU/SONNET/OPUS lanes      |
| `outro-cta`      | Subscribe + community CTA card                                |

## Motion rules
- Ease: `cubic-bezier(0.22, 1, 0.36, 1)` for entrances, `cubic-bezier(0.64, 0, 0.78, 0)` for exits.
- Default durations: entrance 18f, hold ≥ 45f, exit 12f. Never animate two hero elements at once.
- Glow (`--accent-orange-glow`) only on the element the voiceover is naming right now.
- Text on screen must be readable for at least 1.5× its reading time.
- Sync every hero beat to a voiceover word timestamp (± 2 frames).

## Steps
1. Read the clip's voiceover cues from the cut list; pick a sceneKey or compose a new one.
2. Build the scene with deterministic timing (frame-based, no wall-clock).
3. Render a 6-frame contact sheet for review before the full render.
4. Export and register the clip in `videos/clips/README.md`.

## Learned Preferences (RL Log)
<!-- Appended by RUBRIC Editor / Recos. Newest last. -->
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
