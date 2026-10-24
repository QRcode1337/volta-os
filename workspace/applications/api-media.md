---
id: api-media
tier: api
enabled: true
context_tokens: 1600
---

# Direct Image/Video Gen API (API)

Flux, Kling, Runway, Ideogram and Recraft endpoints used by RUBRIC Generations. Direct endpoints skip
aggregator markup.

- Auth env vars: `FLUX_API_KEY`, `KLING_API_KEY`, `RUNWAY_API_KEY`, `IDEOGRAM_API_KEY`, `RECRAFT_API_KEY`.
- Promote winners to `/thumb` from the Generations gallery.
- Preloaded context: **~1.6k tokens**.
