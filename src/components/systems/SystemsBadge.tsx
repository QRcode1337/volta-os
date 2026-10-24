'use client';
// Tiny status pill for other pages to mount (e.g. the home header): dot + alert count, links to /apps/systems.
// Polls the light `/api/systems?summary=1` (counts + attention titles, no folder sizes) every 2 min, paused while
// the tab is hidden. The server shares its 15 s probe cache with the Systems app, so mounting both costs nothing extra.
import Link from 'next/link';
import type { SystemsSummary } from '@/types/systems';
import { cn } from '@/lib/cn';
import { useSharedJson } from '@/components/dashboard/widgets/shared-json';

const BADGE_POLL_MS = 120_000;

export function SystemsBadge() {
  const { data, error, loading } = useSharedJson<SystemsSummary>('/api/systems?summary=1', BADGE_POLL_MS);
  const crit = data?.attention.filter((a) => a.severity === 'critical').length ?? 0;
  const warn = (data?.attention.length ?? 0) - crit;
  const tone = !data ? 'muted' : crit ? 'critical' : warn ? 'warn' : 'ok';
  const label = loading ? 'Systems' : !data ? 'Systems ?' : crit + warn ? `${crit + warn} alert${crit + warn === 1 ? '' : 's'}` : 'All systems up';
  const title = !data
    ? error
      ? `Systems status unavailable: ${error.message}`
      : 'Checking systems…'
    : data.attention.length
      ? data.attention.map((a) => `${a.severity === 'critical' ? '●' : '○'} ${a.title}`).join('\n')
      : `${data.counts.up}/${data.services} services up`;
  return (
    <Link
      href="/apps/systems"
      title={title}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border bg-panel-elevated px-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] transition-colors hover:text-paper',
        tone === 'critical' ? 'border-[#EF4444]/45 text-[#F87171]' : tone === 'warn' ? 'border-amber/40 text-amber' : tone === 'ok' ? 'border-green/35 text-green' : 'border-subtle text-muted',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          tone === 'critical' ? 'animate-pulse bg-[#EF4444]' : tone === 'warn' ? 'bg-amber' : tone === 'ok' ? 'bg-green' : 'bg-highlight',
        )}
      />
      {label}
    </Link>
  );
}
