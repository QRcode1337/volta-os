# Visual Audit Report — Tasks (`/apps/tasks`)

Captured live on 2026-10-28 at 1440×900 (board + detail drawer) and 375×812 (phone). Dark theme only (`color-scheme: normal`, body `#0A0A0A`). Target: WCAG AA.

## Overall Assessment
**Score:** 6/10
**Summary:** The board reads as a coherent part of VOLTA (mono labels, warm neutrals, orange brand), and the Awaiting column correctly owns the eye. It is let down by a stale "read-only" header that now contradicts the drawer, a muted-text token that fails AA everywhere it's used, an ad-hoc type scale of 9 sizes under 13px, and accent colors that mean two things at once.

## Squint Test Results
- **Primary focus:** The Awaiting Patrick column (orange border, orange header, 13 orange STALE badges). Correct target, but every card in it is equally loud, so no single card stands out.
- **Reading order:** Clear left→right on desktop. On the phone, the header and filters take 252px of the 756px above the tab bar (33%) before the first card.
- **Visual noise:** Medium on the board, medium-high in the drawer's Act panel (three accent hues in one box).

## Findings

### [CRITICAL] Copy/State — Header still says "read-only"
**Current:** `TasksApp.tsx:209` renders a lock icon + "read-only" next to "File updated…", and the file comment at line 3 says "nothing here can change it". The drawer below now edits `actions.md`.
**Issue:** The status chip contradicts the feature; it's the exact thing the user reported as the problem.
**Fix:** Replace with a neutral sync indicator, e.g. `<RefreshCw/> actions.md · updated 7:30 AM`, or "Edits write to actions.md · backup kept". Update the header comment too. (The NoteViewer's "Read-only" at `TaskParts.tsx:368` is accurate — keep it.)

### [CRITICAL] Contrast — `--text-muted` (#6E6A61) fails AA at the sizes it's used
**Current:** Used for the subtitle (9px), field labels like "Your answer or decision" (10px), card ages "2d/4d" and line refs "L21" (10px).
**Issue:** 3.4:1 on `#141413`, ~3.2:1 on card/awaiting-tint surfaces; AA needs 4.5:1 for text this small. The token is global (`globals.css:17`), so every VOLTA app inherits it.
**Fix:** Raise `--text-muted` to `#8C877C` (≈5.0:1 on `#141413`, ≈4.7:1 on `#1C1B19`) — still clearly below `--text-secondary` #A39E93 (6.4:1). One-line token change; re-check other apps afterward.

### [CRITICAL] Color meaning — violet means both "In progress" and "agent"
**Current:** The In progress status dot/header and the "Solve with agent" button both use `#A855F7`.
**Issue:** Violet text on the drawer surface is 4.3:1 (fails AA at 10.5px), and the shared hue implies "Solve with agent" moves the item to In progress, which it doesn't.
**Fix:** Give agent actions their own hue used consistently with Systems "Fix with agent" (e.g. cyan `#22D3EE`, 9.6:1), or render "Solve with agent" as the panel's filled primary (see next). If violet stays for In progress, lighten its text to `#C084FC` (≈6.5:1).

### [IMPROVEMENT] Hierarchy — the Act panel has no single primary action
**Current:** "Mark done" is green-tinted and visually dominant; "Solve with agent" violet outline; "Save note" orange outline (disabled at 50%). Three accent hues, three equal-weight pills.
**Suggestion:** For `awaiting` items the primary task is answering: make "Save note" (relabel "Send answer") the filled orange button once text exists, demote status moves to neutral ghost pills (all `#A39E93` text, `#262522` border) with only the hovered/selected one tinted. Keep one filled button per panel.

### [IMPROVEMENT] Hierarchy — uniform STALE treatment flattens the Awaiting column
**Current:** Every stale card gets the orange border + orange STALE badge on an orange-tinted column, so 13 of 19 cards look identical.
**Suggestion:** Keep the column tint, drop the per-card orange border, and grade the badge by age: ≥30d orange fill `STALE 32d`, 14–29d outline only. Sort oldest first so the loudest cards lead.

### [IMPROVEMENT] Typography — 9 text sizes under 13px, none from a scale
**Current:** Rendered sizes: 9, 9.5, 10, 10.5, 11, 11.5, 12.5, 16, 17, 18px; 36 arbitrary `text-[Npx]` classes across the two Tasks files. 10px is the most common text size (75 nodes).
**Suggestion:** Collapse to a 4-step UI scale: 11px (mono labels/meta), 12px (chips/buttons), 13px (card body), 16px (drawer title). Bumping card body from 12.5→13px and labels 10→11px also fixes most of the small-text contrast pressure. Define as `--fs-meta/--fs-ui/--fs-body/--fs-title` in `globals.css` so other apps can adopt them.

### [IMPROVEMENT] Spacing — phone header takes a third of the screen
**Current:** Search, two selects, stale toggle + threshold, and the `open …` command each get their own row (252px before the first column). The Awaiting column then runs 19 cards before Blocked appears, with no way to jump.
**Suggestion:** On `max-md`, collapse filters into one "Filter" button with a sheet, and add a sticky segmented status bar (Awaiting 19 · Blocked 3 · Todo 5 · Done 51) that scrolls to each column. Target ≤120px of chrome.

### [IMPROVEMENT] Layout — Done column is cut off at the right edge at 1440px
**Current:** Five columns at equal width plus the collapsed Done rail; Done shows as `DONE 51 >` clipped at the viewport edge, and the empty In Progress column spends a full column on "None".
**Suggestion:** Let empty columns shrink to a 160px rail (`min-w-[160px] flex-[0.5]` when count is 0) so Done fits; or pin Done as a collapsed rail with full label visible.

### [IMPROVEMENT] Component consistency — dev metadata on cards
**Current:** Each card shows a line ref (`L21`) in the bottom-right.
**Suggestion:** Move line refs into the drawer's Source block (already there) and drop them from cards; reclaim the space for the agent/age chip.

## Contrast Report
| Element | Foreground | Background | Ratio | Pass AA |
|---|---|---|---|---|
| Card body text | #F5F2EB | #1C1B19 | ~15:1 | Yes |
| Secondary text / chips ("Patrick", "All agents") | #A39E93 | #1C1B19 | 6.4:1 | Yes |
| Muted: ages, `L21`, subtitle, field labels | #6E6A61 | #141413 | 3.4:1 | **No** |
| Muted on card/awaiting tint | #6E6A61 | ~#1C1B19 | 3.2:1 | **No** |
| Awaiting header / STALE badge | #FF5500 | ~#1C1B19 | 5.3:1 | Yes |
| Blocked header | #EF4444 | ~#191918 | 4.5:1 | Borderline |
| In progress / Solve with agent | #A855F7 | ~#1C1B19 | 4.3:1 | **No** (10.5–11px) |
| Mark done | #22C55E | ~#1C1B19 | 7.4:1 | Yes |
| Proposed muted | #8C877C | #141413 | ~5.0:1 | Yes |

Light mode: not supported by the app, so not checked.

## Quick Wins
1. **Remove the "read-only" header chip** (`TasksApp.tsx:209`) — one line, fixes the most misleading thing on the screen.
2. **Raise `--text-muted` to `#8C877C`** (`globals.css:17`) — one token, fixes AA for every muted label across VOLTA.
3. **Give "Solve with agent" its own hue and make one button primary** in the Act panel — a few class changes in `TaskParts.tsx`, removes the violet double meaning and the three-way color competition.

## Handoff
- design-system-architecture: the type scale and the muted token are global (`globals.css`), and Systems' "Fix with agent" should share whatever agent hue Tasks adopts.
