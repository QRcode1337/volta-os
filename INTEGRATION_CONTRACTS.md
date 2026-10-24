# INTEGRATION CONTRACTS (binding for every sub-agent)

Phase 0 is done. These rules override `HANDOFF_SPEC.md` / `MICRO_APPS_SPEC.md` where they differ.

## 0. Ground rules
- **Write only inside your owned paths** (table in §1). Read anything. If you need a change in a file you don't own, put a note in your final report instead of editing it.
- **Never edit** `package.json`, `src/types/os.ts`, `src/lib/**`, `src/app/globals.css`, configs. Need a type? Declare it locally in your own files.
- **Do not install packages.** Available: `next@15`, `react@19`, `three`, `@react-three/fiber` (no drei), `d3` (+ `@types/d3`), `lucide-react`, Tailwind v4. Nothing else.
- **Do not run** `npm run build`, `npm run dev`, or anything that writes `.next/` — 9 agents share one checkout. Verify with `npx tsc --noEmit -p .` and only fix errors in **your** files (others are mid-flight).
- Network: no external API calls from the app (no fetches to third-party hosts). Everything is local + simulated.
- Path alias: `@/` → `src/`.
- Every interactive component file starts with `'use client'`. Keep route `page.tsx` files thin; export `metadata` only from server components.
- **No hydration mismatches:** no `Math.random()`, `Date.now()` or `new Date()` during render. Use `seededRandom()` from `@/lib/mock-data`, or compute time-based values inside `useEffect` after mount.
- `three` must only run client-side: create renderers in `useEffect`, dispose on unmount (geometry, material, renderer, `cancelAnimationFrame`, resize observers). If you import a component that touches `window` at module scope, load it with `next/dynamic` + `{ ssr: false }` from a client component.
- Body is `overflow: hidden; user-select: none` globally. Full-page apps must render a root `<div className="h-screen w-screen overflow-hidden …">` and use internal scroll regions with class `hud-scroll`. Inputs/textarea stay selectable (handled in globals.css).

## 1. Ownership map
| Agent | Owns |
|---|---|
| 1 backend-and-robo-ui | `src/app/api/workspace/**`, `src/app/api/skills/**`, `src/app/api/jev-router/**`, `src/app/api/cache-status/**`, `src/app/api/files/**`, `src/components/robo-ui/**`, `workspace/**` (except runtime writes by other agents' APIs) |
| 2 bento-widgets | `src/components/dashboard/LeftColumn.tsx`, `src/components/dashboard/RightColumn.tsx`, `src/components/dashboard/widgets/**` |
| 3 orbital-core | `src/components/dashboard/CenterOrbitalCore.tsx`, `src/components/dashboard/ArtifactRing.tsx`, `src/components/dashboard/SecondBrainSphere3D.tsx`, `src/components/dashboard/orbital/**` |
| 4 second-brain | `src/app/second-brain/**`, `src/components/second-brain/**` |
| 5A rubric-editor | `src/app/apps/editor/**`, `src/components/editor/**`, `src/app/api/editor/**` |
| 5B rubric-recos | `src/app/apps/recos/**`, `src/components/recos/**`, `src/app/api/recos/**` |
| 5C generations-carousels | `src/app/apps/generations/**`, `src/app/apps/carousels/**`, `src/components/media/**`, `src/app/api/media/**` |
| 5D scripts-elements | `src/app/apps/scripts/**`, `src/app/apps/elements/**`, `src/components/scripts/**`, `src/components/elements/**` |
| 6 mods-and-shell | `src/components/mods/**`, `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/not-found.tsx` |

## 2. Shared modules (already exist — import, don't copy)
- `@/types/os` — all interfaces, incl. integration types (`SkillRunRequest/Result`, `JevRouteResult`, `WorkspaceResponse`, `WorkspaceFileResponse`, `VideoClip`, `ConnectorItem`, `EditorInboxItem`, `UsageSnapshot`, `RecommendationCardExt`).
- `@/lib/mock-data` — `MICRO_APPS`, `ARTIFACTS` (36), `CALENDAR_EVENTS`, `AVAILABILITY`, `HOME_CLOCK`, `WORLD_CLOCKS`, `YOUTUBE_*`, `FLAGGED_EMAILS`, `EMAIL_MIX`, `EMAILS_PAST_24H`, `ROUTINES` (first 4 = home widget rows), `ROUTINE_DISPLAY_NAMES`, `SKILLS`, `SKILL_DECK_IDS`, `CONNECTORS`, `BRAIN_NODES`, `BRAIN_EDGES`, `TIMELINE_ACTIVITY`, `TIMELINE_DEPARTMENTS`, `RECOMMENDATIONS` (12), `VIDEO_CLIPS` (8), `SEED_PINS` (7), `EDITOR_PROJECTS`, `EDITOR_SCENE_KEYS`, `EDITOR_FPS`, `USAGE_SNAPSHOT`, `DEPARTMENT_COLORS`, `DEPARTMENT_LABELS`, `MODEL_COLORS`, `MODEL_TIERS`, `EFFORT_LEVELS`, `OS_OWNER`, `TOTAL_BRAIN_FILES`, `seededRandom`, `formatHMS`.
- `@/lib/format` — `formatTokens`, `formatUsd`, `formatInt`, `formatTimecode(sec, fps)`.
- `@/lib/cn` — `cn(...classes)`.
- `@/lib/events` — `OS_EVENTS.focusSearch` / `OS_EVENTS.escape` window CustomEvents, `emitOsEvent`, `isTypingTarget`.
- `@/lib/editor-inbox` — `pushToEditorInbox(item|items)`, `readEditorInbox()`, `clearEditorInbox()`, `EDITOR_INBOX_EVENT`.
- `@/lib/server/workspace` (server only) — `WORKSPACE_DIR`, `resolveWorkspacePath` (blocks traversal), `readWorkspaceFile`, `writeWorkspaceFile`, `appendWorkspaceFile` (returns `{before, after}` for diffs), `listWorkspaceFiles`. **All disk writes go through these. Never write outside `./workspace`.**
- `@/components/robo-ui` — `HudPanel` (`title, icon?, actions?: {label,onClick?,href?,primary?}[], headerExtra?, className?, bodyClassName?, children`), `HudPill`, `ModelEffortBadge` (`model, effort?, label?, size?`), `PixelMascotLogo` (`size?, color?`). Agent 1 may restyle internals and add new components but **must not change these prop signatures**.
- Tailwind tokens: `bg-obsidian bg-panel bg-panel-elevated bg-panel-hover border-subtle border-highlight text-paper text-secondary text-muted text-orange bg-orange text-amber text-green text-purple text-teal font-doto font-mono font-serif`, plus `text-dept-business` etc. CSS classes `.hud-label .hud-card .hud-scroll .robo-pulse .robo-spin`.

## 3. Component export contracts (home dashboard)
`src/app/page.tsx` (agent 6) imports exactly these **named** exports, each rendered with **no props**, each filling its parent (`h-full w-full min-h-0`):
- `import { LeftColumn } from '@/components/dashboard/LeftColumn'` (agent 2)
- `import { RightColumn } from '@/components/dashboard/RightColumn'` (agent 2)
- `import { CenterOrbitalCore } from '@/components/dashboard/CenterOrbitalCore'` (agent 3)
- `import { UsageRoboBar } from '@/components/mods/UsageRoboBar'` (agent 6) — positions itself (fixed, bottom-center, z-40).
The bottom ~46px of the viewport is reserved for the collapsed UsageRoboBar: columns must not put critical controls in the bottom 46px of the center column; agent 6 pads accordingly.

## 4. Keyboard contract
- Home shell (agent 6) listens on `window` keydown: `/` (when `!isTypingTarget`) → `preventDefault` + `emitOsEvent(OS_EVENTS.focusSearch)`; `Escape` → `emitOsEvent(OS_EVENTS.escape)`.
- Agent 3's ArtifactRing listens for `focusSearch` (opens + focuses SEARCH ARTIFACTS) and `escape` (closes search/modal). Agent 2's popovers/modals listen for `escape`.
- Full-page apps (second brain, micro-apps) register their own key handlers locally; they are separate routes so no conflicts.

## 5. API contracts
| Route | Owner | Contract |
|---|---|---|
| `GET /api/workspace` | 1 | → `WorkspaceResponse` |
| `GET /api/files?path=skills/tone/SKILL.md` | 1 | → `WorkspaceFileResponse` (falls back to the `SKILLS[].markdownContent` / node `content` if file missing, `exists:false`) |
| `PUT /api/files` `{path, content}` | 1 | writes via `writeWorkspaceFile` → `WorkspaceFileResponse` (used by Second Brain quick-edit) |
| `POST /api/skills/run` | 1 | body `SkillRunRequest` → `SkillRunResult`. **Live mode only when env `RUBRIC_CLAUDE_LIVE=1`** (then `execFile('claude', ['-p', prompt, '--model', model.toLowerCase()], {timeout:15000})`, fall back to mock on any error). Default = mock with ~1.2s delay and realistic per-skill report. Mock reports must never actually kill processes or delete files. |
| `POST /api/jev-router` | 1 | body `JevRouteRequest` → `JevRouteResult` (deterministic keyword heuristics) |
| `GET /api/cache-status` | 1 | → `UsageSnapshot` (from `USAGE_SNAPSHOT`; accepts `?state=COLD` to flip) |
| `POST /api/editor/apply-feedback` | 5A | appends RL rules under `## Learned Preferences (RL Log)` in `skills/cut/SKILL.md` / `skills/animate/SKILL.md` → `{ files: {path, before, after}[] }` |
| `POST /api/recos/apply` | 5B | applies carted recos inside `./workspace` → `{ results: {id, files: string[], summary}[] }` |
| `POST /api/media/promote` | 5C | appends asset metadata to `skills/thumb/SKILL.md` → `{ path, before, after }` |

Clients must handle API failure gracefully (toast + keep UI usable).

## 6. Cross-app hand-off
Generations ("Send to RUBRIC Editor"), Scripts ("Push Cues to RUBRIC Editor") and Carousels call `pushToEditorInbox(...)` then show a toast with a link to `/apps/editor`. The Editor on mount (and on `EDITOR_INBOX_EVENT`) reads the inbox, appends items as new clips (numbered after existing ones; `sceneKey` default `'title-reveal'`), then `clearEditorInbox()`.

## 7. Shared micro-app chrome
Every micro-app & Second Brain has a top bar with a `← Back to RUBRIC OS` link (`next/link` to `/`), the `PixelMascotLogo`, and the app title in `Outfit` bold + a `Doto` orange accent word. Same dark HUD look as the home dashboard.

## 8. Workspace files that other agents depend on (agent 1 must create)
- `workspace/skills/<name>/SKILL.md` for every command in `SKILLS` — each **must** contain a `## Learned Preferences (RL Log)` heading (editor and media APIs append under it).
- `workspace/CLAUDE.md`, `AGENTS.md`, `MEMORY.md`, `departments/{business,content,product,personal,community}.md`, `routines/<id-without-r->.md` for each routine (`brandwatch.md`, `inbox.md`, …), `applications/<connector-id>.md`, `videos/clips/` (placeholder README), `artifacts/` (a few small real HTML artifacts, e.g. `artifacts/betashares/q4-sponsor-deck.html`, `artifacts/robo/robo-brand-book.html`).
- Keep the whole `workspace/` small (< 2 MB, text only).
