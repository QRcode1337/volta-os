'use client';
import { MemoryStick } from 'lucide-react';
import type { MemoryReport } from '@/types/systems';
import { cn } from '@/lib/cn';
import { SEVERITY_HEX, SEVERITY_TEXT, formatBytes } from './format';
import { Panel } from './Panel';

const SEGMENTS: { key: keyof MemoryReport; label: string; color: string }[] = [
  { key: 'appBytes', label: 'app', color: '#3B82F6' },
  { key: 'wiredBytes', label: 'wired', color: '#A855F7' },
  { key: 'compressedBytes', label: 'compressed', color: '#F5A623' },
  { key: 'cachedFilesBytes', label: 'cached files', color: '#6E6A61' },
  // vm_stat "Pages free" — not the same thing as the available % in the ring (that includes reclaimable memory).
  { key: 'freeBytes', label: 'unused pages', color: '#262522' },
];

const R = 52;
const C = 2 * Math.PI * R;

export function MemoryGauge({ m, highlighted }: { m: MemoryReport; highlighted?: boolean }) {
  const free = m.freePct;
  const usedPct = free == null ? null : Math.max(0, Math.min(100, 100 - free));
  const color = SEVERITY_HEX[m.severity];
  const total = m.totalBytes ?? SEGMENTS.reduce((s, x) => s + ((m[x.key] as number | null) ?? 0), 0);
  const swapPct = m.swapUsedBytes != null && m.swapTotalBytes ? Math.round((m.swapUsedBytes / m.swapTotalBytes) * 100) : null;

  return (
    <Panel id="memory" title="Memory pressure" icon={MemoryStick} highlighted={highlighted} meta={m.totalBytes ? `${formatBytes(m.totalBytes)} RAM` : undefined}>
      {!m.available ? (
        <p className="text-[12px] text-muted">{m.error ?? 'Memory stats unavailable.'}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-5">
            <svg viewBox="0 0 128 128" className="h-[124px] w-[124px] shrink-0" role="img" aria-label={free != null ? `${free}% memory available, ${usedPct}% in use` : 'memory'}>
              <title>Ring = memory in use · centre = memory_pressure’s system-wide free % (includes reclaimable cache)</title>
              <circle cx="64" cy="64" r={R} fill="none" stroke="var(--border-subtle)" strokeWidth="11" />
              {usedPct != null && (
                <circle
                  cx="64"
                  cy="64"
                  r={R}
                  fill="none"
                  stroke={color}
                  strokeWidth="11"
                  strokeLinecap="round"
                  strokeDasharray={`${(usedPct / 100) * C} ${C}`}
                  transform="rotate(-90 64 64)"
                  style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.16,1,0.3,1)' }}
                />
              )}
              <g>
                <text x="64" y="62" textAnchor="middle" className="fill-paper font-mono" style={{ fontSize: 24, fontWeight: 700 }}>
                  {free != null ? `${free}%` : '—'}
                </text>
                <text x="64" y="80" textAnchor="middle" className="fill-[var(--text-muted)] font-mono" style={{ fontSize: 8.5, letterSpacing: '0.1em' }}>
                  AVAILABLE
                </text>
              </g>
            </svg>
            <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 font-mono text-[11px]">
              <dt className="text-muted">pressure</dt>
              <dd className={cn('font-semibold uppercase tracking-[0.06em]', SEVERITY_TEXT[m.severity])}>{m.pressureLevel ?? m.severity}</dd>
              <dt className="text-muted">swap</dt>
              <dd className={cn(swapPct != null && swapPct >= 90 ? 'text-amber' : 'text-secondary')}>
                {formatBytes(m.swapUsedBytes)}
                {m.swapTotalBytes ? <span className="text-muted"> / {formatBytes(m.swapTotalBytes)}</span> : null}
              </dd>
              <dt className="text-muted">compressed</dt>
              <dd className="text-secondary">{formatBytes(m.compressedBytes)}</dd>
            </dl>
          </div>

          <div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-obsidian" title="vm_stat breakdown (approximate)">
              {total > 0 &&
                SEGMENTS.map((seg) => {
                  const v = (m[seg.key] as number | null) ?? 0;
                  return v > 0 ? <span key={seg.key} style={{ width: `${(v / total) * 100}%`, background: seg.color }} /> : null;
                })}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-muted">
              {SEGMENTS.map((seg) => (
                <li key={seg.key} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: seg.color }} />
                  {seg.label} <span className="text-secondary">{formatBytes(m[seg.key] as number | null)}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[10.5px] leading-snug text-muted">
            Ring = memory in use; centre = available % (<code className="font-mono">memory_pressure -Q</code> system-wide free, which counts reclaimable cache). “Unused pages” is
            vm_stat’s strictly empty pages, so it is much smaller. Level from the kernel (normal / warn / critical). Breakdown ≈ vm_stat, so it won’t match Activity Monitor exactly.
            Alerts below 15% available (critical below 5%) or at kernel warn.
          </p>
        </div>
      )}
    </Panel>
  );
}
