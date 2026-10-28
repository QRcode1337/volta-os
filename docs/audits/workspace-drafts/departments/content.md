# Creative Studio — Department Router

> DRAFT 2026-10-28. Replaces the RoboNuggets "Content" router (keeps the `content.md` filename so VOLTA's Second Brain
> still files it under the `content` department). Channels, Shorts, scripts, thumbnails, renders, music, the podcast.

## Sources of truth (read these, don't copy them here)
- **Notion "Video Production"** (VOLTA Scripts / Carousels / Recos read it): The Strangest Times master project,
  Agent-Ready (TST-YT) script spec, OMNI_VEO 90-day channel plan, Shorts Batch 1, Internet Lore series
  (Ep 1 Discordia · Ep 2 Tyler · Ep 3 CAIMEO · Ep 4 NRO SENTIENT), EPSILON YouTube packet, playbooks.
- **Studio presets** `~/Volta-OS/config/studio-projects.json`: Hermes Video Pipeline, Hermes Remotion Promo, OpenMontage Composer,
  Dialectics Video, Remotion Animation Workflow, TikTok Four Files, TikTok Warm Grain Grid, Universal Consciousness P1, ffmpeg Tools.
- **Music** `~/Volta-OS/config/music.json` (VANTA VECTOR); Suno via local `suno-api` on `:3010` (waiting on Patrick's cookie).
- **Podcast** `~/Volta-OS/config/podcast.json`: VOLTA Daily Briefing, hosts Mira & Dex, output on Windsor.

## Files here
- `content/channels.md` — TODO: one row per channel/series: name, format (long/Shorts), cadence, status, Notion link.
- `content/calendar.md` — TODO: upload calendar (replaces the template `youtube-calendar.md`), generated from Notion.
- `content/thumbnails-log.md` — A/B results feeding `/thumb` once uploads start.
- `videos/clips/` — VOLTA Editor clip bin notes for the active project.

## Pipeline
Notion outline + source ledger (VOLTA Scripts) → `fully-specd-screenplay` / `epistemic-documentary-blueprint` →
voice (ElevenLabs or Gemini TTS, quoted first) → visuals (`hyperframes`, `remotion-*`, `animated-documentary-motion`, Generations) →
Studio render queue → VOLTA Editor review pins → "Apply & teach" RL entries on `/cut` and `/animate` → `/thumb` → publish.

## Rules
- Claims in documentaries carry a source in the ledger; label speculation as speculation (UAP topics especially).
- Renders and audio go to `/Volumes/Windsor/VOLTA/**`, never the SSD.
- Every thumbnail batch: 4 corpus-aligned + 1 wildcard (keep — matches Patrick's "ambitious, experimental" preference).
- Paid generation needs a quote and an OK; daily budget applies.
