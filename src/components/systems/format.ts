// Formatting + status styling shared by the VOLTA Systems components (client-safe, no server imports).
import type { FactTone, LaunchAgentHealth, Severity, SystemStatus } from '@/types/systems';

const KiB = 1024;
const MiB = KiB ** 2;
const GiB = KiB ** 3;
const TiB = KiB ** 4;

/** 21087252480 → "19.6 GiB" (binary units, like Finder's "GB" × 1.074). */
export function formatBytes(b: number | null | undefined): string {
  if (b == null || !Number.isFinite(b)) return '—';
  if (b >= TiB) return `${(b / TiB).toFixed(2)} TiB`;
  if (b >= GiB) return `${(b / GiB).toFixed(b >= 100 * GiB ? 0 : 1)} GiB`;
  if (b >= MiB) return `${Math.round(b / MiB)} MiB`;
  if (b >= KiB) return `${Math.round(b / KiB)} KiB`;
  return `${b} B`;
}

/** 5082 → "1h 24m" */
export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Relative time from an ISO string or epoch ms; `now` must come from client state (hydration-safe). */
export function formatAgo(t: string | number | null | undefined, now: number | null): string {
  if (t == null || now == null) return '';
  const ms = typeof t === 'number' ? t : Date.parse(t);
  if (!Number.isFinite(ms)) return '';
  const s = Math.round((now - ms) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${formatDuration(s)} ago`;
}

export const STATUS_LABEL: Record<SystemStatus, string> = { up: 'up', degraded: 'degraded', down: 'down', unknown: 'unknown' };

export const STATUS_DOT: Record<SystemStatus, string> = {
  up: 'bg-green shadow-[0_0_8px_rgba(34,197,94,0.55)]',
  degraded: 'bg-amber shadow-[0_0_8px_rgba(245,166,35,0.5)]',
  down: 'bg-[#EF4444] shadow-[0_0_8px_rgba(239,68,68,0.6)]',
  unknown: 'bg-highlight',
};

export const STATUS_TEXT: Record<SystemStatus, string> = {
  up: 'text-green',
  degraded: 'text-amber',
  down: 'text-[#F87171]',
  unknown: 'text-muted',
};

export const STATUS_BORDER: Record<SystemStatus, string> = {
  up: 'border-subtle',
  degraded: 'border-amber/40',
  down: 'border-[#EF4444]/45',
  unknown: 'border-subtle',
};

export const SEVERITY_TEXT: Record<Severity, string> = { ok: 'text-green', warn: 'text-amber', critical: 'text-[#F87171]' };
export const SEVERITY_BAR: Record<Severity, string> = { ok: 'bg-green', warn: 'bg-amber', critical: 'bg-[#EF4444]' };
export const SEVERITY_HEX: Record<Severity, string> = { ok: '#22C55E', warn: '#F5A623', critical: '#EF4444' };

export const TONE_TEXT: Record<FactTone, string> = { ok: 'text-green', warn: 'text-amber', critical: 'text-[#F87171]', muted: 'text-muted' };

export const AGENT_CHIP: Record<LaunchAgentHealth, { label: string; cls: string }> = {
  running: { label: 'running', cls: 'border-green/35 text-green' },
  idle: { label: 'idle · ok', cls: 'border-subtle text-secondary' },
  stopped: { label: 'stopped', cls: 'border-amber/40 text-amber' },
  failing: { label: 'failing', cls: 'border-[#EF4444]/45 text-[#F87171]' },
  'not-loaded': { label: 'not loaded', cls: 'border-amber/40 text-amber' },
  missing: { label: 'not installed', cls: 'border-subtle text-muted' },
  'app-not-running': { label: 'app not running', cls: 'border-subtle text-muted' },
};
