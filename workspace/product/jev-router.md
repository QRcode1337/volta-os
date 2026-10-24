# Jev Router

Ultra-fast classifier (≈ 0.006 s, ≈ $0.00004/call) that picks HAIKU / SONNET / OPUS for every prompt or skill.

## Heuristic
1. Keyword lanes: lightweight (grammar, note, summarise, tag…) → HAIKU; drafting/analysis → SONNET;
   taste, motion, strategy, long-horizon → OPUS.
2. Length: < 160 chars nudges HAIKU, > 1,200 chars nudges OPUS.
3. Skill prior: the skill's frontmatter tier adds weight.
4. Confidence = winning lane's share of total score. Override the requested tier only at ≥ 0.80.

## Telemetry (baseline 2026-10-22)
4,451 calls · $0.18 total · 41% Haiku · 37% Sonnet · 22% Opus
