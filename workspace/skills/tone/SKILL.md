---
name: tone
description: Writing-voice database: 80% corpus-aligned phrasing, 20% wildcard.
model: sonnet
effort: medium
category: database
---

# /tone

Writing-voice database: 80% corpus-aligned phrasing, 20% wildcard. **Needs Patrick's corpus:** rebuild the signature moves
from his Notion scripts (VOLTA Scripts), X @American_zero1 posts (IFTTT Sheets archive) and EPSILON copy. Until then the
rules below are starting defaults. Apply to any prose that leaves the building.

## When to use
- Every script, Short caption, social post, EPSILON outreach email and proposal.
- Then polish with `humanizer` or `elements-of-style:writing-clearly-and-concisely`.
- Tier routed by JEV (see `product/jev-router.md`); default **SONNET** at **MEDIUM** effort.

## Core voice
- **Show the source.** First person, plain words; the document, the date, the link. "Here's what the file says" beats "they don't want you to know".
- **Payoff first.** The first sentence says what the reader gets. Context comes second.
- **Specifics over adjectives.** Real numbers and named sources; never invented ones.
- **Short, then long.** Alternate a punchy line with one explanatory line. Never three long sentences in a row.
- **Honest about cost.** Always mention what something costs or breaks. It's the brand's credibility.

## Registers

| Register  | Where                     | Adjustments                                                     |
|-----------|---------------------------|-----------------------------------------------------------------|
| Documentary | The Strangest Times scripts | Calm, precise, curious. Name the document, date and source; mark speculation as speculation. |
| Shorts    | TikTok @Epsilonsec, YT Shorts | Hook in the first line, one claim, one source, ≤ 40 words on screen. |
| Business  | EPSILON outreach, proposals | No slang, no hype words, lead with the specific finding + outcome + next step. |
| Social    | X, Telegram QUANTUM_VAULT  | Short, link-first, one line of why it matters. |

## Signature moves (TODO: rebuild from Patrick's corpus)
- "Make it real, make it weird, make it work." (Patrick's stated motto — Notion WhoAmI)
- Open on the document or the finding, not on "in this video".
- Rule of three for features, rule of one for the CTA.

## Banned words
delve, leverage, game-changer, unlock, seamless, revolutionary, "in today's fast-paced world", synergy,
supercharge, "let's dive in", robust (unless about infrastructure), utilize.

## Wildcard quota (20%)
For any batch (hooks, titles, captions, subject lines) of 5 or more:
- **80%** follow the signature moves and registers above.
- **20%** deliberately break one rule (structure, register, or rhythm) and are labelled `WILDCARD`.
- A wildcard that outperforms its batch for two consecutive uploads gets promoted into "Signature moves".
- See `/wildcard` for the full directive and scoring.

## Learned Preferences (RL Log)
<!-- Appended by VOLTA Editor / Recos. Newest last. Entries dated before 2026-10-28 are template-era defaults. -->
- 2026-10-03 · Hooks: drop "In this video" entirely; open on the result.
- 2026-10-20 · Business register: say "retainer" not "subscription" for monthly engagements.
