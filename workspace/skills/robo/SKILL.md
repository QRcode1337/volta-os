---
name: robo
description: Brand book and HTML-first artifact design system (Ink Well Soft).
model: opus
effort: high
category: database
---

# /robo

Brand book and HTML-first artifact design system (Ink Well Soft). Apply to **every** visual artifact:
decks, one-pagers, dashboards, reports, carousels, UI. Reference implementation:
`artifacts/robo/robo-brand-book.html` and `artifacts/robo/hud-component-sheet.html`.

## When to use
- Any time an output will be looked at rather than read: decks, reports, dashboards, carousel slides, UI.
- Called implicitly by `/proposal-writer`, `/automation-audit`, `/animate` and RUBRIC Carousels.
- Routed through Jev; default tier **OPUS** at **HIGH** effort (taste-heavy, client-facing).

## Principles
1. **HTML first.** Ship a single self-contained `.html` file (inline CSS, no external JS). PDFs are printed from HTML.
2. **Dark HUD, warm paper.** Near-black surfaces, warm off-white text. Never pure white text on pure black.
3. **One accent.** `#FF5500` orange is the only loud color on a page. Everything else is semantic.
4. **Data looks like instruments.** Numbers in mono, labels in uppercase mono with tracking, big figures in Doto.
5. **Quiet borders, no shadows.** 1px `#262522` borders, 10px radius. Glow only on the active/matched element.

## Tokens — "Ink Well Soft"

| Token                 | Value                     | Use                                    |
|-----------------------|---------------------------|----------------------------------------|
| `--bg-obsidian`       | `#0A0A0A`                 | Page background                        |
| `--bg-panel`          | `#141413`                 | Cards / panels                         |
| `--bg-panel-elevated` | `#1C1B19`                 | Popovers, pills, inputs                |
| `--bg-panel-hover`    | `#24221F`                 | Hover state                            |
| `--border-subtle`     | `#262522`                 | Default 1px border                     |
| `--border-highlight`  | `#3A3834`                 | Hover / focus border                   |
| `--text-paper`        | `#F5F2EB`                 | Primary text                           |
| `--text-secondary`    | `#A39E93`                 | Labels, secondary copy                 |
| `--text-muted`        | `#6E6A61`                 | Meta, timestamps, disabled             |
| `--accent-orange`     | `#FF5500`                 | Primary action, brand, matched state   |
| `--accent-orange-glow`| `rgba(255, 85, 0, 0.22)`  | Focus ring, pulse                      |
| `--accent-amber`      | `#F5A623`                 | Warnings, FABLE tier, routines         |
| `--accent-green`      | `#22C55E`                 | Success, HAIKU tier, WARM cache        |
| `--accent-purple`     | `#A855F7`                 | OPUS tier                              |
| `--accent-teal`       | `#14B8A6`                 | SONNET tier                            |

Department colors (Second Brain, Today's Mix): skills `#FFFFFF` · business `#FF6B2B` · content `#EF4444` ·
personal `#06B6D4` · product `#3B82F6` · community `#10B981` · routines `#F5A623` · apps `#8B5CF6`.

## Typography
- **Outfit** 300–700 — UI and body. Titles 600–700, body 400.
- **Doto** 600–800 — hero numbers and one accent word per title ("RUBRIC **Agentic** OS"). Tracking 0.02–0.03em.
- **JetBrains Mono** 400–600 — numbers, labels (`.hud-label`: 11px, 600, uppercase, 0.08em tracking), code.
- **Newsreader** italic — pull quotes and testimonials only.

## Components
- **HudPanel** — `hud-card` + 36px header: orange 16px icon, `.hud-label` title, right-aligned action pills.
- **Pill** — 24px tall, rounded-full, mono 10px uppercase. Primary = orange fill with obsidian text.
- **ModelEffortBadge** — HAIKU green · SONNET teal · OPUS purple · FABLE amber; 14% tint background, 33% border.
- **Stat** — Doto 28–40px figure, `.hud-label` caption above, delta in mono green/red below.
- **Table** — mono numerals right-aligned, 1px row dividers in `--border-subtle`, header row `.hud-label`, no zebra.
- **Pixel mascot** — 8×8 crisp-edged robot head in `#FF5500`. Never anti-aliased, never rotated.

## Layout
- 8px spacing grid. Panel padding 12px (dense) or 16px (artifact). Gutters 12px.
- Decks: 16:9 slides at 1280×720, one idea per slide, max 3 numbers per slide.
- Dashboards: full viewport, no page scroll; scroll lives inside panels (`.hud-scroll`).

## Don'ts
- No gradients except the orange glow on a matched node. No drop shadows. No emoji in client artifacts.
- No second accent color. No centered body copy. No stock photography.
- Never put orange text on an orange-tinted background.

## Learned Preferences (RL Log)
<!-- Appended by RUBRIC Editor / Recos. Newest last. -->
- 2026-10-09 · Title lockups: Doto tracking 0.02em, not 0.03em, when the word is longer than 6 letters.
- 2026-10-17 · Client decks: put the price on slide 2, not the last slide.
