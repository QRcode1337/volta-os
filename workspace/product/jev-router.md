# Jev Router

Jev is TypeSafe's System One classifier. VOLTA uses it to pick the cheapest Claude tier for a dashboard skill run, and to triage, rank and re-rank text elsewhere. Code: `src/lib/server/jev/`.

## Client
- `client.ts`: `POST {TYPESAFE_BASE_URL}/v1/systemone`, model `jev-latest`, Bearer key from `TYPESAFE_JEV_API_KEY`. The key stays server-side and is never logged. No key means JEV is off.
- 8 s deadline, 2 attempts. Items go in batches of 8, 4 batches in parallel.
- Circuit breakers (shared `breaker()`): 3 failures in a row pause JEV for 30 s; a 401/403 pauses it for 5 min.
- `cache.ts`: 6 h / 500-entry LRU plus in-flight dedupe. An identical question never costs twice.
- Billing: input tokens only, $0.042 per million.

## Skill routing
- Tiers: HAIKU / SONNET / OPUS. `tier.ts` asks one Choice question: "the cheapest tier that will do the task well".
- **0.80 gate.** JEV overrides the requested tier only at ≥ 0.80 confidence (`JEV_OVERRIDE_THRESHOLD`, `heuristic.ts`).
- **FABLE** is a manual pin. It is never auto-selected and never rerouted.
- **Fallback.** When JEV is unreachable (no key, timeout, 5xx, circuit open), `heuristic.ts` classifies instead and labels the result `source: 'fallback'`:
  - keyword lanes;
  - length nudges (< 160 chars → HAIKU, > 1,200 → OPUS);
  - the requested tier as a prior.

## Call sites
1. **Skill routing.** `api/skills/run`: every Skills Deck ▶ run is routed. Each run is appended to the routing log, and the report says whether Jev kept or rerouted the tier.
2. **Feeds triage.** `feeds/triage.ts` labels items needs-action / fyi / noise; each item is classified once.
   - A needs-action label needs ≥ 0.5 confidence. Below that it becomes fyi or noise.
   - Labels are versioned by `TRIAGE_VERSION` (currently 3).
3. **Podcast rank.** `podcast/rank.ts` scores the top 60 candidates and blends the score 50/50 with heuristics. It is skipped silently if JEV fails.
4. **Research re-rank.** `research/search.ts` is an opt-in re-rank of the top 30 (6 s). Secrets are redacted before sending.

## Telemetry
- `/Volumes/Windsor/VOLTA/jev/telemetry.json`: requests, cache hits, errors, fallbacks, tokens, measured USD, p50/p95, per-op and per-tier counts. It is debounced, written atomically, and kept in memory only if Windsor is unmounted.
- `/Volumes/Windsor/VOLTA/jev/skill-routing.jsonl`: one line per skill run. Each line holds the requested tier, Jev's pick, confidence, overridden, and source. No prompts are stored.
- `GET /api/jev-router` serves the telemetry. `GET /api/jev-router/skills` serves the per-skill leaderboard. Neither makes a paid call.

## UI
- **Usage drawer pill** (`components/jev/JevStatusPill.tsx`): `JEV ACTIVE · N routes · M calls · $X`, or PAUSED / OFF. The tooltip shows the tier split, ops and latency.
- **Skills leaderboard** (Second Brain → Skills → "JEV routed"). Per skill it shows:
  - runs;
  - % routed down;
  - deck default tier → Jev's most common pick.

  **Optimize to Haiku** previews the exact change first: this browser's deck routing, plus the SKILL.md `model:` line (user skills only, never plugin skills). It writes only on confirm, atomically, and refuses if the file changed since the preview.

## Measured (2026-10-25 → 2026-10-28)
- 144 requests, $0.0167 total.
  - By operation: triage 108, rank 33, route 3, judge 0.
  - 4 cache hits, 0 errors, 0 fallbacks.
- Latency: p50 151 ms, p95 505 ms.
- Tier decisions: 3 HAIKU, 2 OPUS.
- The `TRIAGE_VERSION` 3 re-triage took 35 requests for $0.0044, about $0.000125 per 8-item request. One tier route costs about $0.00002.
