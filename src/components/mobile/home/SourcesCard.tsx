'use client';
// Memory sources / systems health: one 44px row per source with an online/offline dot. Data: /api/sources via
// useMemorySources (the MemorySourcesWidget store). Unhealthy sources sort first; the rest fold behind "Show all".

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Database } from 'lucide-react';
import type { MemorySource, SourceStatus } from '@/types/sources';
import { cn } from '@/lib/cn';
import { refreshSources, useMemorySources } from '@/components/dashboard/widgets/left-sources';
import { StatusDot } from '@/components/dashboard/widgets/left-ui';
import { maskSecrets } from '@/components/dashboard/widgets/source-facts';
import { Chip, MCard, OfflineNote, Skel } from './parts';

const COLLAPSED_ROWS = 4;
/** Lower = shown first: broken things before healthy ones. */
const SEVERITY: Record<SourceStatus, number> = { offline: 0, stale: 1, idle: 2, 'not-connected': 3, live: 4 };

function RowInner({ s }: { s: MemorySource }) {
  const dim = s.status === 'not-connected';
  return (
    <>
      <StatusDot status={s.status} />
      <span className={cn('w-[118px] shrink-0 truncate text-[13px] font-medium', dim ? 'text-muted' : 'text-paper')}>{s.name}</span>
      <span className="min-w-0 flex-1 truncate text-right font-mono text-[11px] text-muted">{maskSecrets(s.headline)}</span>
    </>
  );
}

export function SourcesCard() {
  const { sources, error, loading } = useMemorySources();
  const [all, setAll] = useState(false);

  const sorted = useMemo(
    () => (sources ? [...sources].sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status]) : []),
    [sources],
  );
  const live = sources?.filter((s) => s.status === 'live').length ?? 0;
  const bad = sources?.filter((s) => s.status === 'offline' || s.status === 'stale').length ?? 0;
  const shown = all ? sorted : sorted.slice(0, COLLAPSED_ROWS);

  let body;
  if (!sources && loading) {
    body = (
      <div aria-label="Loading memory sources" className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skel key={i} className="h-5 w-full" />
        ))}
      </div>
    );
  } else if (!sources) {
    body = <OfflineNote label="Sources API offline" message={error ?? 'No response from /api/sources'} onRetry={() => void refreshSources()} />;
  } else if (sources.length === 0) {
    body = <p className="text-[12.5px] text-secondary">No sources reported.</p>;
  } else {
    body = (
      <>
        <ul className="-my-1.5">
          {shown.map((s) => {
            const rowCls = 'flex min-h-11 items-center gap-2.5 border-t border-subtle first:border-t-0';
            const internal = s.href && s.href.startsWith('/') && !s.href.startsWith('//');
            return (
              <li key={s.id} title={[s.detail, s.setupHint].filter(Boolean).join(' · ') || undefined}>
                {internal ? (
                  <Link href={s.href!} className={cn(rowCls, 'active:bg-panel-hover/60')}>
                    <RowInner s={s} />
                  </Link>
                ) : (
                  <div className={rowCls}>
                    <RowInner s={s} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {sorted.length > COLLAPSED_ROWS && (
          <button
            type="button"
            onClick={() => setAll((v) => !v)}
            aria-expanded={all}
            className="-mb-1.5 mt-1.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border-t border-subtle font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-secondary outline-none active:bg-panel-hover/60 focus-visible:ring-2 focus-visible:ring-orange/50"
          >
            {all ? 'Show less' : `Show all ${sorted.length}`}
            <ChevronDown size={13} className={cn('transition-transform', all && 'rotate-180')} />
          </button>
        )}
        {error && (
          <p className="mt-2 font-mono text-[10px] text-amber" title={error}>
            refresh failed · showing last data
          </p>
        )}
      </>
    );
  }

  return (
    <MCard
      title="Memory sources"
      icon={<Database size={14} strokeWidth={2.2} />}
      href="/apps/systems"
      linkLabel="Systems"
      headerExtra={
        sources ? (
          <Chip tone={bad > 0 ? 'red' : 'muted'} title={`${live} of ${sources.length} sources live`}>
            {live}/{sources.length} live
          </Chip>
        ) : null
      }
    >
      {body}
    </MCard>
  );
}
