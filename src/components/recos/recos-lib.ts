// Shared, framework-free helpers for VOLTA Recos (safe on client and server).
import type { RecommendationCard, RecommendationCardExt } from '@/types/os';
import { formatTokens, formatUsd } from '@/lib/format';

export type RecoStatus = RecommendationCard['status'];
export type Bucket = RecommendationCardExt['bucket'];
export type RecoTab = 'priority' | 'all' | Bucket;

export const STORAGE_KEY = 'rubric:recos-state';

export const BUCKET_COLORS: Record<Bucket, string> = {
  Memory: '#22C55E',
  Skills: '#FF5500',
  Routines: '#F5A623',
  Apps: '#3B82F6',
};

export const TABS: { id: RecoTab; emoji: string; label: string }[] = [
  { id: 'priority', emoji: '🔥', label: 'Priority' },
  { id: 'all', emoji: '⚡', label: 'All Recos' },
  { id: 'Apps', emoji: '🧩', label: 'Apps' },
  { id: 'Routines', emoji: '🕒', label: 'Routines' },
  { id: 'Memory', emoji: '🧠', label: 'Memory' },
  { id: 'Skills', emoji: '🛠️', label: 'Skills' },
];

/** Weeks → month multiplier (52 weeks / 12 months). */
export const WEEKS_PER_MONTH = 52 / 12;

export function matchesTab(r: RecommendationCardExt, tab: RecoTab): boolean {
  if (tab === 'all') return true;
  if (tab === 'priority') return r.priority;
  return r.bucket === tab;
}

export interface PersistedState {
  v: 1;
  statuses: Record<string, RecoStatus>;
}

const VALID: RecoStatus[] = ['pending', 'in_cart', 'done', 'skipped'];

export function parsePersisted(raw: string | null): Record<string, RecoStatus> {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as Partial<PersistedState>;
    const out: Record<string, RecoStatus> = {};
    for (const [id, s] of Object.entries(data.statuses ?? {})) {
      if (VALID.includes(s as RecoStatus)) out[id] = s as RecoStatus;
    }
    return out;
  } catch {
    return {};
  }
}

export interface CartTotals {
  weeklyTokens: number;
  weeklyUsd: number;
  monthlyTokens: number;
  monthlyUsd: number;
}

export function cartTotals(items: RecommendationCardExt[]): CartTotals {
  const weeklyTokens = items.reduce((s, r) => s + r.weeklyTokensSaved, 0);
  const weeklyUsd = items.reduce((s, r) => s + r.weeklyUsdSaved, 0);
  return {
    weeklyTokens,
    weeklyUsd,
    monthlyTokens: Math.round(weeklyTokens * WEEKS_PER_MONTH),
    monthlyUsd: weeklyUsd * WEEKS_PER_MONTH,
  };
}

/** ISO-8601 week label, e.g. "W43 · Oct 19 – Oct 25". Call only after mount (uses the clock). */
export function isoWeekLabel(now: Date): string {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (x: Date) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `W${week} · ${fmt(monday)} – ${fmt(sunday)}`;
}

/** Consolidated multi-step execution prompt for Claude Code. */
export function buildAgentPrompt(items: RecommendationCardExt[], weekLabel: string, now: Date): string {
  const t = cartTotals(items);
  const date = now.toISOString().slice(0, 10);
  const fileMap = new Map<string, number[]>();
  items.forEach((r, i) => {
    for (const f of r.filesTouched) fileMap.set(f, [...(fileMap.get(f) ?? []), i + 1]);
  });

  const lines: string[] = [
    `# VOLTA Recos — Weekly Upgrade Run (${weekLabel})`,
    '',
    `You are Claude Code operating inside the VOLTA ARMS workspace (\`./workspace\`). Apply the ${items.length} approved upgrade${items.length === 1 ? '' : 's'} below **in order**. Edit only files inside \`./workspace\`; never touch anything outside it, and never write secrets.`,
    '',
    '## Summary',
    `- Date: ${date}`,
    `- Upgrades: ${items.length}`,
    `- Estimated weekly savings: ${formatTokens(t.weeklyTokens)} tokens · ${formatUsd(t.weeklyUsd)}`,
    `- Projected monthly savings: ${formatTokens(t.monthlyTokens)} tokens · ${formatUsd(t.monthlyUsd)}`,
    '',
    '## Steps',
  ];

  items.forEach((r, i) => {
    lines.push(
      '',
      `### ${i + 1}. ${r.title}`,
      `- **Bucket:** ${r.bucket}${r.priority ? ' · 🔥 Priority' : ''} · ${r.effortLabel}`,
      `- **Why:** ${r.benefit} (${r.savingsLabel})`,
      `- **Do:** ${r.promptPayload}`,
      `- **Files:** ${r.filesTouched.map((f) => `\`workspace/${f}\``).join(', ')}`,
    );
  });

  lines.push('', '## Files to touch');
  for (const [file, steps] of fileMap) {
    lines.push(`- \`workspace/${file}\` — step${steps.length > 1 ? 's' : ''} ${steps.join(', ')}`);
  }

  lines.push(
    '',
    '## Verification checklist',
    '- [ ] Every file listed above exists and contains the requested change',
    '- [ ] `git diff --stat` (or a file listing) shows no edits outside `./workspace`',
    '- [ ] YAML frontmatter in every touched SKILL.md / routine still parses',
    '- [ ] Existing `## Learned Preferences (RL Log)` sections and `/compact` directives are preserved verbatim',
    '- [ ] No secrets, tokens or API keys were written (env var names only)',
    '- [ ] Report the before/after token count for any file that was slimmed down',
    '',
    '## Logging',
    `After **each** change, append an entry to \`workspace/MEMORY.md\` under \`## Applied Recos\` in the form:`,
    '',
    '```md',
    `- ${date} · <reco id> · <title> — <files changed> — <one-line summary>`,
    '```',
    '',
    'Finish with a short report: steps completed, files changed, anything skipped and why.',
  );

  return lines.join('\n');
}
