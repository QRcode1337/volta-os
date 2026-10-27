'use client';
// Second Brain teaser: a tiny static SVG ring of the latest notes plus real counts. No 3D sphere, no ArtifactRing.
// Data (all shared-store, same URLs as CenterOrbitalCore): /api/notes/recent, /api/vaults, /api/skills-real, /api/routines.

import Link from 'next/link';
import { useMemo } from 'react';
import { Brain, ChevronRight } from 'lucide-react';
import type { ObsidianVault } from '@/types/ltm';
import type { RealRoutine, RealSkill, RecentNote } from '@/types/sources';
import { formatInt } from '@/lib/format';
import { agoLabel } from '@/components/ltm/ltm-client';
import { useNow } from '@/components/dashboard/widgets/hooks';
import { installedCountOf } from '@/components/dashboard/widgets/right-skills';
import { useSharedJson } from '@/components/dashboard/widgets/shared-json';
import { MCard, Skel } from './parts';

const RING_NOTES = 36;
const REFRESH_MS = 5 * 60_000;
const SIZE = 104;
const C = SIZE / 2;
const R = 44;

/** 36 dots on a circle, brightest at the top (newest note) fading around. Pure decoration: counts are beside it. */
function MiniRing({ lit, loading }: { lit: number; loading: boolean }) {
  const dots = Array.from({ length: RING_NOTES }, (_, i) => {
    const a = (i / RING_NOTES) * Math.PI * 2 - Math.PI / 2;
    // Rounded: Node and the browser can differ in the last float digits, which would trip hydration.
    return { x: Math.round((C + R * Math.cos(a)) * 100) / 100, y: Math.round((C + R * Math.sin(a)) * 100) / 100, i };
  });
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden className="shrink-0">
      <circle cx={C} cy={C} r={R - 9} fill="none" stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="2 4" />
      {dots.map((d) => {
        const on = !loading && d.i < lit;
        const op = on ? 1 - (d.i / RING_NOTES) * 0.75 : 0.25;
        return (
          <circle
            key={d.i}
            cx={d.x}
            cy={d.y}
            r={on ? 2.6 : 1.8}
            fill={on ? 'var(--accent-orange)' : 'var(--border-highlight)'}
            opacity={op}
            className={loading ? 'animate-pulse' : undefined}
          />
        );
      })}
      <circle cx={C} cy={C} r="3" fill="var(--accent-orange)" opacity={loading ? 0.3 : 0.9} />
    </svg>
  );
}

export function SecondBrainCard() {
  const notesQ = useSharedJson<{ notes: RecentNote[] }>(`/api/notes/recent?limit=${RING_NOTES}`, REFRESH_MS);
  const vaultsQ = useSharedJson<{ vaults: ObsidianVault[] }>('/api/vaults', REFRESH_MS);
  const skillsQ = useSharedJson<{ skills?: RealSkill[]; installedCount?: number }>('/api/skills-real', REFRESH_MS);
  const routinesQ = useSharedJson<{ routines: RealRoutine[] }>('/api/routines', REFRESH_MS);
  const now = useNow(60_000);

  const notes = notesQ.data?.notes;
  const vaults = vaultsQ.data?.vaults;
  const noteTotal = Array.isArray(vaults) ? vaults.reduce((s, v) => s + (v.notes || 0), 0) : null;
  const skillCount = skillsQ.data ? installedCountOf(skillsQ.data) : null;
  const routineCount = routinesQ.data?.routines ? routinesQ.data.routines.filter((r) => r.enabled).length : null;
  const latest = notes?.[0] ?? null;
  const latestAgo = useMemo(() => {
    if (!latest || !now) return null;
    const t = Date.parse(latest.mtime);
    return Number.isNaN(t) ? null : agoLabel(Math.max(0, Math.round((now.getTime() - t) / 60_000)));
  }, [latest, now]);

  const loading = !notes && !notesQ.error;
  const stat = (label: string, value: number | null, errored: boolean) => (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{label}</div>
      {value !== null ? (
        <div className="text-[18px] font-semibold leading-tight tabular-nums text-paper">{formatInt(value)}</div>
      ) : errored ? (
        <div className="text-[18px] font-semibold leading-tight text-muted" title="offline">
          —
        </div>
      ) : (
        <Skel className="mt-1 h-5 w-12" />
      )}
    </div>
  );

  return (
    <MCard title="Second brain" icon={<Brain size={14} strokeWidth={2.2} />} href="/second-brain" linkLabel="Open">
      <Link href="/second-brain" aria-label="Open Second Brain" className="-m-3 block rounded-[10px] p-3 active:bg-panel-hover/40">
        <div className="flex items-center gap-4">
          <MiniRing lit={notes?.length ?? 0} loading={loading} />
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2">
            {stat('Notes', noteTotal, !!vaultsQ.error)}
            {stat('Vaults', Array.isArray(vaults) ? vaults.length : null, !!vaultsQ.error)}
            {stat('Skills', skillCount, !!skillsQ.error)}
            {stat('Routines', routineCount, !!routinesQ.error)}
          </div>
        </div>
        <div className="mt-3 flex min-h-10 items-center gap-2 border-t border-subtle pt-2">
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-secondary">
            {latest ? (
              <>
                <span className="text-muted">Latest · </span>
                {latest.title}
                <span className="text-muted">
                  {' '}
                  · {latest.vault}
                  {latestAgo ? ` · ${latestAgo}` : ''}
                </span>
              </>
            ) : notesQ.error ? (
              <span className="text-[#EF4444]">Notes index offline</span>
            ) : loading ? (
              'Loading notes…'
            ) : (
              'No recent notes'
            )}
          </span>
          <ChevronRight size={14} aria-hidden className="shrink-0 text-muted" />
        </div>
      </Link>
    </MCard>
  );
}
