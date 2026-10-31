# VOLTA OS — Agent Handoff (2026-10-25)

You're picking up **VOLTA OS**: Patrick's local dashboard over his whole digital life: memory systems, research corpus, creative/video tools, agent fleet. Read this whole file before touching code.

## Run & repo
- **Location:** `~/Volta-OS` (moved out of iCloud-synced `~/Documents`). Next.js 15 App Router, TypeScript, Tailwind v4, React 19, three, d3, lucide-react.
- **Git:** private remote https://github.com/QRcode1337/volta-os, branch `main`. Commit with clear messages and **no attribution lines**. Never commit `.env.local`.
- **Server:** runs under LaunchAgent `com.epsilon.volta-os` (`next dev --turbopack -H 127.0.0.1 -p 50000`), log `~/Library/Logs/volta-os.log`. Restart with `launchctl kickstart -k gui/$(id -u)/com.epsilon.volta-os`. It hot-reloads, so don't run `next build` beside it. For a check build use `NEXT_DIST_DIR=.next-verify next build`, then delete `.next-verify`.
- **iPhone access:** `tailscale serve --https=8447` → https://patricks-macbook-pro-1.tail6e6059.ts.net:8447. Private routes allow the tailnet host only when `Tailscale-User-Login` matches `VOLTA_TAILNET_USERS` (env in the LaunchAgent plist).
- **Verify:** `npx tsc --noEmit -p . 2>&1 | grep -v certificate` (the certificate lines are sandbox noise). curl pages and APIs on `http://localhost:50000`.

## Hard rules
- **Security:** every private route goes through `src/lib/server/local-only.ts`. GETs use `rejectNonLocalRead` or the `localJson` wrapper in `route-helpers.ts`. Mutations use `rejectNonLocalMutation`, which requires JSON and same-origin. Mask secrets with `src/lib/server/redact.ts`.
- **Read-only:** treat the user's data sources as read-only (LTM SQLite, vaults, Notion, OpenClaw DBs, Honcho). Writes go only to `./workspace`, `config/`, or `/Volumes/Windsor/VOLTA/**`.
- **Keys:** all keys live in `~/Volta-OS/.env.local` (git-ignored) and are read server-side only. Never print them and never send them to the client. Present: XAI, ELEVENLABS, NOTION_TOKEN, MANUS, NETLIFY, RUNWAY, TYPESAFE_JEV/PRODUCTION, GITHUB_TOKEN, REPLICATE_API_TOKEN, OMNIROUTE_API_KEY (a new VOLTA key may have been minted), GEMINI_API_KEY, PODCAST_FEED_TOKEN (if the podcast finished).
- **No API billing for LLM text:** route through OmniRoute combos (`src/lib/server/llm/*`, `config/llm-routes.json`) or the local LM Studio model `qwen/qwen3.5-9b` at `127.0.0.1:1234/v1`. `claude -p` is acceptable (Max plan). Paid media APIs (xAI, ElevenLabs, Runway, Replicate) need a confirm-before-spend quote step.
- **Honest data:** no invented numbers. Label estimates. Write hydration-safe React. Poll no faster than every 60s, and pause polling when the tab is hidden.
- **Disk:** the SSD has about 23 GB free, Windsor about 22 GB (exFAT, no permissions), Voltamachina about 23 GB. Put bulky output on Windsor. Flag anything over 500 MB before doing it.
- **iCloud placeholders:** most of `~/Documents` is dataless. Detect a placeholder with `stat.blocks === 0 && size > 0` and **never read its contents**. Offer `brctl download "<path>"` instead.

## What exists (all on real data)
- **Home:** LTM heatmap, Today, Memory Sources, real routines, skills deck, recent-notes ring, an "Awaiting you: N" badge (from Tasks), and a usage bar.
- **Second Brain:** vault wikilink graph, LTM timeline, routines, skills, MCP.
- **Apps** (`src/app/apps/*`):
  - **Capture and memory:** ltm, honcho (streaming chat), search (⌘K across all sources, JEV re-rank), sessions (Claude Code transcripts).
  - **Systems and agents:** systems (services, models, storage), tasks (OpenClaw `actions.md`), feeds (cron outputs, JEV triage).
  - **Research:** phase 1. Inventory of Science/AI/Q/GRIMIORE plus Voltamachine Stage A summaries, syntheses and graphify threads.
  - **Creative:**
    - generations: xAI image/video, ElevenLabs TTS, Replicate key available.
    - studio: HyperFrames/Remotion/ffmpeg render queue, Flow tab.
    - editor: real renders, spatial pins, Notion episode tagging.
    - scripts, carousels, recos: all from Notion.
    - music: VANTA VECTOR library plus a Suno panel.
  - **Links:** launchpad (OmniRoute, OpenClaw, Netlify, git repos, Notion pins), elements (design system).
- **JEV** (Typesafe classifier): `src/lib/server/jev/*`. Telemetry goes to `/Volumes/Windsor/VOLTA/jev/telemetry.json`.
- **Suno:** `gcui-art/suno-api` runs on `127.0.0.1:3010` (LaunchAgent `com.epsilon.suno-api`, installed at `/Volumes/Windsor/VOLTA/services/suno-api`). **It's waiting on the user** to paste `SUNO_COOKIE` and `TWOCAPTCHA_KEY` into that folder's `.env`.
- **Local LLM:** llmster, the LM Studio app and Honcho all share port `:1234` and a single `qwen/qwen3.5-9b` model (6 GB). Honcho config is in `~/ErisMorn/projects/honcho/.env`.

## In flight when this was written (check `git status` / `git log`)
1. **Daily Briefing podcast:** `src/*/podcast/**`, `scripts/podcast-*`, `config/podcast.json`.
   - Pipeline: deep research (`claude -p` with web tools) → JEV rank → script (OmniRoute `long-write`) → Gemini two-speaker TTS → `/Volumes/Windsor/VOLTA/podcast/`. Private RSS at `/api/podcast/feed.xml?token=…`.
   - LaunchAgent `com.epsilon.volta-podcast` is written but **not loaded**; the user must OK it.
   - If the files are uncommitted, finish verifying, commit and push.
2. **OmniRoute gateway + quota:** `src/lib/server/{llm,quota}/**`, `src/app/api/{llm,quota}/**`, `config/llm-routes.json`, `UsageRoboBar.tsx`.
   - Task → combo mapping: research-web → `agem`, long-write → `SmartSpread`, quick → local qwen → `free-stack`, code → `codex-first`, video-prompts → `video`, deep-reasoning → `top-tier`.
   - Quota comes from CodexBar (`~/Library/Application Support/com.steipete.codexbar`) plus OmniRoute usage.
   - The old shell `OMNIROUTE_API_KEY` was invalid; a dedicated "volta-os" key was being created. Combos live in `~/.omniroute/storage.sqlite` (`combos` table).
3. **Research drive diff:** a separate Haiku session is re-scanning `/Volumes/Voltamachina` to compare against iCloud. Output goes to `/Volumes/Windsor/VOLTA/research/drive-diff/`. The first pass said 19,272 files / 22.5 GB missing, but the user says his copies are on Voltamachina under other names.

## Next up (priority order)
1. ~~Launcher Podcast entry~~ done (`d3bc7d6`). Podcast shipped in `f9bda50`: episode ~$0.20 (Gemini TTS), confirm >$0.50, cap $1.00; 06:00 LaunchAgent still not loaded.
2. **Launchpad:** use `GITHUB_TOKEN` to list real GitHub repos. 84 of 91 local repos are iCloud placeholders, so local scans miss them.
3. **Feeds:** tighten JEV triage. 108 of 238 items are marked needs-action, which is too many. Adjust the labels or thresholds.
4. ~~**Research phase 2**~~ done (2026-10-30): `src/lib/server/research/phase2.ts`, `/api/research/phase2`. All 6.9k library rows embedded with Ollama `nomic-embed-text` from what is already local (titles, folders, Stage A summaries/claims, local md/txt heads), no iCloud hydration. Index in `/Volumes/Windsor/VOLTA/research/phase2/`; 48 k-means threads named through the LLM router `quick` task; hybrid search (Semantic toggle, on by default) and "Nearest by meaning" in the doc panel. Build/Update and Name clusters buttons on Status. Graphify graphs moved to `/Volumes/Windsor/VOLTA/research/graphs/` (the iCloud originals were evicted, which emptied Threads). Next: embed full text from the Voltamachina mirror PDFs (still no hydration), then Phase 3, a research assistant with cited sources.
5. **iPhone/iPad capture:** an iOS Shortcut "Share to VOLTA" that POSTs links, text and screenshots over Tailscale to a new inbox route. That route needs a token, because Shortcuts don't send the Tailscale identity header.
6. **Agent-built video:** Studio presets that brief Claude Code, Codex, Grok Build or Manus (`MANUS_API_KEY`) to build videos with Blender MCP, three.js, HTML/JS, HyperFrames or Remotion. Outputs go to the render queue.
7. **VOLTA Cut:** a timeline in the Editor that exports to a HyperFrames or Remotion project and renders via Studio. Don't build a new render engine.
8. **Orchestra OS ports** (survey done): agent 1:1 chat via OmniRoute, agent status cards, and reading `~/.openclaw/state/openclaw.sqlite` directly for routines (faster than the CLI). Cron "Run now/pause" buttons need the user's OK, because Systems is read-only by design.
9. **Housekeeping:** `/api/cache-status` still shows mock "simulated" Jev numbers. claude-mem's observer credentials have been refused for ~15 h. The OpenClaw control panel tailnet link (:8443 → 18790) has nothing listening.

## Open questions for the user
- Load the podcast LaunchAgent (06:00 daily)?
- Allow cron Run-now/Pause controls in VOLTA?
- Rotate the keys that were pasted into chat or leaked: Manus, Typesafe x2, Runway, Notion, the two Google `AIzaSy…` keys and the two passwords from the CODED API note.
