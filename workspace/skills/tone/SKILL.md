---
name: tone
description: Writing-voice database: 80% corpus-aligned phrasing, 20% wildcard.
model: sonnet
effort: medium
category: database
---

# /tone

Writing-voice database: 80% corpus-aligned phrasing, 20% wildcard. Built from the last 40 published scripts,
120 community posts and 60 sent client emails. Apply to any prose that leaves the building.

## When to use
- Every script, carousel caption, community post, newsletter and client email.
- Called before `/grammar` (tone first, then polish).
- Routed through Jev; default tier **SONNET** at **MEDIUM** effort.

## Core voice
- **Builder talking to builders.** First person, plain words, show the screen. "Here's what I did" beats "you should".
- **Payoff first.** The first sentence says what the reader gets. Context comes second.
- **Numbers over adjectives.** "Saves 18k tokens a chat" not "massively more efficient".
- **Short, then long.** Alternate a punchy line with one explanatory line. Never three long sentences in a row.
- **Honest about cost.** Always mention what something costs or breaks. It's the brand's credibility.

## Registers

| Register  | Where                     | Adjustments                                                     |
|-----------|---------------------------|-----------------------------------------------------------------|
| YouTube   | Scripts, Shorts           | Contractions always. Rhetorical question max once per minute.   |
| Community | Skool, Discord            | Warmer, second person, name the member, end with a question.    |
| Business  | Proposals, client email   | No slang, no hype words, lead with outcome + timeline + price.  |
| Carousel  | Instagram slides          | ≤ 14 words per slide, one idea per slide, verb-first headlines. |

## Signature moves (corpus-aligned, use freely)
- "So what you're seeing here is…" to open a screen walkthrough.
- "Here's the bit nobody talks about:" before the counter-intuitive point.
- "Plain text files Claude can route." when describing ARMS.
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
<!-- Appended by RUBRIC Editor / Recos. Newest last. -->
- 2026-10-03 · Hooks: drop "In this video" entirely; open on the result.
- 2026-10-20 · Business register: say "retainer" not "subscription" for monthly engagements.
