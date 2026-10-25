// Shared, framework-free helpers for VOLTA Recos (safe on client and server).
import type { Reco, RecoBucket, RecoStatus } from '@/types/recos';

export type { RecoStatus };
export type Bucket = RecoBucket;
export type RecoTab = 'priority' | 'all' | Bucket;

export const STORAGE_KEY = 'volta:recos-state:v2';

export const BUCKET_COLORS: Record<Bucket, string> = {
  Content: '#EF4444',
  Routines: '#F5A623',
  Systems: '#3B82F6',
  Memory: '#22C55E',
};

export const TABS: { id: RecoTab; emoji: string; label: string }[] = [
  { id: 'priority', emoji: '🔥', label: 'Priority' },
  { id: 'all', emoji: '⚡', label: 'All Recos' },
  { id: 'Content', emoji: '🎬', label: 'Content' },
  { id: 'Routines', emoji: '🕒', label: 'Routines' },
  { id: 'Systems', emoji: '🖥️', label: 'Systems' },
  { id: 'Memory', emoji: '🧠', label: 'Memory' },
];

export function matchesTab(r: Reco, tab: RecoTab): boolean {
  if (tab === 'all') return true;
  if (tab === 'priority') return r.priority;
  return r.bucket === tab;
}

/** ISO-8601 week id, e.g. "2026-W43". Call only after mount (uses the clock). */
export function isoWeekId(now: Date): string {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** "W43 · Oct 19 – Oct 25" */
export function isoWeekLabel(now: Date): string {
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (x: Date) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${isoWeekId(now).slice(5)} · ${fmt(monday)} – ${fmt(sunday)}`;
}

const VALID: RecoStatus[] = ['pending', 'in_cart', 'done', 'skipped'];

export interface PersistedState {
  v: 2;
  week: string;
  statuses: Record<string, RecoStatus>;
}

/** Cart / done / skipped marks belong to one ISO week: a new week starts clean. */
export function parsePersisted(raw: string | null, week: string): Record<string, RecoStatus> {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as Partial<PersistedState>;
    if (data.v !== 2 || data.week !== week) return {};
    const out: Record<string, RecoStatus> = {};
    for (const [id, s] of Object.entries(data.statuses ?? {})) if (VALID.includes(s as RecoStatus)) out[id] = s as RecoStatus;
    return out;
  } catch {
    return {};
  }
}

export function cartSummary(items: Reco[]): { byBucket: { bucket: Bucket; count: number }[]; commands: number; priority: number } {
  const counts = new Map<Bucket, number>();
  for (const r of items) counts.set(r.bucket, (counts.get(r.bucket) ?? 0) + 1);
  return {
    byBucket: [...counts].map(([bucket, count]) => ({ bucket, count })),
    commands: items.filter((r) => r.command).length,
    priority: items.filter((r) => r.priority).length,
  };
}

/** One consolidated prompt for Claude Code covering every item in the cart. */
export function buildAgentPrompt(items: Reco[], weekLabel: string, now: Date): string {
  const date = now.toISOString().slice(0, 10);
  const lines: string[] = [
    `# VOLTA Recos: weekly fix list (${weekLabel})`,
    '',
    `You are Claude Code on Patrick's Mac. Work through the ${items.length} item${items.length === 1 ? '' : 's'} below **in order**. Every item comes from a live signal (Notion, launchd/OpenClaw, VOLTA Systems, memory sources); its source link is given so you can re-check it.`,
    '',
    '## Ground rules',
    '- Read first, then change. For any item with a command, run it and read the output before acting.',
    '- The Notion pages are read-only inputs: never write to Notion.',
    '- Disk space is tight: check `df -h /` before installing or generating anything bulky, and put bulky output under ~/Documents/PROJECTS/ErisMornCloud/.',
    '- Do not delete data unless you have verified what it is; ask first when unsure.',
    '- After each item, re-check the signal (re-run the command or reload the source) and say whether it cleared.',
    '',
    '## Items',
  ];
  items.forEach((r, i) => {
    lines.push('', `### ${i + 1}. ${r.title}`, `- **Bucket:** ${r.bucket}${r.priority ? ' · priority' : ''} · severity ${r.severity}`, `- **Signal:** ${r.why}`);
    if (r.evidence.length) lines.push(`- **Evidence:** ${r.evidence.map((e) => `${e.label}: ${e.value}`).join(' · ')}`);
    if (r.command) lines.push(`- **Start with:** \`${r.command}\``);
    lines.push('- **Do:**', ...r.steps.map((s) => `  - ${s}`));
    lines.push(`- **Source:** ${r.source.external ? r.source.href : `VOLTA OS ${r.source.href} (http://localhost:50000${r.source.href})`}`);
  });
  lines.push('', '## Report', `Finish with a short report (${date}): per item, what you found, what you changed, and whether the signal cleared. List anything you skipped and why.`);
  return lines.join('\n');
}
