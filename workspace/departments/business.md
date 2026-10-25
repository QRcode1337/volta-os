# Business — Department Router

> Clients, sponsors, proposals, pricing, pipeline. Load this when the task touches money or a named client.

## Files
- `business/clients/betashares.md` — Sponsor. Q4 deck awaiting approval. Usage rights: 12 months, organic only.
- `business/clients/northwind.md` — Retainer client. Automation audit delivered W42.
- `business/clients/lumen-labs.md` — Prospect. AI Ops retainer proposal sent W43.
- `business/pricing.md` — Rate card v4. Never quote below the floor without Jay's sign-off.
- `business/pipeline.md` — Open deals, stage, next action, owner.
- `business/artifacts/beta-shares-deck.html` — Working copy of the BetaShares deck (final lives in `artifacts/betashares/`).

## Skills used here
`/lead-research` → `/call-recap` → `/automation-audit` → `/proposal-writer` → `/client-onboarding`
All client-facing artifacts use `/robo`. All client-facing prose uses `/tone` (business register).

## Rules
- One client per artifact. Never reference one client's numbers in another client's deliverable.
- Proposals: 3 tiers max, anchor high, show ROI in hours saved per week.
- Follow-up emails are drafted, never sent, unless Jay says "send".

## Applied Recos

### 2026-10-25 · rc-1 · Shrink CLAUDE.md into Department Routers
- Applied: 2026-10-25T03:23:17.064Z
- Source: VOLTA Recos (/apps/recos) · Memory · priority
- Expected impact: Saves ~18.4k tok/chat
- Change: Refactor workspace/CLAUDE.md into a slim router: move each department section into workspace/departments/<dept>.md and replace it with a one-line pointer. Preserve /compact directives verbatim.
