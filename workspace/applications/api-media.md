---
id: api-media
tier: api
enabled: true
context_tokens: 0
---

# Media generation APIs (API)

Image, video and voice generation used by VOLTA Generations, the podcast and documentary production.

| Provider | Used for | Where |
|---|---|---|
| xAI | Image and video generation | VOLTA Generations (`/api/media/*`) |
| ElevenLabs | Voice / narration | Generations, documentary VO |
| Gemini TTS | Two-host podcast voices (Mira & Dex) | VOLTA Podcast |
| Runway, Replicate | Occasional video/image models | Studio presets, ad hoc |

- Keys: env var **names** only, in `~/Volta-OS/.env.local` (server-side).
- Every paid call returns a quote first; confirm above $0.50; daily cap enforced server-side. Patrick's OK before spend.
- Outputs go to `/Volumes/Windsor/VOLTA/**`, never the SSD.
- For The Strangest Times, Patrick's own narration is preferred over TTS (VIDEO_1 decision).
