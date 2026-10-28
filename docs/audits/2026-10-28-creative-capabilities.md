# Creative capabilities audit: video, image and music in VOLTA OS

**Date:** 2026-10-28
**Scope:** This audit is read-only. It changes no code and no config, and it does not print any key values.

**The question:** Do Claude and Codex/ChatGPT now cover video, image and music natively? What does VOLTA already have? Where is the overlap, and what single changes give the most leverage without adding bloat?

---

## 0. TL;DR

- **Most of the claim is outdated.** As of 2026-10-28:
  - Neither Claude nor Codex generates video pixels.
  - Neither one generates music.
  - Codex/ChatGPT does generate images, and that is included in the subscription.
  - OpenAI shut down Sora: the app closed on 2026-04-26 and the API on 2026-09-24.
  - Claude's new "Motion" feature writes code-based animation. Anthropic's own words: "doesn't use a video generation model". It is also limited to the Team and Enterprise plans.
- **So HyperFrames/Remotion is still the right engine for motion graphics,** and Claude Code (Max) driving HyperFrames remains the core of the video stack. Generated footage still comes only from metered APIs: xAI Grok Imagine and Gemini Omni Flash. VOLTA's Generations app already has both wired.
- **The biggest gains come from swapping, not adding:**
  1. Use Codex's built-in `image_generation` (gpt-image-2, included in the ChatGPT plan) for thumbnails and stills.
  2. Make Gemini TTS, which VOLTA already uses for the podcast, the default voiceover.
  3. Replace the unofficial Suno bridge, which needs a cookie plus 2Captcha, with Lyria via the Gemini key that is already configured. Otherwise keep using Suno manually and let the library index the files.
  4. Delete dead skills: the `sora` skill, and the `ai-video-generation` and `ai-image-generation` skills, which need the `belt` CLI that is not installed.
  5. Add a Whisper caption preset; `mlx_whisper` is already installed.
- **Licensing risk:**
  - **ElevenLabs** is on the **Free tier**, which has no commercial license. Anything voiced there should not go into monetized videos.
  - **Suno** grants commercial rights only on Pro or Premier.

---

## 1. Verified capabilities (external, as of 2026-10-28)

Each row is marked: **V** = verified on an official page this session; **V2** = verified by the research sub-agent from an official page; **S** = secondary source or search snippet only; **U** = unverified.

### 1a. Anthropic / Claude

| Capability | Reality | Surface / plan | Status |
|---|---|---|---|
| Video (pixels) | **None.** There is no video model. | n/a | V2 (API features overview has no image, audio or video output) |
| "Claude Motion" | Claude writes code that animates text, charts, shapes and images, then exports an MP4. It produces no generated footage and no AI people. Audio is not mentioned. | claude.ai app only. **Beta, Team and Enterprise only** (not Pro or Max). Published 2026-10-08. | **V** |
| Images (pixels) | **None.** Claude can make HTML, SVG and canvas output (Claude Design, artifacts, the `canvas-design` and `algorithmic-art` skills) and render it to PNG with code. | App and Code | V2 |
| Music / TTS | **None** through the API. Voice mode in the app speaks replies aloud, but it is not an export or TTS API. | App only | V2 |
| Claude Code on a subscription | Included in Pro and Max. VOLTA's decision log says "Claude Max via OAuth; never direct-API billing". | Max (already paid) | V2 + local evidence |
| Output ownership | The Consumer Terms assign outputs to the user. | — | V2 (terms effective 2025-10-08) |

**What this means:** "Claude does video without Remotion/HyperFrames" is true only in the sense that Claude Motion is a built-in code-to-MP4 engine. That engine is the same idea as HyperFrames, and Patrick's plan cannot use it. In Claude Code, Claude makes video by writing HyperFrames, Remotion, Manim or ffmpeg code. That is exactly what the installed skills do.

### 1b. OpenAI / Codex / ChatGPT

| Capability | Reality | Surface / plan | Status |
|---|---|---|---|
| Images | **Yes.** Codex has a built-in image-generation skill (`$imagegen`) on **gpt-image-2**. It works in the ChatGPT desktop and web apps, the Codex CLI and the IDE extension. It is **included in the subscription** and counts toward Codex limits, at roughly 3–5x the cost of a normal turn. When limits run out it draws on credits. It is not available on Free. Locally, `codex features list` shows `image_generation` as stable and on (codex-cli 0.153.4, logged in with ChatGPT). | Plus / Pro / Business (Go unclear) | **V** |
| ChatGPT Images 2.5 | Announced 2026-09-08 for "all ChatGPT, ChatGPT Work, and Codex users". | App | S (the page returned 403; this is from the search snippet) |
| Image API | gpt-image-2 / 2.5: $8 per 1M input tokens and $30 per 1M output tokens. gpt-image-1-mini: $2.50 / $8. | API, metered | V2 |
| Video (Sora) | **Shut down.** The Sora 2 models and the Videos API were shut down on **2026-09-24**. OpenAI says there is "no one-to-one replacement API." The app closed on 2026-04-26. | none | **V** (API page), S (app date) |
| Video in Codex | **None.** The Codex docs and pricing page list image generation and voice only. | — | **V** |
| Music | **No launched product.** It is reported to be in development, with no timeline. | — | S / U |
| TTS | gpt-4o-mini-tts: $0.60 per 1M input tokens and $12 per 1M output tokens. tts-1: $15 per 1M characters. API only and metered. Voice in Codex Desktop costs $0.05/min from the Codex budget. | API | V2 / **V** |
| Output ownership | OpenAI assigns outputs to the user. | — | S (terms page returned 403) |

**What this means:** "Codex has image AND video AND music" is true only for **images**. That image capability is the one real, subscription-included creative feature Patrick is not using in VOLTA today.

### 1c. Comparison providers (official pricing pages)

| Provider | What | Price | Status |
|---|---|---|---|
| xAI Grok Imagine | Image $0.02–0.06. Video per second: 1.5-lite $0.02–0.14, base $0.05–0.07, 1.5 $0.08–0.25. | Metered API | V2, and matches VOLTA's live `/api/media/status` |
| Google Gemini API | Omni Flash video ≈ $0.10/s at 720p. The Veo 3.1 preview shut down on 2026-10-22. Images: Nano Banana ≈ $0.034–0.15. **Lyria 3.5 music $0.08/song** (30 s clip $0.04). **gemini-3.8-flash-tts** ≈ $0.00225 per 10 s; the price rises 2027-01-01. | Metered API | V2 (pricing page updated 2026-10-27) |
| ElevenLabs | TTS v4 $0.08/1K characters (Flash $0.04). Music API about $0.15/min. **Free plan has no commercial license.** Starter (≈$6) adds "Commercial License" and "Music commercial use". | Plan + credits | **V** |
| Suno | Free: no commercial rights. Pro $8/mo (annual) and Premier $24/mo include commercial rights. **No official public API.** | App | V2 |

### 1d. Hermes (local agent)

Sources: the `~/.hermes/` listing, `config.yaml` (non-secret keys) and the env-var names in `.env`.

- **Model routing:** `provider: omniroute`. Auxiliary models are `cx/gpt-5.6-sol-medium` and `agem`.
- **Toolsets:**
  - Enabled in the CLI: `image_gen`, `tts`, `vision`, `terminal` and others. `video_gen` is a known toolset but is **not enabled**.
  - Image plugins available: fal, xai, openai, openai-codex, krea, deepinfra, openrouter and meta-ai.
  - Video plugins available: fal, xai, deepinfra and openrouter.
  - No `image_gen` or `video_gen` provider is pinned in the config. Which provider is active is **U**.
- **Keys present (names only):** FAL_KEY, OPENAI_API_KEY, VOICE_TOOLS_OPENAI_KEY, ELEVENLABS_API_KEY, GEMINI_API_KEY, COMFY_CLOUD_API_KEY.
- **TTS:** The default is `edge` (en-US-AriaNeural). It also has elevenlabs, openai, gemini-2.5-flash-preview-tts, xai, mistral voxtral, neutts and piper configured. Edge TTS uses an unofficial free endpoint, so treat it as fine for drafts and unsafe for commercial publishing.
- **How Hermes does video today:** Hermes agent sessions write HyperFrames, Remotion and ffmpeg code. They follow the `hermes-video-pipeline`, `hyperframes*`, `kanban-video-orchestrator` and `documentary-video-editing` skills.
  - The `~/Documents/PROJECTS/hermes-video-pipeline` orchestrator plans shots for "remotion | hyperframes" engines.
  - Its `agents/render-agent.js` is a **stub**: it returns `status: 'queued'`.
  - The 55 mp4s under `production/` and `outputs/` came from agent sessions, not from the orchestrator.
  - So Hermes's strength is **orchestration and long-running sessions over the same code-based engines**, not a different kind of video capability.
- **Hermes skills that need attention:**
  - The `higgsfield-*` skills (7) are present but `disabled: true`.
  - `ai-video-generation` and `ai-image-generation` call the `belt` (inference.sh) CLI, which is **not installed**.

---

## 2. What VOLTA already has (inventory)

| Area | Where | What it does today | Status 2026-10-28 |
|---|---|---|---|
| **Studio** (render queue) | `src/lib/server/studio/{runner,config,args,index-projects,storage}.ts`, `config/studio-projects.json` | Runs one job at a time with nice 10 and no shell; only allowlisted argv for ffmpeg, node, npx, npm, python3 and bash. Projects: `hermes-pipeline` (orchestrator demo and smoke test), 3 Remotion projects (`hermes-remotion-promo`, `openmontage-composer`, `dialectics-video`), 1 HyperFrames project (`tiktok-warm-grain-grid`, pinned to hyperframes@0.6.64), 1 ffmpeg slideshow project, a plan-only `tiktok-four-files` project, and **ffmpeg Tools** (trim, concat, vertical 9:16, mux audio). Renders go to `/Volumes/Windsor/VOLTA/studio/renders/`. | Working. `remotion-animation-workflow` has no presets (dead entry). |
| **Generations** | `src/lib/server/media/{xai,gemini,elevenlabs,quotes,budget,pricing,jobs,storage,export,catalog}.ts` | Quote → confirm → generate flow, with a $5 per-request cap and a $20 per-day cap (shared with podcast TTS). Output goes to Windsor `generations/`. Providers: **xAI** (live catalog: 3 image models, 3 video models), **Gemini** (video only: Omni 1.1 Flash 720p, 16:9 or 9:16, at most 10 s), **ElevenLabs** (TTS; 7 models including eleven_v4). | All 3 keys configured. Today's spend is $0. **ElevenLabs is on the free tier** (2,044 of 10,000 credits used; resets 2026-11-24). |
| **Music** | `src/lib/server/music/{library,meta,config,suno}.ts`, `config/music.json` | Read-only library over two roots: VANTA VECTOR (`~/Documents/Audio/Music/vanta vector`) and Suno (`/Volumes/Windsor/VOLTA/music/suno`). Per-track metadata lives on Windsor. The Suno bridge goes through the **unofficial `gcui-art/suno-api`** LaunchAgent on :3010. | **Suno bridge `needs_setup`:** SUNO_COOKIE and TWOCAPTCHA_KEY are empty. The library works. |
| **Editor + NLE** | `src/lib/server/editor/**` (`nle/{export,filtergraph,hyperframes,text,peaks,thumbs,upload}.ts`, `skills.ts`, `feedback.ts`) | ffmpeg filtergraph export, NLE sequence → **HyperFrames composition**, review notes and apply-feedback. "Teach my /cut" and "/animate" map to the installed skills (`remotion-*`, `hyperframes*`, `documentary-video-editing`, `media-ingestion-and-video-processing`, `general-video`). | Working. Being refactored by another agent set. |
| **Podcast** | `src/lib/server/podcast/{tts,script,pipeline,...}.ts`, `config/podcast.json` | Two-host daily briefing using **gemini-3.8-flash-tts** (voices Kore and Charon). Script via OmniRoute or `claude -p`. Cost is logged into the daily cap. | Working. This is VOLTA's existing, cheapest voice path. |
| **Carousels / Scripts** | `src/lib/server/carousels/{decks,parse,state}.ts`, `src/components/scripts/*` | Parses Shorts and TikTok decks and scripts from the Notion Video Production index. Has a teleprompter and an outline view. **No image rendering.** | Working. Text only. |
| **LLM routing** | `src/lib/server/llm/**`, `config/llm-routes.json` | OmniRoute (:20128) runs on OAuth subscriptions only: Codex (gpt-5.6-sol/terra), xai-oauth, Antigravity (Gemini), with local qwen3.5-9b last. A `video-prompts` task exists. The free-stack is dead because OmniRoute's Claude OAuth has expired. | Text only. No media routes. |
| **Claude CLI runner** | `src/lib/server/claude.ts` (`runClaudeCli`) | Runs headless `claude -p` on Max. | Available to drive skills. |
| **Skills**: `~/.claude/skills` (99 user and 84 plugin skills reported by `/api/skills-real`) | — | Video: `hyperframes` + 8 `hyperframes-*`, **15 `remotion-*`**, `manim-video`, `ascii-video`, `general-video`, `documentary-video-editing`, `animated-documentary-motion`, `epistemic-documentary-blueprint`, `kanban-video-orchestrator`, `hermes-video-pipeline`, `media-ingestion-and-video-processing`, `media-production-prototyping`, `media-use`, `youtube-content`, `clip-description-matcher`, `watch:watch`. Image: `ai-image-generation`, `comfyui`, `canvas-design`, `algorithmic-art`, `baoyu-infographic`, `theme-factory`, `slack-gif-creator`. Audio and music: `songwriting-and-ai-music`, `heartmula`, `audiocraft-audio-generation`, `songsee`. Also `ai-video-generation`. | `ai-video-generation` and `ai-image-generation` are **dead** (`belt` is not installed). Several skills are duplicated as user copies and `claude-api:` plugin copies (canvas-design, algorithmic-art, theme-factory, frontend-design, web-artifacts-builder, slack-gif-creator). |
| **Codex skills** (`~/.codex/skills`) | — | `imagegen` (a **user copy** that uses the API: gpt-image-1.5 with OPENAI_API_KEY, so it is metered), `sora` (**dead**: the API was shut down 2026-09-24), `speech` (OpenAI TTS API, metered). | `sora` should go. The user `imagegen` may shadow the built-in subscription image generation (U; check). |
| **MCP** (`/api/mcp`) | — | Media-relevant: `heygen` (avatar video; needs auth), `blender` (3D), `stitch` (UI design), `MCP_DOCKER` (includes an HF-Space `flux1_schnell` image tool), `playwright` and `chrome-devtools` (HTML→PNG capture). This Claude session also exposes claude.ai connectors with media tools: a vidIQ connector (generate_video, b-roll, music, thumbnail, voiceover, credits-based) and a connector whose `creative_generate_image/video/speech` + `agents_*` tools look like ElevenLabs (**U**: inferred from tool names). | `agent-cards` returns 401. `jetbrains` and `my-pieces-memory` are unreachable. |
| **Local apps and binaries** | — | ffmpeg/ffprobe, **mlx_whisper** (`~/.local/bin`), codex-cli 0.153.4 (logged in with ChatGPT), ChatGPT.app, Claude.app, CapCut, Logic Pro. ComfyUI source is at `~/Documents/ComfyUI/COMFY-UI` (288 KB, no models). `hyperframes-0.7.107` is checked out in `~/Documents/PROJECTS`. | — |
| **Host constraints** | `/api/systems` | 24 GB RAM with memory pressure **warn** (12 GiB swap). Boot disk 96.4% used (about 17.5 GB free). Windsor has 29 GiB free and Voltamachina 33 GiB free; both are at the warn level. | Local diffusion and music models (ComfyUI, HeartMuLa, AudioCraft) are a poor fit right now. |

---

## 3. Fit analysis: job → best tool for Patrick now

**Cost key:**
- **SUB** means it reuses a subscription he already pays for: Claude Max, ChatGPT (plan tier U), or OmniRoute OAuth.
- **$** means metered.
- **Free** means local.

**Drivable** means VOLTA can run it today (✓), with a small addition (◐), or not at all (✗).

| Job | Claude-native | Codex/ChatGPT-native | Hermes | Studio (HF/Remotion) | Generations (xAI / Gemini / 11L) | Suno | ComfyUI/local | **Best now** |
|---|---|---|---|---|---|---|---|---|
| **Short vertical clips** (kinetic text, captions, 15–60 s) | Claude Code writes HyperFrames. SUB. ✓ via `claude -p` | Codex can write HF too. SUB | Same engines, long sessions. SUB | **Renders it.** Free. ✓ | Optional b-roll inserts. $ | — | — | **Claude Code + HyperFrames → Studio render** |
| **Explainer / motion graphics / data viz** | Same as above. Claude Motion is not on Max. | Same | Same | **Remotion (OpenMontage, dialectics) or HyperFrames**, Manim for math. ✓ | — | — | — | **HyperFrames by default, Remotion for the existing projects** |
| **B-roll / photoreal footage** | ✗ | ✗ (Sora is gone) | `video_gen` via fal or xai plugins (not enabled). $ | — | **xAI 1.5-lite $0.02–0.14/s; Gemini Omni $0.10/s at 720p.** ✓ with caps | — | Not viable on 24 GB with swap | **Generations (xAI lite for drafts, Omni or xAI 1.5 for finals)** |
| **Thumbnails / stills / carousel art** | HTML/SVG → PNG only (good for text-heavy designs). SUB | **gpt-image-2 built in. SUB** (counts toward Codex limits). Strong at text rendering. | `image_gen` (provider U). $ | HyperFrames can export stills | xAI image $0.02–0.06. ✓ | — | Not viable | **Codex `image_generation` (SUB), with xAI image as the metered fallback.** Claude HTML for typographic layouts. |
| **Voiceover / TTS** | ✗ | ✗ (the API TTS is metered; app voice is not exportable) | edge (free, unofficial), plus every TTS key | — | ElevenLabs (**Free tier: not commercial**). Gemini TTS lives only in podcast. | — | piper/neutts (free, lower quality) | **Gemini 3.8 Flash TTS** (≈$0.01/min, already in VOLTA). ElevenLabs only after upgrading to Starter. |
| **Music beds / songs** | ✗ | ✗ | `heartmula` skill (local) | — | ElevenLabs Music (paid tier for commercial use). **Lyria 3.5 is not wired.** | Pro/Premier, app only. The VOLTA bridge is unofficial and not configured. | HeartMuLa/AudioCraft (heavy) | **Suno app (if on Pro/Premier) → drop files into the library.** Add **Lyria via the existing Gemini key** for automated beds. |
| **Editing / assembly** | Claude Code + ffmpeg skills. SUB | Same | Same | **Editor NLE + ffmpeg Tools.** ✓ | — | — | — | **VOLTA Editor/NLE** (CapCut for manual polish) |
| **Captions / subtitles** | Writes SRT/HF captions from a transcript | Same | stt (local whisper base) | HF/Remotion caption components | ElevenLabs STT (connector) | — | **mlx_whisper installed** | **mlx_whisper → SRT → HyperFrames/ffmpeg burn-in** (◐: needs a Studio preset) |
| **Scripts / planning** | **Claude (Max).** ✓ | Codex via OmniRoute. ✓ | ✓ | — | — | — | — | Already covered (Scripts + `claude -p` + OmniRoute) |

**Headline:**
- **Code-driven video** (Claude Code or Hermes writing HyperFrames, rendered by Studio) stays the backbone, and it costs nothing beyond Max.
- **Pixels from a model** are split by medium:
  - **images** from Codex, included in the ChatGPT plan
  - **video** from xAI or Gemini, metered and already capped in Generations
  - **voice** from Gemini TTS, metered at a few cents
  - **music** from Suno manually, or from Lyria (metered, not wired yet)

---

## 4. Bloat check and recommendations

### 4a. Remove or demote (no new code)

| Item | Why | Action | Effort |
|---|---|---|---|
| `~/.codex/skills/sora` | The Sora API was shut down on 2026-09-24. The skill will fail. | Delete | S |
| `~/.claude/skills/ai-video-generation`, `ai-image-generation`, and the Hermes copies of both | They need the `belt` (inference.sh) CLI, which is not installed. They also duplicate xAI/Gemini behind another metered reseller. | Delete, or keep only as reference docs | S |
| Hermes `higgsfield-*` (7 skills, already `disabled: true`) | Yet another metered aggregator. Disabled, but still clutter. | Remove unless Higgsfield is actually subscribed | S |
| VOLTA **Suno bridge** (`music/suno.ts` + the unofficial `gcui-art/suno-api` LaunchAgent) | It needs the account cookie plus a **2Captcha key**, which means paying a service to solve Suno's CAPTCHAs. That is a ToS and account risk, it breaks easily, and it is still in `needs_setup`. | **Demote:** do not finish the setup. Keep the library indexing of the Suno folder. Remove the bridge in a later refactor pass, after the current src/ refactor lands. | S now, M to remove code |
| ElevenLabs as the default VO | The account is on the free tier, so outputs have no commercial license. | Either upgrade to Starter (≈$6/mo) or make Gemini TTS the default and keep 11L for drafts | S (decision) |
| 15 `remotion-*` skills | HyperFrames is the stated default ("HyperFrames is the default output framework"), and the Editor NLE exports HyperFrames. Remotion is needed only for the 3 existing projects. | Keep `remotion-best-practices` (router), `remotion-render`, `remotion-captions` and `remotion-recuts`. Archive the rest (`-maps`, `-interactivity`, `-markup`, `-chunked-rendering`, `-upgrade`, `-studio`, `-docs`, `-video-toolkit`, `-create`, `-render-pipeline`, `-multimedia`) unless one is used. | S |
| Duplicate user copies of Anthropic plugin skills (`canvas-design`, `algorithmic-art`, `theme-factory`, `frontend-design`, `web-artifacts-builder`, `slack-gif-creator`, `artifacts-builder`) | The `claude-api:` plugin already ships them, so both copies load. | Delete the user copies | S |
| `comfyui`, `heartmula`, `audiocraft-audio-generation` (local diffusion and music) | 24 GB RAM is already swapping 12 GiB, and both disks are at warn. Weights would add tens of GB. | Demote to "cloud only" (Hermes has COMFY_CLOUD_API_KEY) or archive | S |
| Studio `remotion-animation-workflow` entry | It has no presets and nothing to render. | Remove from `config/studio-projects.json` in a later pass | S |
| Hermes `video_gen` toolset | Not enabled, and it would duplicate Generations, which has quotes and caps. | Leave it off. Let VOLTA Generations be the single paid-video path. | — |

### 4b. Top 5 leverage moves (ranked: use or swap first, add last)

1. **Use Codex built-in image generation for thumbnails, carousel art and stills.** It is SUB, included in the ChatGPT plan.
   - It is already on (`image_generation` stable in codex-cli 0.153.4, logged in with ChatGPT).
   - Make sure the user `~/.codex/skills/imagegen` (API-billed gpt-image-1.5) is not shadowing it. Rename or remove it if it is.
   - Drive it headlessly with `codex exec` writing into `/Volumes/Windsor/VOLTA/generations/`. This could be a small Studio preset or a Generations "codex" provider with an est. $0 subscription cost and a note that it counts toward limits.
   - **Effort:** S (skill or preset) to M (Generations provider). **Recurring:** $0 extra, but it uses Codex limits 3–5x faster than a normal turn.
2. **Make Gemini TTS the default voiceover.**
   - `src/lib/server/podcast/tts.ts` already prices and chunks gemini-3.8-flash-tts and logs cost into the daily cap.
   - Expose it as a Generations "voice" provider beside ElevenLabs. This reuses that code and adds no new provider.
   - **Effort:** M. **Recurring:** about $0.01 per minute of VO; the price rises on 2027-01-01.
   - Alternative: upgrade ElevenLabs to Starter (S, about $6/mo) if Patrick prefers 11L voices for published work.
3. **Music: retire the Suno bridge and add Lyria to Generations** with the already-configured Gemini key, at $0.08 per song or $0.04 per 30 s clip.
   - It writes into the Music library roots, so the library picks the tracks up automatically.
   - Keep Suno as a manual app (commercial use needs Pro/Premier). Its downloads already index.
   - **Effort:** M. **Recurring:** cents per bed.
4. **Captions preset.** Add a Studio project with a `bash` wrapper that runs `mlx_whisper` to produce an SRT, plus an ffmpeg `subtitles=` burn-in preset (or feed the SRT to the HyperFrames caption components).
   - It uses installed tools, so nothing new is installed.
   - **Effort:** S. **Recurring:** $0.
5. **Skill diet (§4a).** Delete `sora`, the two `belt` skills, the higgsfield skills, the duplicate plugin copies and about 11 rarely needed `remotion-*` skills.
   - Fewer overlapping triggers mean Claude and Hermes pick the right video path (`hyperframes` entry) more reliably.
   - **Effort:** S. **Recurring:** $0.

### 4c. Do not add

- **No new video provider.** OpenAI has no video API now. xAI and Gemini already cover b-roll with quotes and caps. Revisit when OpenAI ships a Sora successor; reports of one ("Spud") are unverified.
- **No Claude Motion.** It needs a Team plan, and it is the same code-to-MP4 idea as HyperFrames, which VOLTA already renders locally with more control.
- **No local ComfyUI or music models** until RAM and disk pressure clears.
- **HeyGen MCP or vidIQ generation tools:** only if avatar or talking-head video becomes a real need. They are separate credit systems.

---

## 5. Questions for Patrick

1. **Which ChatGPT plan** do you pay for (Plus $20, Pro $100/$200/$500, or Business)? This decides how many Codex image generations fit before credits kick in.
2. **ElevenLabs:** the account is on the **free** tier. Are any published or monetized videos voiced with it? If so, upgrade to Starter, or should Gemini TTS become the default?
3. **Suno:** which plan (Free, Pro or Premier)? OK to retire the cookie+2Captcha bridge and use Suno manually plus Lyria for automated beds?
4. **Remotion vs HyperFrames:** OK to treat HyperFrames as the default for new work and archive about 11 of the 15 Remotion skills?
5. Do you use **vidIQ** or **HeyGen** generation (credits) in practice, or only for analytics?
6. Is the Gemini API key on a **paid** tier? Lyria, Omni video and TTS pricing above assume the paid tier.

---

## Sources (opened or checked 2026-10-28)

**Verified this session (opened directly):**
- OpenAI, Sora 2 model page: <https://developers.openai.com/api/docs/models/sora-2>. Status "Shut down"; the Sora 2 models and Videos API were shut down 2026-09-24 with "no one-to-one replacement API". The deprecation notice is dated 2026-03-24.
- OpenAI / ChatGPT, Codex image generation: <https://learn.chatgpt.com/docs/image-generation>. gpt-image-2, CLI/IDE/app, counts toward Codex limits at 3–5x. No video or audio. Undated page.
- OpenAI / ChatGPT, Codex pricing: <https://learn.chatgpt.com/docs/pricing>. Plans Free through Enterprise; image generation not on Free; credits after limits; Voice $0.05/min. Undated page.
- Anthropic, Dashboards and Motion: <https://claude.com/resources/articles/dashboards-and-motion>. Published 2026-10-08; "doesn't use a video generation model"; Team and Enterprise beta; MP4 export.
- ElevenLabs pricing: <https://elevenlabs.io/pricing>. Free has no commercial license; Starter adds "Commercial License" and "Music commercial use". Undated page.

**Local evidence:**
- `codex features list` (image_generation stable/true)
- `codex login status`
- VOLTA `/api/media/status`, `/api/systems`, `/api/skills-real`, `/api/mcp`, `/api/music/suno/status`, all at 2026-10-28T09:40Z

**Verified by the research sub-agent (official pages, fetched 2026-10-28):**
- Anthropic API features overview: <https://platform.claude.com/docs/en/build-with-claude/overview> (undated)
- Claude Motion help: <https://support.claude.com/en/articles/17454997> (updated about 2 weeks before 2026-10-28)
- Claude voice mode: <https://support.claude.com/en/articles/11101966>
- Claude pricing: <https://claude.com/pricing>
- Anthropic consumer terms: <https://www.anthropic.com/legal/consumer-terms> (effective 2025-10-08)
- OpenAI API pricing: <https://developers.openai.com/api/docs/pricing> (undated)
- xAI models and pricing: <https://docs.x.ai/docs/models> (undated; matches VOLTA's live catalog)
- Gemini API pricing: <https://ai.google.dev/gemini-api/docs/pricing> (updated 2026-10-27)
- Gemini video docs: <https://ai.google.dev/gemini-api/docs/video> (updated 2026-10-22)
- ElevenLabs API pricing: <https://elevenlabs.io/pricing/api> (undated; the music billing unit is ambiguous between per minute and per generation)
- Suno pricing: <https://suno.com/pricing> (undated)
- Anthropic skills repo: <https://github.com/anthropics/skills>

**Secondary or partial only (treat with care):**
- ChatGPT Images 2.5, 2026-09-08: from the search snippet of openai.com/index/introducing-chatgpt-images-2-5 (the page returned 403)
- Sora app closure 2026-04-26: from the snippet of help.openai.com/articles/20001152 (403). Sora shutdown announcement: 9to5mac, 2026-03-24.
- OpenAI Terms of Use output assignment: from the snippet of openai.com/policies/row-terms-of-use (403; current effective date U)
- OpenAI music model in development: The Information, Jan 2026 (via secondary)
- "No timeline": Atlas Cloud, 2026-10-12 (not opened; **unverified**)
- Claude Design launch 2026-04-17: siliconangle (secondary)
- Sora successor "Spud": blogs only, **unverified**
