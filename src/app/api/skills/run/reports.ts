import 'server-only';
import type { EffortLevel, ModelTier } from '@/types/os';
import { seededRandom } from '@/lib/mock-data';

/**
 * Deterministic, purely simulated skill reports. Nothing here touches the OS:
 * no processes are killed, no files are read, moved or deleted. Numbers are seeded from the request.
 */

export interface ReportContext {
  command: string;
  model: ModelTier;
  effort: EffortLevel;
  customPrompt?: string;
  seed: number;
}

type Rnd = () => number;
type Builder = (ctx: ReportContext, r: Rnd) => string;

const EFFORT_DEPTH: Record<EffortLevel, number> = { LOW: 0.6, MEDIUM: 0.8, HIGH: 1, XHIGH: 1.25, MAX: 1.5 };

const int = (r: Rnd, min: number, max: number) => Math.floor(min + r() * (max - min + 1));
const pick = <T,>(r: Rnd, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const scaled = (ctx: ReportContext, n: number) => Math.max(1, Math.round(n * EFFORT_DEPTH[ctx.effort]));
const focus = (ctx: ReportContext) => (ctx.customPrompt?.trim() ? `\n> Focus: ${ctx.customPrompt.trim().slice(0, 240)}\n` : '');

const REPORTS: Record<string, Builder> = {
  '/clean-up': (ctx, r) => {
    const ram = (1.6 + r() * 1.6).toFixed(1);
    const procs = int(r, 3, 6);
    const temp = int(r, 120, 240);
    const disk = (1.8 + r() * 2.4).toFixed(1);
    const ports = ['3000', '5173', '8080', '4321', '6006'].slice(0, int(r, 1, 3));
    const pids = Array.from({ length: procs }, () => int(r, 41_000, 89_000));
    const procNames = ['next-server (orphaned)', 'node esbuild --watch', 'vite dev', 'node turbopack worker', 'node storybook', 'node webpack --watch'];
    return `### Summary
\`\`\`
freed   ${ram} GB RAM      killed ${procs} orphaned node processes
cleared ${temp} temp files  released ports ${ports.join(', ')}
disk    +${disk} GB         skipped 2 items (needs approval)
\`\`\`
${focus(ctx)}
### Processes (simulated)
| PID | Process | RSS | Age | Action |
|---:|---|---:|---:|---|
${pids.map((pid, i) => `| ${pid} | ${procNames[i % procNames.length]} | ${int(r, 180, 920)} MB | ${int(r, 2, 31)}h | TERM |`).join('\n')}

### Files
- \`$TMPDIR\`: ${temp} files older than 3 days (${int(r, 300, 900)} MB)
- \`.next/cache\` (2 stale projects): ${(0.6 + r()).toFixed(1)} GB
- \`node_modules/.cache\`: ${int(r, 180, 640)} MB

### Skipped (needs approval)
- \`~/Library/Developer/Xcode/DerivedData\` — ${(2 + r() * 4).toFixed(1)} GB, outside safe list
- \`ollama\` model cache — protected by skill rules`;
  },

  '/lead-research': (ctx, r) => {
    const co = pick(r, ['Ferro Health', 'Harbourline', 'Quill & Co', 'Atlas Freight']);
    const fit = int(r, 3, 5);
    return `### Lead brief · ${co} · fit ${fit}/5
${focus(ctx)}
| Signal | Finding | Weight |
|---|---|---:|
| Headcount | ${int(r, 40, 400)} (band ${pick(r, ['51–200', '201–500', '11–50'])}) | 1 |
| Funding | ${pick(r, ['Series A, 7 months ago', 'Bootstrapped, profitable', 'Series B, 3 months ago'])} | 2 |
| Hiring | ${int(r, 1, 3)} RevOps / Ops roles open | 2 |
| Stack | HubSpot, Notion, Zapier (${int(r, 18, 60)} zaps) | 1 |
| Pain quote | "We copy the same numbers into four tools every Monday." | 2 |

**Next action:** book discovery call — strong manual-process signal plus active ops hiring.
Pipeline row updated · brief written to \`business/clients/${co.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md\` (simulated).`;
  },

  '/proposal-writer': (ctx, r) => `### Proposal drafted · Lumen Labs · AI Ops Retainer
${focus(ctx)}
- Deck: \`artifacts/lumen-labs/proposal-ai-ops-retainer.html\` (8 slides, /robo, simulated)
- Recommended tier: **Medium · $8,500/mo** (price on slide 2)
- ROI slide: ${int(r, 14, 26)} h/week saved × $85/h → payback in ${int(r, 5, 9)} weeks
- Tiers: S $5,500 · **M $8,500** · L $14,000 (floor respected)
- Wildcard page: "Build sprint first, retainer after" alternate direction

Status: **draft** — not sent. Reply "send" to queue the email.`,

  '/client-onboarding': (ctx, r) => `### Onboarding pack ready · Northwind
${focus(ctx)}
- [x] Client file sections: Contacts · Scope · Access needed · Cadence · Risks
- [x] Kickoff agenda (${int(r, 6, 9)} items) from the proposal phase plan
- [x] Added to *deliverables tracker sync* inputs
- [x] Welcome email + access checklist drafted (${int(r, 7, 12)} systems)
- [ ] Calendar holds: ${int(r, 3, 5)} proposed slots (awaiting approval)`,

  '/automation-audit': (ctx, r) => {
    const rows = [
      ['Invoice reconciliation', int(r, 7, 11), 'automate'],
      ['Weekly ops report', int(r, 2, 4), 'automate'],
      ['Support triage', int(r, 4, 7), 'assist'],
      ['CRM data hygiene', int(r, 2, 5), 'automate'],
    ] as const;
    return `### Automation audit · ${rows.length} workflows ranked
${focus(ctx)}
| Rank | Workflow | h/wk | Mode | ROI score |
|---:|---|---:|---|---:|
${rows.map(([w, h, m], i) => `| ${i + 1} | ${w} | ${h} | ${m} | ${(h * 3.1 - i * 1.4).toFixed(1)} |`).join('\n')}

Top 3 picks go into the 30-day plan. Report: \`artifacts/northwind/automation-audit-report.html\` (simulated).`;
  },

  '/call-recap': (ctx, r) => `### Call recap · BetaShares sponsor sync
${focus(ctx)}
**Decisions**
- Q4 Series tier confirmed in principle (partnerships lead)
- Testimonial on slide 3 swapped for audience stats

**Action items**
| Owner | Task | Due |
|---|---|---|
| Jay | Send revised deck | 2026-10-23 |
| BetaShares | Compliance review of script v2 | 2026-10-27 |
| Jay | Hold 30 Oct publish slot | 2026-10-24 |

**Follow-up email** — drafted (${int(r, 84, 118)} words, business register). Not sent.`,

  '/tone': (ctx, r) => {
    const n = 5;
    const wild = Math.ceil(n * 0.2);
    return `### /tone pass · ${n} hooks · ${n - wild} CORPUS / ${wild} WILDCARD
${focus(ctx)}
1. CORPUS — "I rebuilt my whole business around one local OS. Here's the blueprint."
2. CORPUS — "So what you're seeing here is 424,846 files Claude can route."
3. CORPUS — "Here's the bit nobody talks about: your cache is costing you $4.92."
4. CORPUS — "Four thousand routing calls. Eighteen cents."
5. WILDCARD *(broke: rhythm — single word open)* — "Overfitting. That's why your AI sounds like everyone else."

Banned-word scan: 0 hits · avg sentence length ${int(r, 9, 13)} words.`;
  },

  '/thumb': (ctx, r) => `### Thumbnail brief · 5 concepts (4 CORPUS + 1 WILDCARD)
${focus(ctx)}
| # | Type | Archetype | Text | Predicted CTR |
|---:|---|---|---|---:|
| 1 | CORPUS | Screen + Face Left | MY OS | ${(9 + r()).toFixed(1)}% |
| 2 | CORPUS | Big Number | 424,846 | ${(8.2 + r()).toFixed(1)}% |
| 3 | CORPUS | Before / After | $4.92 → $0.14 | ${(7.8 + r()).toFixed(1)}% |
| 4 | CORPUS | Object Hero | (orb + 1 label) | ${(7.2 + r()).toFixed(1)}% |
| 5 | WILDCARD | Hand-drawn whiteboard over dark screen | ARMS | ${(6.5 + r() * 3).toFixed(1)}% |

Previous upload used archetype 1 → render #2 and #5 for the A/B.`,

  '/robo': (ctx, r) => `### /robo artifact pass
${focus(ctx)}
- Tokens applied: 15 surface/text/accent variables, 4 font stacks
- Fixed: ${int(r, 2, 6)} off-palette colors, ${int(r, 1, 3)} drop shadows removed, 1 gradient removed
- Typography: Doto accent on 1 word per title, mono numerals right-aligned in ${int(r, 1, 3)} tables
- Contrast: all text ≥ 4.5:1 on #141413
- Output: single self-contained HTML file (inline CSS, no external JS) — simulated write`,

  '/wildcard': (ctx, r) => {
    const n = int(r, 5, 10);
    const w = Math.ceil(n * 0.2);
    return `### /wildcard · batch of ${n} → ${n - w} CORPUS + ${w} WILDCARD
${focus(ctx)}
- Re-rolled the novel slice; each wildcard names the rule it breaks (structure / register / archetype).
- Promotion watch: "single-word open" hook beat batch median 2× in a row → **promote** to /tone signature moves.
- Retirement watch: "Object Hero" thumbnails trailed median ${int(r, 2, 3)}× (retire at 4).`;
  },

  '/animate': (ctx, r) => `### /animate · scene build
${focus(ctx)}
- Scene: \`ring-zoom\` · 1920×1080 · 30 fps · ${int(r, 62, 78)}s
- Applied RL Log: ring zoom 1.5× speed, matched-node glow +40%
- Beats synced to voiceover: ${int(r, 5, 9)} (max drift ±${int(r, 1, 2)} frames)
- Contact sheet: 6 frames rendered for review (simulated)
- Output: \`videos/clips/02-home-os.tsx\` — ready for VOLTA Editor review`,

  '/cut': (ctx, r) => {
    const trims = scaled(ctx, int(r, 9, 16));
    return `### /cut · A-roll assembly
${focus(ctx)}
\`\`\`
CLIP 02 · Home Dashboard Overview · 01:11 → 02:25
- 00:00:17:12  trim 1.8s dead air  (before matrix popover)
- 00:00:41:03  jump cut            cover: 6f B-roll (ring)
- 00:00:58:20  retake → keep take 3
\`\`\`
- Dead-air trims: ${trims} (threshold 0.6 s walkthrough / 0.8 s default) · ${(trims * 0.9).toFixed(1)}s removed
- Filler words removed: ${int(r, 6, 14)} · retakes resolved: ${int(r, 2, 5)}
- Timeline exported via premiere-cli (simulated)`;
  },

  '/grammar': (ctx, r) => `### /grammar · ${int(r, 4, 11)} fixes
${focus(ctx)}
\`\`\`diff
- Their going to love the the new dashboard.
+ They're going to love the new dashboard.
- Each of the routines have a cap.
+ Each of the routines has a cap.
\`\`\`
Voice untouched · contractions kept · AU spelling (community register).`,

  '/note': (ctx) => `### Note captured
${focus(ctx)}
- Department: **${ctx.customPrompt && /client|deck|proposal|sponsor/i.test(ctx.customPrompt) ? 'business' : 'product'}**
- File: appended under today's heading (simulated)
- MEMORY.md: no new entity → no index card needed`,

  '/calibrate': (ctx, r) => `### /calibrate · /cut
${focus(ctx)}
- RL Log entries reviewed: ${int(r, 4, 9)} · stable (≥ 14 days): ${int(r, 2, 3)}
- Folded into body: dead-air threshold 0.6 s for walkthrough segments
- Kept in log: ${int(r, 1, 3)} recent entries (not yet stable)
- Archived to \`skills/cut/RL-ARCHIVE.md\` (simulated)`,

  '/search-connectors': (ctx, r) => `### Connector pick
${focus(ctx)}
| Option | Tier | Preloaded context | Verdict |
|---|---|---:|---|
| ffmpeg | CLI | 0 | ✓ chosen |
| Direct Image/Video Gen API | API | 1.6k | fallback |
| Excalidraw MCP | MCP | 7.2k | skip (disabled) |

Avoided ~${int(r, 7, 19)}k tokens vs the heaviest option.`,

  '/chromify': (ctx, r) => `### Browser task plan
${focus(ctx)}
1. Open target dashboard (no query strings logged)
2. Decline non-essential cookies
3. Export report as CSV → \`workspace/business/\` (simulated)
4. Screenshot before/after (${int(r, 2, 4)} captures)

Stopped before any submit/send step — needs explicit confirmation.`,
};

const genericReport: Builder = (ctx, r) => `### ${ctx.command} · run report
${focus(ctx)}
- Loaded ${int(r, 1, 2)} department router(s) and the skill file
- Steps completed: ${int(r, 3, 6)} · outputs written to \`workspace/\` (simulated)
- One-line index card appended to MEMORY.md (simulated)`;

export function buildMockReport(ctx: ReportContext): string {
  const r = seededRandom(ctx.seed);
  return (REPORTS[ctx.command] ?? genericReport)(ctx, r);
}

export function hasCustomReport(command: string): boolean {
  return command in REPORTS;
}
