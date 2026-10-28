'use client';
// Small presentational pieces for VOLTA Launchpad (status dots, link cards, section frames).
import type { ReactNode } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ProbeResult } from '@/lib/server/launchpad/types';

const RED = '#EF4444';

export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'unknown';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d}d ago`;
  const mo = Math.round(d / 30);
  return mo < 24 ? `${mo}mo ago` : `${Math.round(d / 365)}y ago`;
}

export type Tone = 'up' | 'warn' | 'down' | 'idle';

const TONE_COLOR: Record<Tone, string> = { up: 'var(--accent-green)', warn: 'var(--accent-amber)', down: RED, idle: 'var(--text-muted)' };

export function toneOfProbe(p: ProbeResult | undefined): Tone {
  return p?.state === 'up' ? 'up' : p?.state === 'degraded' ? 'warn' : p?.state === 'down' ? 'down' : 'idle';
}

export function StatusDot({ tone, label, pulse }: { tone: Tone; label: string; pulse?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center" title={label}>
      <span
        aria-hidden
        className={cn('block h-2 w-2 rounded-full', pulse && 'animate-pulse')}
        style={{ background: TONE_COLOR[tone], boxShadow: tone === 'up' ? '0 0 6px var(--accent-green)' : undefined }}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function probeLabel(p: ProbeResult | undefined): string {
  if (!p || p.state === 'unknown') return 'not probed';
  if (p.summary) return `${p.state} · ${p.summary}${p.ms != null ? ` · ${p.ms}ms` : ''}`; // agent services: the Systems verdict
  return p.state === 'up' ? `up${p.httpStatus ? ` · HTTP ${p.httpStatus}` : ''}${p.ms !== undefined ? ` · ${p.ms}ms` : ''}` : `down${p.httpStatus ? ` · HTTP ${p.httpStatus}` : ' · no answer'}`;
}

const CARD = 'group block rounded-lg border border-subtle bg-panel p-3 transition-colors hover:border-highlight hover:bg-panel-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-orange';

/** A card that is a link opening in a new tab (custom-protocol links such as obsidian:// stay in-tab so no blank tab is left behind). */
export function LinkCard({
  href,
  label,
  detail,
  note,
  tone,
  statusLabel,
  badge,
  newTab = true,
  macOnly = false,
}: {
  href: string;
  label: string;
  detail?: string;
  note?: ReactNode;
  tone: Tone;
  statusLabel: string;
  badge?: ReactNode;
  newTab?: boolean;
  /** Loopback-only service viewed from another device: shown, but not a link (it would open the phone's own localhost). */
  macOnly?: boolean;
}) {
  if (macOnly) {
    return (
      <div aria-disabled="true" className="block rounded-lg border border-dashed border-subtle bg-panel/60 p-3" title="Only reachable on the Mac: it isn't exposed with tailscale serve">
        <span className="flex items-center gap-2">
          <StatusDot tone={tone} label={statusLabel} />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-secondary">{label}</span>
          <Chip>Mac only</Chip>
        </span>
        {detail && <span className="mt-1.5 block truncate font-mono text-[10.5px] text-muted">{detail}</span>}
        <span className="mt-1 block text-[11.5px] leading-snug text-muted">Open it on the Mac, or add a tailscale serve entry for this port.</span>
        <span className="mt-1.5 block font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">{statusLabel}</span>
      </div>
    );
  }
  return (
    <a href={href} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : { rel: 'noopener noreferrer' })} className={CARD}>
      <span className="flex items-center gap-2">
        <StatusDot tone={tone} label={statusLabel} />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-paper">{label}</span>
        {badge}
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted transition-colors group-hover:text-orange" aria-hidden />
      </span>
      {detail && <span className="mt-1.5 block truncate font-mono text-[10.5px] text-muted">{detail}</span>}
      {note && <span className="mt-1 block text-[11.5px] leading-snug text-secondary">{note}</span>}
      <span className="mt-1.5 block font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">{statusLabel}</span>
    </a>
  );
}

export function Chip({ children, tone = 'idle' }: { children: ReactNode; tone?: Tone | 'purple' }) {
  const color = tone === 'purple' ? 'var(--accent-purple)' : TONE_COLOR[tone];
  return (
    <span className="shrink-0 rounded-full border px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.05em]" style={{ color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}>
      {children}
    </span>
  );
}

export function Section({ icon, title, count, aside, children }: { icon: ReactNode; title: string; count?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-8">
      <header className="mb-3 flex flex-wrap items-center gap-2 border-b border-subtle pb-2">
        <span className="text-orange" aria-hidden>
          {icon}
        </span>
        <h2 className="text-[14px] font-semibold tracking-tight text-paper">{title}</h2>
        {count !== undefined && <span className="rounded-full bg-panel-elevated px-1.5 font-mono text-[10px] text-muted">{count}</span>}
        {aside && <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.05em] text-muted">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

export function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="hud-label mb-2 mt-5 first:mt-0">{children}</h3>;
}

export function SkeletonGrid({ n = 3 }: { n?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="h-[74px] animate-pulse rounded-lg border border-subtle bg-panel" />
      ))}
    </div>
  );
}

export function ErrorNote({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'warn' }) {
  const color = tone === 'error' ? RED : 'var(--accent-amber)';
  return (
    <p className="flex items-start gap-2 rounded-md border px-3 py-2 text-[12.5px] text-paper" style={{ borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} 6%, transparent)` }}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export const GRID = 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3';
