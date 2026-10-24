# RUBRIC AGENTIC OS — MICRO-APPS & VIDEO EDITOR SPECIFICATION (`MICRO_APPS_SPEC.md`)

> All micro-apps are served by the single Next.js app on `localhost:50000` at the routes below. The standalone per-app ports mentioned in the original draft (50002, 50010, 5000, 50009) are NOT implemented. Binding cross-agent contracts live in `INTEGRATION_CONTRACTS.md`.

## 1. SUB-AGENT SPLIT & FILE OWNERSHIP

| Sub-Agent ID | Micro-App Scope | Owned Paths (Strict Isolation) |
|---|---|---|
| **Sub-Agent 5A** | **`agent-rubric-editor` (Priority #1)** | `src/app/apps/editor/**`, `src/components/editor/**`, `src/app/api/editor/**` |
| **Sub-Agent 5B** | **`agent-rubric-recos`** | `src/app/apps/recos/**`, `src/components/recos/**`, `src/app/api/recos/**` |
| **Sub-Agent 5C** | **`agent-generations-carousels`** | `src/app/apps/generations/**`, `src/app/apps/carousels/**`, `src/components/media/**`, `src/app/api/media/**` |
| **Sub-Agent 5D** | **`agent-scripts-elements`** | `src/app/apps/scripts/**`, `src/app/apps/elements/**`, `src/components/scripts/**`, `src/components/elements/**` |

---

## 2. SUB-AGENT 5A: `RUBRIC Editor` (Full Specification)
**Route:** `/apps/editor`

### 2.1 Core Purpose
`RUBRIC Editor` replaces back-and-forth chat revisions for video editing and motion graphics. Claude generates video cuts (`/cut`) and HTML/Canvas/MP4 animations (`/animate`), and drops them into this app. The user watches each clip, clicks directly on the video frame to drop **spatial coordinate + timestamp pins**, dictates feedback via voice transcription, toggles **`Teach my /cut`** and **`Teach my /animate`**, and clicks **`Copy All Comments`** to generate a structured reinforcement-learning prompt for Claude.

### 2.2 Exact 5-Zone Screen Layout (`100vh` Non-Scrolling Dark HUD)
```
+--------------------------------------------------------------------------------------------------+
| [← OS] RUBRIC EDITOR | Project: Claude 5.5 Agentic OS v3   [● Teach my /cut] [● Teach my /animate]|
|                                                   [Filter: All Clips ▾] [📋 Copy All Comments (7)]|
+--------------------+---------------------------------------------------+-------------------------+
| CLIPS / SCENES     |                                                   | [COMMENTS (7)] [SCRIPT] |
| (Left Bin - 20%)   |           16:9 INTERACTIVE VIDEO CANVAS           | (Right Inspector - 26%) |
|                    |                (Center Stage - 54%)               |                         |
| 01 Hook (0:00-0:58)|   +-------------------------------------------+   | [Pin #1] 00:14:21       |
|   [2 Pins] [ANIM]  |   |                                           |   | Clip 02 · (x:64%, y:38%)|
| 02 Home OS Overview|   |                  (#1) <-- Orange Pin      |   | "Speed up the 3D sphere |
|   [3 Pins] [ACTIVE]|   |                   +--------------------+  |   |  zoom transition and    |
| 03 ARMS Framework  |   |                   | 🎙️ Dictate / Type  |  |   |  brighten the orange    |
|   [0 Pins] [APPROVED]  |                   | [Save Pin] [Delete]|  |   |  ring highlight."       |
| 04 Database Skills |   +-------------------------------------------+   |                         |
|   [1 Pin]  [ANIM]  |                                                   | [Pin #2] 00:14:48       |
| 05 Second Brain 3D |   [⏮] [⏪ -1f] [ ▶ PLAY ] [+1f ⏩]  00:14:21 / 38:10| Clip 02 · (x:22%, y:71%)|
|   [1 Pin]  [CUT]   |   [🎯 Pin Mode] [⬜ Box Region Mode] [🔊 1.0x ▾]  | ...                     |
+--------------------+---------------------------------------------------+-------------------------+
| MULTI-TRACK TIMELINE (Bottom Dock - 24% height)                                                  |
| 00:00        00:15        00:30        00:45        01:00        01:15        01:30              |
| [A-ROLL / CUT]  |=== Clip 01: Hook ===|====== Clip 02: Home OS ======|=== Clip 03: ARMS ===|     |
| [ANIMATIONS]    |  [Anim: Title HUD]  |   [Anim: 3D Ring Zoom]       | [Anim: ARMS Diagram]|     |
| [SCRIPT / VO]   | "Something big..."  | "So what you're seeing..."   | "I call it ARMS..." |     |
| [COMMENT PINS]  |         🔸#1              🔸#2     🔸#3            |        🔸#4         |     |
+--------------------------------------------------------------------------------------------------+
```

### 2.3 Detailed Component & Interaction Requirements

#### Zone 1: Top Header & Reinforcement Learning Bar (`EditorHeader.tsx`)
1. **Left Navigation & Project Selector:**
   - `← Back to OS` button + Orange pixel video icon + **`RUBRIC EDITOR`** (`Outfit` bold + `Doto` accent).
   - Project dropdown selector (`Claude 5.5 Agentic OS — Master Cut`, `Claude Mods Deep Dive`, `Direct Media Gen Setup`).
2. **Center-Right Self-Improving Skill Toggles (Crucial):**
   - Two interactive pill toggle switches with glowing green (`#22C55E`) active states:
     - **`[●] Teach my /cut`** (Tooltip: *"Appends reinforcement learning rules to update `workspace/skills/cut/SKILL.md` based on your pacing/cutting feedback"*).
     - **`[●] Teach my /animate`** (Tooltip: *"Appends reinforcement learning rules to update `workspace/skills/animate/SKILL.md` based on your motion/layout feedback"*).
3. **Right Action Bar:**
   - **`Preview Prompt`** button (opens a modal showing the exact compiled prompt before copying).
   - **`Copy All Comments (N)`** primary orange button (`#FF5500`). Clicking copies the full structured payload to the clipboard and triggers a toast notification: *"Copied 7 timestamped spatial comments + /cut & /animate self-improvement directives to clipboard!"*

#### Zone 2: Left Clip & Animation Bin (`ClipSceneBin.tsx`)
- Lists all scenes/clips in the project (`Clip 01` through `Clip 08`).
- Each clip card displays:
  - Thumbnail preview (rendered canvas or video frame) + Clip number & title.
  - Duration badge (`00:42`) + Type badge (`ANIMATION` in orange `#FF5500` or `A-ROLL CUT` in teal `#14B8A6`).
  - Status pill (`NEEDS REVIEW`, `CHANGES REQUESTED`, `APPROVED` in green).
  - Pin counter badge (`📌 3`).
- Clicking a clip loads it into the Center Canvas, isolates its segment in the Bottom Timeline, and filters (or scrolls) the Right Inspector to that clip's comments.

#### Zone 3: Center Interactive 16:9 Video & Animation Canvas (`SpatialVideoCanvas.tsx`)
1. **Dual-Engine Playback Support:**
   - Must support **both** standard `<video>` files (`.mp4`/`.webm`) **and** interactive procedural HTML5 Canvas / SVG motion-graphics scenes (so the app works immediately out of the box with rich animated scenes even before the user drops in local `.mp4` files).
   - Pre-load 5 rich, playable procedural animations (e.g., *Scene 1: Claude 5.5 Title Reveal*, *Scene 2: Orbital Artifact Ring Zoom*, *Scene 3: ARMS Framework Stack*, *Scene 4: Wildcard 80/20 Split*, *Scene 5: Prompt Cache Cold vs Warm Meter*). Also include an **`+ Import Local MP4 / WebM`** button so the user can drop in any local video file from their machine (object URL; no upload).
2. **Spatial Pin Placement (`Click-to-Pin` & `Drag-to-Box`):**
   - **Point Pin Mode (Default):** Clicking anywhere on the 16:9 canvas immediately:
     1. Pauses playback at the exact frame.
     2. Calculates normalized coordinates `xPercent` (`0.0`–`100.0%`) and `yPercent` (`0.0`–`100.0%`) relative to the 16:9 frame.
     3. Places a pulsing **Orange Numbered Pin (`#1`, `#2`, etc.)** with crosshairs at `(xPercent%, yPercent%)`.
     4. Opens a floating **Pin Comment Popover** anchored right next to the pin.
   - **Region Box Mode:** Dragging across the canvas draws a dashed orange bounding box `(x%, y%, width%, height%)` to highlight a specific UI element or subtitle region.
3. **Voice Transcription Inside the Pin Popover:**
   - Auto-focused textarea (`"Describe what Claude should change here..."`).
   - **Category Tag Selector:** `Animation (/animate)` | `Cut / Pacing (/cut)` | `Audio / SFX` | `Typography (/robo)`.
   - **🎙️ Live Voice Dictation Button:** Uses browser `SpeechRecognition` / `webkitSpeechRecognition` (with a simulated waveform fallback if unsupported or mic permission is denied) so the user can speak their revision and have it transcribed directly into the pin comment.
   - **`Save Pin (Enter)`** and **`Cancel (Esc)`** buttons.
4. **Transport Controls Bar (Below Canvas):**
   - `Play / Pause (Space)`, `Step Back 1 Frame (←)`, `Step Forward 1 Frame (→)`, `Jump to Next Pin`, `Playback Speed (0.5x, 1x, 1.5x, 2x)`, `Loop Clip Toggle`, and `Doto` font timecode readout (`00:14:21:18` @ 30fps).

#### Zone 4: Right Script & Comments Inspector (`InspectorPanel.tsx`)
- Two top tabs: **`COMMENTS (N)`** and **`SCRIPT & CUES`**.
- **`COMMENTS` Tab:**
  - Grouped by Clip or sorted chronologically.
  - Each comment card shows: Orange Pin badge (`#1`) + clickable timestamp pill (seeks the video & highlights the pin on the canvas) + coordinate badge (`x: 64%, y: 38%`); skill target tag (`/animate` or `/cut`); editable comment text + `Resolved [✓]` checkbox + `Copy Single Comment` icon + `Delete` icon.
- **`SCRIPT & CUES` Tab:**
  - Displays the spoken voiceover transcript synced to timestamps.
  - Highlighting any sentence lets the user click **`+ Attach Visual / Animation Cue`** or **`✂️ Mark Cut / Trim Here`**, which adds a script-linked directive to the comment queue.

#### Zone 5: Bottom Multi-Track Timeline (`MultiTrackTimeline.tsx`)
- Interactive horizontal timeline with draggable playhead and zoom slider.
- **4 Synchronized Horizontal Tracks:**
  1. **`01 A-ROLL / CUTS`:** scene blocks with cut boundaries and duration labels.
  2. **`02 ANIMATIONS (/animate)`:** motion-graphic overlay blocks in orange/amber (`Title HUD`, `ARMS Stack`, `Wildcard Split`, `Jev Router Stats`).
  3. **`03 VOICEOVER WAVEFORM`:** audio waveform bars synced to the clip.
  4. **`04 SPATIAL PINS`:** orange diamond markers at every pin's timestamp. Clicking jumps the playhead and pulses the corresponding pin on the canvas.

### 2.4 Exact Clipboard Prompt Output Format (With RL Toggle Logic)
When the user clicks **`Copy All Comments`**, generate this markdown structure (the RL section only appears for toggles that are ON; each toggle's directive is derived from the pins tagged with that skill):

```markdown
# RUBRIC EDITOR — VIDEO & ANIMATION REVISION BATCH
**Project:** Claude 5.5 Agentic OS — Master Cut v3
**Total Revision Pins:** 3 across 2 clips

## CLIP REVISIONS

### Clip 02: Home Dashboard Overview (`workspace/videos/clips/02-home-os.tsx` | `00:01:11 - 00:02:25`)
1. **[Pin #1 @ 00:01:28 (Frame 2640)]**
   - **Spatial Coordinates:** `x: 64.2%, y: 38.5%` (Center-Right Orbital Artifact Ring)
   - **Target Skill:** `/animate`
   - **Feedback:** Speed up the zoom transition into the Artifact Ring by 1.5x and increase the orange glow (`#FF5500`) on the matched `BETASHARES` node.
2. **[Pin #2 @ 00:02:08 (Frame 3840)]**
   - **Spatial Coordinates:** `x: 82.0%, y: 74.1%` (Bottom-Right Skills Deck Popover)
   - **Target Skill:** `/cut`
   - **Feedback:** Cut the 1.8s dead air pause right before the Haiku/Sonnet/Opus matrix popover opens.

---

## 🧠 SELF-IMPROVEMENT REINFORCEMENT LEARNING DIRECTIVES
*(Auto-attached because `Teach my /cut` and `Teach my /animate` were toggled ON in RUBRIC Editor)*

After applying the clip revisions above, you MUST generalize the lessons from my feedback and permanently update my skills so I never have to make these same corrections again:

1. **Update `/animate` (`workspace/skills/animate/SKILL.md`):**
   - Extract the motion timing and highlight contrast preference from Pin #1 and append a new rule under `## Learned Preferences (RL Log)` specifying faster zoom easing (`cubic-bezier(0.16, 1, 0.3, 1)`) and higher-contrast `#FF5500` active node glow.
2. **Update `/cut` (`workspace/skills/cut/SKILL.md`):**
   - Extract the pacing preference from Pin #2 and append a rule under `## Learned Preferences (RL Log)` to automatically trim dead-air pauses longer than `0.4s` before UI popover transitions.
```

Also wire an **`Apply & Teach Locally`** button next to `Copy All Comments` that POSTs to `/api/editor/apply-feedback`, which directly appends the learned rules to `workspace/skills/cut/SKILL.md` and `workspace/skills/animate/SKILL.md` on disk and shows a live diff modal.

---

## 3. SUB-AGENT 5B: `RUBRIC Recos` (Weekly Improvement Store)
**Route:** `/apps/recos`

1. **Left Category Sidebar (`220px` width):**
   - Filter tabs with item counts: `🔥 Priority (4)`, `⚡ All Recos (12)`, `🧩 Apps (2)`, `🕒 Routines (3)`, `🧠 Memory (4)`, `🛠️ Skills (3)` (counts computed from data).
   - Bottom telemetry card: `Weekly Usage Reset: Friday 09:00 AM · Remaining Quota: 32% (Ideal for system upgrades)`.
2. **3-Column Recommendation Card Grid** (12 recommendations in `RECOMMENDATIONS` from `src/lib/mock-data.ts`):
   - **Memory (Green top bar `#22C55E`), Skills (Orange `#FF5500`), Routines (Amber `#F5A623`), Apps (Blue `#3B82F6`).**
   - Each card: top 4px color bar + pixel/vector icon + title + category badge; **`What's the benefit`** block (with savings badge); **`What I can do`** block (exact files Claude will edit); footer buttons **`Add to cart`** (toggles to `✓ In Cart`), **`Done`**, **`Skip`**.
3. **Slide-Over Cart Drawer & One-Click Checkout:**
   - Top-right **`Cart (N)`** opens the drawer; shows total estimated weekly token & dollar savings.
   - **`Checkout & Copy Agent Prompt`** copies a consolidated execution prompt; **`Execute Upgrades Now`** calls `/api/recos/apply` to apply the changes to `./workspace` immediately (writes ONLY inside `./workspace`, appends a dated `## Applied Recos` log entry to the affected files, and returns a per-file summary).

---

## 4. SUB-AGENT 5C: `Generations` & `RUBRIC Carousels`

### App 1: `Generations` (`/apps/generations`)
1. **Direct Prompt & Model Bar (Top):** prompt input + model selector (`Flux 1.1 Pro Ultra`, `Runway Gen-4 Turbo`, `Kling 2.1`, `Ideogram 3.0`, `Recraft V3`) + aspect ratio (`16:9 Thumbnail`, `4:5 Carousel`, `9:16 Reel`) + **`[●] Include 20% /wildcard Variations`** toggle — when enabled, every batch is 80% brand-aligned (`/thumb` & `/robo` rules) and 20% radically different wildcard styles. Generation is simulated locally (procedural canvas/SVG/CSS art; no external API calls).
2. **Masonry Gallery & Side-by-Side Wildcard Comparator:**
   - Filter tabs: `All Media`, `YouTube Thumbnails (/thumb)`, `Video Animations (/animate)`, `Wildcard Lab (/wildcard)`.
   - Each card: preview, `STANDARD (/robo)` vs `🃏 WILDCARD` badge, prompt, model, seed, cost (`$0.04`), and actions:
     - **`⭐ Promote to /thumb Database`** → `POST /api/media/promote` appends the asset metadata & style rules into `workspace/skills/thumb/SKILL.md`.
     - **`Send to RUBRIC Editor`** → pushes the item into the editor inbox (see `INTEGRATION_CONTRACTS.md`).

### App 2: `RUBRIC Carousels` (`/apps/carousels`)
1. **Horizontal Filmstrip Deck Reviewer:** multi-slide 4:5 carousel drafts (`Post #14: The ARMS Framework in 7 Slides`, `Post #15: Why MCPs Drain Your Context Window`, `Post #16: Jev Routing Math`), rendered with the `/robo` system (`#0A0A0A` dark or `#F5F2EB` paper cards, `Outfit` + `Doto`).
2. **Review & Approval Workflow:** inline slide editor (click headline/body to edit), per-slide comment pin + **`Switch to Wildcard Layout`** toggle, status buttons **`✓ Approve Deck`**, **`Request Claude Revision (Copy Prompt)`**, **`Export Slides as PNGs`** (client-side canvas render → download).

---

## 5. SUB-AGENT 5D: `RUBRIC Scripts` & `Elements`

### App 1: `RUBRIC Scripts` (`/apps/scripts`)
- Split-screen YouTube script & retention architect:
  - **Left:** hook variants (8 corpus-aligned `/tone` hooks + 2 `/wildcard` hooks), chapter outline, and teleprompter mode (full-screen auto-scroll with speed control).
  - **Right:** two-column AV script table (`SPOKEN VOICEOVER (/tone)` | `VISUAL & ANIMATION CUE (/animate)`) with **`Push Cues to RUBRIC Editor`** (editor inbox, see contracts).

### App 2: `Elements` (`/apps/elements`)
- Interactive showcase of the `/robo` reusable UI component library with live specimens + copyable code snippets for:
  1. Brand Color Swatches & CSS Tokens
  2. Typography Scale (`Outfit`, `Doto` counters, `JetBrains Mono` HUD labels, `Newsreader` editorial callouts)
  3. HUD Bento Cards & Header Bars
  4. Model × Effort Routing Matrix Selector
  5. Doto Metric Hero Counters & Segmented Mix Bars
  6. Spatial Video Pin & RL Toggle Switches
