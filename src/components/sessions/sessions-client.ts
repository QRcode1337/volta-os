'use client';
// Client helpers for VOLTA Sessions: formatting (durations, relative times, model names) and colours.

import { formatTokens } from '@/lib/format';

export { ApiError, getJson } from '@/components/ltm/ltm-client';

/** 9_840_000 ms → "2h 44m", 95_000 → "1m 35s", 0 → "—" */
export function formatDuration(ms: number): string {
  if (!ms || ms < 1000) return ms > 0 ? '<1s' : '—';
  const s = Math.round(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/** Relative label from an ISO time; `now` is set after mount (hydration-safe callers pass null first). */
export function ago(iso: string | null, now: number | null): string {
  if (!iso || now == null) return '—';
  const mins = Math.round((now - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  if (mins < 60 * 24 * 60) return `${Math.round(mins / 1440)}d ago`;
  return `${Math.round(mins / (1440 * 30))}mo ago`;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number) => String(n).padStart(2, '0');

/** "Oct 24 · 14:05" in local time (client only). */
export function whenLabel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${MON[d.getMonth()]} ${d.getDate()} · ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function timeLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

/** "2026-10-24" → "Oct 24" */
export function dayShort(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${MON[m - 1]} ${d}`;
}

/** "claude-opus-5-5" → "opus 5.5", "claude-sonnet-4-5-20250929" → "sonnet 4.5". */
export function shortModel(model: string): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(model);
  if (m) return `${m[1]} ${m[2]}${m[3] ? `.${m[3]}` : ''}`;
  return model.replace(/^claude-/, '');
}

const MODEL_FAMILY_COLORS: Record<string, string> = {
  haiku: '#22C55E',
  sonnet: '#14B8A6',
  opus: '#A855F7',
  fable: '#F5A623',
};

export function modelColor(model: string): string {
  const fam = /claude-([a-z]+)/.exec(model)?.[1] ?? '';
  return MODEL_FAMILY_COLORS[fam] ?? '#A39E93';
}

/** Short tool label: "mcp__plugin_claude-mem_mcp-search__query_corpus" → "claude-mem·query_corpus". */
export function shortTool(name: string): string {
  if (!name.startsWith('mcp__')) return name;
  const parts = name.slice(5).split('__');
  const server = (parts[0] ?? '')
    .replace(/^plugin_/, '')
    .replace(/_mcp-search$|_mcp$/, '')
    .replace(/^[0-9a-f]{8}-[0-9a-f-]{27}$/, 'mcp');
  return `${server}·${parts.slice(1).join('__')}`;
}

const TOOL_COLORS: Record<string, string> = {
  Bash: '#22C55E',
  Read: '#3B82F6',
  Edit: '#F5A623',
  Write: '#FF6B2B',
  MultiEdit: '#F5A623',
  Grep: '#06B6D4',
  Glob: '#06B6D4',
  Task: '#A855F7',
  Agent: '#A855F7',
  Skill: '#EC4899',
  WebFetch: '#14B8A6',
  WebSearch: '#14B8A6',
};
const PALETTE = ['#FF6B2B', '#10B981', '#8B5CF6', '#EAB308', '#EC4899', '#0EA5E9', '#84CC16', '#F97316', '#6366F1', '#2DD4BF'];

export function toolColor(name: string): string {
  if (TOOL_COLORS[name]) return TOOL_COLORS[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** formatTokens with a billions step: 2_749_700_000 → "2.75B", 53_600_000 → "53.6M". */
export function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 1 : 2)}B`;
  return formatTokens(n);
}

export function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${n} B`;
}
