# VOLTA (formerly RUBRIC) AGENTIC OS — MASTER MULTI-AGENT HANDOFF SPECIFICATION

> **Amended by** `MICRO_APPS_SPEC.md` (Sub-Agent 5 is split into 5A–5D) and `INTEGRATION_CONTRACTS.md` (binding cross-agent contracts). Where they conflict with this file, those win.

## 1. SYSTEM OVERVIEW & ARCHITECTURE
You are building **VOLTA Agentic OS**, a local-first, full-viewport command center (`localhost:50000`) and workspace architecture modeled 1:1 after Jay E's (RoboNuggets) Claude 5.5 Agentic OS.

### Core Tech Stack
- **Framework:** Next.js 15 (App Router, TypeScript) running on port `50000` (`npm run dev -- -p 50000`).
- **Styling:** Tailwind CSS + Custom CSS Variables implementing the `/robo` **"Ink Well Soft"** dark HUD design system.
- **Typography:** Google Fonts (`Outfit`, `Doto`, `JetBrains Mono`, `Newsreader`).
- **Visualizations:** `three` / `@react-three/fiber` (3D Dotted Second Brain Sphere) + `d3` (2D Radial Sunburst/Ring Map, Circle-Packing Bubble Chart, Timeline Matrix).
- **Icons:** `lucide-react` + custom pixel/geometric SVGs.
- **Local Agent Bridge:** Next.js Node.js API Routes (`/api/workspace`, `/api/skills/run`, `/api/jev-router`, `/api/cache-status`) that read/write the local `./workspace` ARMS folder and execute headless `claude -p` commands with graceful mock fallback if the `claude` CLI is not installed.

---

## 2. MULTI-AGENT ORCHESTRATION & FILE OWNERSHIP RULES
To prevent merge conflicts, each Sub-Agent is restricted to its assigned directories. **Phase 0 MUST complete before spawning Sub-Agents in parallel.**

| Agent ID | Role | Owned Paths (Strict Isolation) |
|---|---|---|
| **Phase 0 (Lead)** | Scaffold, Contracts & Theme | `package.json`, `src/types/os.ts`, `src/app/globals.css`, `src/lib/mock-data.ts` (+ all other `src/lib/**`) |
| **Sub-Agent 1** | `agent-backend-and-robo-ui` | `src/app/api/**` (except `api/editor`, `api/recos`, `api/media`), `src/components/robo-ui/**`, `workspace/**` |
| **Sub-Agent 2** | `agent-bento-widgets` | `src/components/dashboard/LeftColumn.tsx`, `src/components/dashboard/RightColumn.tsx`, `src/components/dashboard/widgets/**` |
| **Sub-Agent 3** | `agent-orbital-core` | `src/components/dashboard/CenterOrbitalCore.tsx`, `src/components/dashboard/ArtifactRing.tsx`, `src/components/dashboard/SecondBrainSphere3D.tsx` |
| **Sub-Agent 4** | `agent-second-brain` | `src/app/second-brain/**`, `src/components/second-brain/**` |
| **Sub-Agent 5A–5D** | see `MICRO_APPS_SPEC.md` | see `MICRO_APPS_SPEC.md` |
| **Sub-Agent 6** | `agent-mods-and-shell` | `src/components/mods/UsageRoboBar.tsx`, `src/app/page.tsx`, `src/app/layout.tsx` |

---

## 3. PHASE 0: DESIGN SYSTEM (`/robo`) & SHARED DATA CONTRACTS

### 3.1 Exact Color Tokens (`src/app/globals.css`)
```css
@import url('https://fonts.googleapis.com/css2?family=Doto:wght@600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&family=Outfit:wght@300;400;500;600;700&display=swap');

:root {
  /* Core Surfaces ("Ink Well Soft") */
  --bg-obsidian: #0A0A0A;
  --bg-panel: #141413;
  --bg-panel-elevated: #1C1B19;
  --bg-panel-hover: #24221F;
  --border-subtle: #262522;
  --border-highlight: #3A3834;

  /* Text Hierarchy ("Paper") */
  --text-paper: #F5F2EB;
  --text-secondary: #A39E93;
  --text-muted: #6E6A61;

  /* Brand Accents */
  --accent-orange: #FF5500;
  --accent-orange-glow: rgba(255, 85, 0, 0.22);
  --accent-amber: #F5A623;
  --accent-green: #22C55E;
  --accent-purple: #A855F7;
  --accent-teal: #14B8A6;

  /* Semantic Department Node Colors (Second Brain & Today's Mix) */
  --dept-skills: #FFFFFF;
  --dept-business: #FF6B2B;
  --dept-content: #EF4444;
  --dept-personal: #06B6D4;
  --dept-product: #3B82F6;
  --dept-community: #10B981;
  --dept-routines: #F5A623;
  --dept-apps: #8B5CF6;

  /* Font Families */
  --font-sans: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-doto: 'Doto', monospace;
  --font-mono: 'JetBrains Mono', monospace;
  --font-serif: 'Newsreader', Georgia, serif;
}

body {
  background-color: var(--bg-obsidian);
  color: var(--text-paper);
  font-family: var(--font-sans);
  overflow: hidden;
  user-select: none;
}

.font-doto { font-family: var(--font-doto); letter-spacing: 0.03em; }
.hud-label { font-family: var(--font-mono); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); }
.hud-card { background: var(--bg-panel); border: 1px solid var(--border-subtle); border-radius: 10px; }
```

### 3.2 Shared TypeScript Interfaces (`src/types/os.ts`)
All Sub-Agents MUST import and adhere strictly to the types in `src/types/os.ts` (the file is the source of truth; it contains every interface from the original spec plus integration types).

---

## 4. SUB-AGENT 1 SPECIFICATION: `agent-backend-and-robo-ui`

### Mission
Build the physical `./workspace` ARMS file structure on disk, the Next.js API routes that connect the UI to the workspace and `claude -p`, and the reusable `/robo` UI component kit.

### Deliverables
1. **Workspace Directory Bootstrapper (`workspace/`)**:
   - `workspace/CLAUDE.md` & `workspace/AGENTS.md`: Central router map pointing to `departments/business.md`, `departments/content.md`, `departments/product.md`, `departments/personal.md`, `departments/community.md`, plus compacting rules (`/compact` preservation directives).
   - `workspace/MEMORY.md`: Preloaded session index card catalog with 1-line pointers across all departments.
   - `workspace/skills/`: Create subdirectories with realistic `SKILL.md` files for:
     - `/robo` (Brand book & HTML-first artifact design system)
     - `/tone` (Database skill of writing voice guidelines + 20% wild card rule)
     - `/thumb` (YouTube thumbnail reference database)
     - `/wildcard` (Anti-overfitting directive: 80% corpus-aligned, 20% novel wildcards)
     - `/clean-up` (Self-triggered macOS/Linux temp process & orphan file cleaner)
     - `/lead-research`, `/proposal-writer`, `/client-onboarding`, `/automation-audit`, `/call-recap`, `/animate`, `/cut`, `/grammar`, `/calibrate`, `/note`, `/search-connectors`, `/chromify`.
2. **API Endpoints (`src/app/api/`)**:
   - `GET /api/workspace`: Scans `./workspace` and merges with high-scale procedural metadata (representing the 424,846-file Second Brain) to return nodes, edges, skills, routines, and artifacts.
   - `POST /api/skills/run`: Accepts `{ command, model, effort, customPrompt }`. Attempts to spawn `claude -p "<command>" --model <model>` via `child_process.execFile` with a 15s timeout; if `claude` CLI is unavailable on the host machine, simulates a realistic 1.2s execution and returns a structured execution report (e.g., for `/clean-up`: freed 2.4 GB RAM, killed 4 orphaned node processes, cleared 182 temp files).
   - `POST /api/jev-router`: Simulates the ultra-fast **Jev** classification model (`0.006s` latency, `$0.00004` cost) that classifies any incoming prompt or skill into `HAIKU`, `SONNET`, or `OPUS` and logs routing telemetry (`4,451 calls · $0.18 total · 41% routed to Haiku`).
3. **`/robo` Component Library (`src/components/robo-ui/`)**:
   - `HudPanel.tsx`: Standard container with `1px solid #262522`, top header bar with left icon + `.hud-label` title + right action pill buttons (`EXPAND`, `+ ADD`, `OPEN CAL`).
   - `ModelEffortBadge.tsx`: Color-coded pill (`HAIKU` = green `#22C55E`, `SONNET` = teal `#14B8A6`, `OPUS` = purple `#A855F7`, `FABLE` = amber `#F5A623`).
   - `PixelMascotLogo.tsx`: Crisp orange geometric/pixel SVG mascot icon seen in the top header and micro-app icons.

---

## 5. SUB-AGENT 2 SPECIFICATION: `agent-bento-widgets`

### Mission
Build the **Left Column** and **Right Column** of the Home Dashboard (`localhost:50000`). Both columns must fit inside `calc(100vh - 24px)` without page-level vertical scrolling.

### Left Column (`src/components/dashboard/LeftColumn.tsx` — 24% viewport width)
1. **`MICRO APPS` Widget (Top — 34% height)**:
   - Header: Grid icon + `MICRO APPS` + `EXPAND` button + `+ ADD APP` button.
   - Scrollable vertical list of 7 items:
     - `RUBRIC Editor` (*Review cuts & pin timestamp feedback* -> links to `/apps/editor`)
     - `RUBRIC Scripts` (*Draft & teleprompter view for YouTube* -> links to `/apps/scripts`)
     - `Generations` (*Direct image & video model gallery* -> links to `/apps/generations`)
     - `RUBRIC Recos` (*Weekly agent improvement cart* -> links to `/apps/recos`)
     - `Second Brain` (*424,846 interconnected workspace files* -> links to `/second-brain`)
     - `RUBRIC Carousels` (*Instagram carousel slide approval* -> links to `/apps/carousels`)
     - `Elements` (*Reusable `/robo` UI component library* -> links to `/apps/elements`)
   - Each item has a 28×28 rounded dark-orange square icon on the left, bold white title (`13px`), and muted grey subtitle (`11px`).
2. **`CALENDAR` Widget (Middle — 44% height)**:
   - Header: Calendar icon + `CALENDAR` + `OPEN CAL` button.
   - **Week Pill:** Centered dark pill `W43 · Oct 20 2026 (Tue)` (compute from the live date).
   - **Digital Clock Hero:** Live ticking clock in huge orange `Doto` font (`09:01:20 am`), subtitle `AEST · SYDNEY` (or local timezone), followed by a 3-column world clock row (`USA PT 15:01`, `USA ET 18:01`, `LONDON 23:01`).
   - **14-Day Availability Heatmap:** 3 rows labeled `9-12`, `12-3`, `3-6` × 14 columns of 10×10px rounded squares colored white (free), `#262522` (blocked), or `#FF5500` (key focus block).
   - **`WHAT'S NEXT` List:** 3 upcoming calendar items with orange dot indicators and right-aligned relative times (`in 45m`, `14:00`, `16:30`).
3. **`YOUTUBE STUDIO` Widget (Bottom — 22% height)**:
   - Header: Play triangle icon + `YOUTUBE STUDIO`.
   - Hero number: `202,000` in large orange `Doto` font + `SUBSCRIBERS`.
   - 3 recent video rows with mini horizontal orange progress bars comparing 48h view velocity.

### Right Column (`src/components/dashboard/RightColumn.tsx` — 24% viewport width)
1. **`EMAIL` Widget (Top — 33% height)**:
   - Header: Mail icon + `EMAIL` + `OPEN GMAIL` button.
   - Hero metric: `47` in large orange `Doto` font + `EMAILS PAST 24H` label on the right.
   - **`FLAGGED · NEEDS JAY` Section:** 3 interactive checkbox rows (`BetaShares Q4 Sponsor Deck approval — 2h`, `Anthropic Creator Partner invite — 5h`, `Stripe webhook failure alert — 7h`).
   - **`TODAY'S MIX` Segmented Bar:** Single horizontal stacked bar (`height: 8px`, rounded) split into 4 proportional segments + 2×2 legend below:
     - `9 PARTNERS` (`#FF5500`) · `14 LEADS` (`#F5A623`) · `6 PERSONAL` (`#22C55E`) · `18 OTHER` (`#3A3834`).
2. **`ROUTINES` Widget (Middle — 27% height)**:
   - Header: Clock icon + `ROUTINES` + `24h` badge.
   - Compact table with columns `TIME`, `ROUTINE`, `STATUS`:
     - Row 1 (Active): Orange pill `10:00` | `daily inbox digest team` + `DESKTOP` badge | `NEXT` in orange text.
     - Row 2: `11:00` | `deliverables tracker sync` + `HERMES` badge | `QUEUED` in muted grey.
     - Row 3: `14:00` | `brand watch domain scanner` + `DESKTOP` badge | `QUEUED`.
     - Row 4: `18:00` | `friday rubric recos generator` + `DESKTOP` badge | `QUEUED`.
3. **`SKILLS DECK` Widget (Bottom — 40% height)**:
   - Header: Lightning icon + `SKILLS DECK` + `+ ADD` button.
   - **2×3 Grid of Self-Triggered Skill Cards**:
     1. `/lead-research` (`HAIKU · HIGH` — green)
     2. `/proposal-writer` (`OPUS · HIGH` — purple)
     3. `/client-onboarding` (`SONNET · HIGH` — teal)
     4. `/automation-audit` (`SONNET · MEDIUM` — teal)
     5. `/call-recap` (`HAIKU · HIGH` — green)
     6. `/clean-up` (`HAIKU · LOW` — green)
   - **Card Interactions:**
     - **Model × Effort Matrix Popover:** Clicking the sliders/gear icon on any card opens an overlay grid with rows `HAIKU`, `SONNET`, `OPUS`, `FABLE` and columns `LOW`, `MEDIUM`, `HIGH`, `XHIGH`, `MAX`. Selecting a cell immediately updates that skill's routing configuration.
     - **Run (`▶`) Button:** Clicking the orange circular Play button triggers `POST /api/skills/run`, displays a spinning orange border while running, and pops up a clean **Skill Execution Report Modal** showing tokens used, model routed via Jev, and markdown output.

---

## 6. SUB-AGENT 3 SPECIFICATION: `agent-orbital-core`

### Mission
Build the centerpiece of the Home Dashboard (`src/components/dashboard/CenterOrbitalCore.tsx` — 52% viewport width): the Top Brand Header, the circular **Artifact Ring Inbox**, and the interactive **3D Dotted Second Brain Sphere**.

### Visual & Functional Requirements
1. **Top Brand Header**:
   - Centered lockup: Orange `PixelMascotLogo` + **`RUBRIC`** (bold white `Outfit`, `26px`) + **`Agentic`** (orange `#FF5500` `Doto` dotted font, `28px`) + **`OS`** (light white `Outfit`, `26px`).
   - Subtitle directly beneath: `Jay E | RoboNuggets` in muted monospace (`12px`) + 4 circular dark icon buttons (`Refresh workspace`, `Edit layout`, `Global search (/)`, `OS Settings`).
2. **Outer Ring: The Artifact Ring (`ArtifactRing.tsx`)**:
   - Arrange **36 circular artifact nodes** (`34px × 34px` dark circles with `#2A2825` borders and file-type icons) evenly around a circle of radius `235px` (`x = R * cos(θ)`, `y = R * sin(θ)`).
   - **Interactive Search Mode:**
     - Clicking any empty part of the ring or the search icon reveals a centered floating pill input inside the ring: `SEARCH ARTIFACTS` (e.g., typing `BETASHARES` or `ROBO`).
     - As the user types, non-matching nodes fade to `opacity: 0.15`, while matching nodes scale up (`scale(1.25)`) with a glowing `#FF5500` border and floating label badge.
   - **Artifact Inspection Modal:**
     - Clicking any artifact node opens a sleek dark modal displaying the artifact preview (HTML slide deck / PDF / Brand Book), client tag, creation date (`Created 2 days ago`), file path, an orange primary button `OPEN FILE`, and a secondary button `REVEAL IN FOLDER`.
3. **Inner Core: 3D Dotted Second Brain Sphere (`SecondBrainSphere3D.tsx`)**:
   - Positioned concentrically inside the Artifact Ring (`width: 360px`, `height: 360px`).
   - Render using Three.js (`THREE.Points` with custom radial canvas texture or instanced points) or a 60fps 3D projection HTML5 Canvas:
     - **Inner Dense Core:** Bright white dots (`#FFFFFF`) representing `SKILLS`.
     - **Mid Shell:** Clustered colored dots representing `MEMORY` departments (`#FF6B2B` Business, `#EF4444` Content, `#06B6D4` Personal, `#3B82F6` Product).
     - **Tilted Orbital Ring (Saturn-style):** An angled ring (`22°` tilt) of amber (`#F5A623`) and purple (`#8B5CF6`) particles representing `ROUTINES` and `APPLICATIONS`.
   - Smooth continuous slow rotation (`0.003 rad/frame`) + interactive mouse drag rotation and hover ripple.
   - **Bottom Callout:** Centered monospace label below the sphere: `CLICK TO OPEN SECOND BRAIN` (navigates to `/second-brain`).

---

## 7. SUB-AGENT 4 SPECIFICATION: `agent-second-brain`

### Mission
Build the full-screen **RUBRIC SECOND BRAIN** explorer (`src/app/second-brain/page.tsx`) with its top navigation bar, live file search (`Search 424,846 files... (/)`), and **6 interactive views**.

### Top Bar Layout
- Left: `← Back to the OS` button (returns to `/`) + `RUBRIC SECOND BRAIN` title + `424,846 FILES · PLAIN-TEXT ROUTED` badge.
- Center: Global search bar with keyboard shortcut `/` that filters visible nodes in real time.
- Right: 6 view switcher tabs: `3D orb` | `2D map` | `Timeline` | `Routines` | `Skills` | `Applications`. Keys `1`–`6` switch tabs (when not typing in an input).

### The 6 Tab Specifications
1. **Tab 1: `3D orb` (`Orb3DView.tsx`)**:
   - Full-viewport interactive 3D force/orbital particle cloud with floating HUD labels (`CLAUDE.md`, `MEMORY.md`, `SKILLS`, `BUSINESS`, `CONTENT`, `PERSONAL`, `PRODUCT`, `ROUTINES`, `APPLICATIONS`).
   - Zooming in reveals individual file names (`/tone`, `/thumb`, `business.md`, `beta-shares-deck.html`) and glowing connection lines between `MEMORY.md` and department files.
2. **Tab 2: `2D map` (`Map2DView.tsx`)**:
   - Top-left sub-mode toggle pills: `Force` | `Circle` | `Hex` | `Rings` (default to `Rings`, the concentric radial sunburst/network map).
   - **Concentric Ring Anatomy:**
     - **Bullseye Center:** `CLAUDE.md` / `AGENTS.md` + `MEMORY.md` router nodes.
     - **Inner Ring 1:** White nodes for all `Skills` (`/tone`, `/thumb`, `/robo`, `/wildcard`, `/animate`, `/cut`, etc.).
     - **Middle Wedges:** Color-coded angular sectors for each department (`Business` in orange, `Content` in red, `Personal` in cyan, `Product` in blue, `Community` in green).
     - **Outer Rings:** `Routines` (amber) and `Applications` (purple).
   - **Dual Inspection Drawers:**
     - Clicking any node (e.g., `/tone` or `/thumb`) opens a **Left Node Summary Card** (showing inbound/outbound links, token weight, and file path) and a **Right Markdown Viewer Drawer** rendering the full `SKILL.md` or `.md` file contents with syntax highlighting and quick-edit capability.
3. **Tab 3: `Timeline` (`TimelineView.tsx`)**:
   - Horizontal chronological matrix spanning `August` · `September` · `October 2026`.
   - 9 horizontal swimlane rows: `Applications`, `Routines`, `Memory`, `Content`, `Community`, `Product`, `Personal`, `Business`, `Skills`.
   - Each cell plots daily edit activity as vertical bar histograms + clickable node clusters showing exact files modified by Claude on that date.
4. **Tab 4: `Routines` (`RoutinesAnalyticsView.tsx`)**:
   - **Top Half (Token & Cost Leaderboard):** 3-column grid of scheduled routine cards sorted by weekly token consumption (e.g., `#1 Competitor & Brand Watch — 18.2M tok/wk · $9.44/wk`, `#2 Daily Inbox Digest — 6.4M tok/wk · $3.10/wk`). Includes an interactive **Weekly Budget Cap Slider** (e.g., cap from `$10/wk` down to `$4/wk`) and an `ACTIVE` vs `PASSIVE` badge toggle.
   - **Bottom Half (7-Day Weekly Schedule Matrix):** Columns `M`, `T`, `W`, `TH`, `F`, `SA`, `SU` × hourly rows (`06:00` to `22:00`) showing time blocks where each routine executes.
5. **Tab 5: `Skills` (`SkillsAnalyticsView.tsx`)**:
   - **Left Half (D3 Circle-Packing Bubble Chart):** Nested proportional circles where area equals weekly token cost. `Animate` (`/animate`) is the largest central warm-brown/orange circle (`$256/wk`), surrounded by `/robo` (`$74/wk`), `/cut` (`$52/wk`), `/proposal-writer` (`$38/wk`), `/thumb`, `/tone`, and `/grammar` (`$0.40/wk` on Haiku).
   - **Right Half (Ranked Bar Leaderboard):** Filter pills at top (`Most used` | `Tokens/week` | `API $/week`) + horizontal progress bars with model routing badge (`OPUS`, `SONNET`, `HAIKU`, `JEV ROUTED`) and one-click `Optimize to Haiku/Sonnet` action button.
6. **Tab 6: `Applications` (`ApplicationsView.tsx`)**:
   - Displays connected external tools grouped by the **Connector Hierarchy**:
     1. **CLI Tools (Lightest — 0 context overhead):** `ffmpeg`, `gh`, `aws`, `premiere-cli`.
     2. **Direct APIs (Medium weight):** `YouTube Data API`, `MyFitnessPal Scraper API`, `Direct Image/Video Gen API`.
     3. **MCP Servers (Heaviest — preloaded context cost):** `Google Calendar MCP`, `Gmail MCP`, `Slack MCP`, `Excalidraw MCP` with a "Context Bloat Meter" showing tokens consumed at session startup and a toggle to disable unused MCPs.

---

## 8. SUB-AGENT 5 SPECIFICATION — SUPERSEDED
See `MICRO_APPS_SPEC.md` (Sub-Agents 5A–5D).

---

## 9. SUB-AGENT 6 SPECIFICATION: `agent-mods-and-shell`

### Mission
Build the floating/docked **Claude Code `Usage Mod` Bar** and assemble the root OS Shell (`src/app/page.tsx` and `src/app/layout.tsx`).

### 1. Claude Code `Usage Robo Bar` (`src/components/mods/UsageRoboBar.tsx`)
- A sleek, collapsible bottom-center HUD bar (`height: 38px` collapsed, expands upward on click) modeled after Jay's custom Claude Code extension:
  - **`USAGE 7D` Meter:** 10-dot progress indicator + `68% left` badge.
  - **`5H` Meter:** 10-dot progress indicator + `84% left` badge.
  - **Prompt Cache Status Pill:**
    - Toggleable simulation between **`WARM`** (glowing orange/red badge `🔥 WARM · 51m left · 186k cached`) and **`COLD`** (icy blue badge `❄️ COLD · Idle 11h 30m · 600k tok`).
  - **Expandable Cache Telemetry Drawer:**
    - Displays exact short-term memory context stats: `Context Window: 186,420 / 1,000,000 tokens (18.6%)`.
    - Shows next-message cost comparison: `Warm Cache Next Msg: $0.14` vs `Cold Cache Reload Penalty: $4.92 (Opus 5.5)`.
    - **Self-Ping Keep-Alive Switch:** Toggle `[✓] Auto-ping session every 55m (Extends cache to 4h · Est. savings: $437/mo)`.
    - **Jev Router Status Pill:** `JEV 5.5 ACTIVE · 4,451 routes · $0.18 total`.

### 2. Root Dashboard Assembly (`src/app/page.tsx`)
- Renders the full-viewport (`h-screen w-screen overflow-hidden p-3 bg-[#0A0A0A]`) 3-Column Bento Grid:
  - `grid-cols-[24%_52%_24%]` (with responsive fallback on smaller screens).
  - Mounts `LeftColumn`, `CenterOrbitalCore`, and `RightColumn`.
  - Mounts `UsageRoboBar` docked cleanly at the bottom center of the viewport.
  - Registers global keyboard shortcuts (`/` to focus Artifact search, `Esc` to close modals/drawers) — via the window events in `INTEGRATION_CONTRACTS.md`.

---

## 10. ACCEPTANCE & VERIFICATION CHECKLIST (FOR LEAD AGENT)
1. `npm run build` succeeds with zero TypeScript or Next.js errors.
2. Home Dashboard (`http://localhost:50000`) renders all 3 columns (`MICRO APPS`, `CALENDAR`, `YOUTUBE STUDIO` | `RUBRIC Agentic OS` header, 36-node `Artifact Ring`, rotating `3D Dotted Sphere` | `EMAIL`, `ROUTINES`, `SKILLS DECK`) inside a single `100vh` screen without vertical page scrollbars.
3. Typing in `SEARCH ARTIFACTS` inside the center ring filters and highlights matching artifact nodes in `#FF5500` and opens the artifact preview modal on click.
4. Clicking the settings icon on any card in `SKILLS DECK` opens the `HAIKU/SONNET/OPUS/FABLE` × `LOW/MEDIUM/HIGH/XHIGH/MAX` routing popover, and clicking `▶` executes `/api/skills/run` and displays the output report.
5. Clicking the central 3D sphere opens `/second-brain` with all 6 working tabs.
6. All micro-apps (`/apps/editor`, `/apps/recos`, `/apps/generations`, `/apps/carousels`, `/apps/scripts`, `/apps/elements`) and the bottom `UsageRoboBar` prompt-cache monitor are fully interactive.
