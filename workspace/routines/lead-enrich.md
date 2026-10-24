---
id: r-lead-enrich
name: lead enrichment sweep
time: "09:00"
days: [T, TH]
runner: hermes
mode: active
---

# Lead Enrichment Sweep

Batch-run `/lead-research` on every pipeline row with an empty Research column, and re-score leads older
than 21 days.

## Last run
- 2026-10-22 09:00 · 6 leads enriched · 2 re-scored up (hiring signals) · 1 disqualified (no budget)
