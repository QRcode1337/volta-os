'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, LayoutGrid } from 'lucide-react';
import { HudPanel } from '@/components/robo-ui';
import { MICRO_APPS } from '@/lib/mock-data';
import type { ObsidianVault } from '@/types/ltm';
import type { MicroAppItem } from '@/types/os';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { MicroAppIcon } from './MicroAppIcon';
import { HudModal, PanelFlash } from './Overlay';
import { useFlash } from './hooks';
import { useSharedJson } from './shared-json';

/**
 * Real note totals for the Second Brain entry (MICRO_APPS' static subtitle carries a placeholder count).
 * Same /api/vaults number and the same word ("notes") as the home Note Ring corner and Memory Sources; like
 * the Second Brain index it skips _archive/.obsidian/.trash. The request is shared with CenterOrbitalCore.
 */
function useVaultSubtitle(): string | null {
  const { data, error } = useSharedJson<{ vaults: ObsidianVault[] }>('/api/vaults', null);
  const vaults = data?.vaults;
  if (!Array.isArray(vaults)) return error ? 'Wikilink graph across Obsidian vaults' : null;
  if (vaults.length === 0) return 'Wikilink graph · no Obsidian vaults found';
  const notes = vaults.reduce((s, v) => s + (v.notes || 0), 0);
  return `${formatInt(notes)} notes · ${vaults.length} Obsidian vault${vaults.length === 1 ? '' : 's'}`;
}

/**
 * Real-data apps first, then the tool apps that still run on sample content (`sample: true`); each group keeps
 * MICRO_APPS' own order.
 */
const REAL_APPS = MICRO_APPS.filter((a) => !a.sample);
const SAMPLE_APPS = MICRO_APPS.filter((a) => a.sample);
const SAMPLE_TIP = 'This tool app runs on built-in sample content, not your real data.';

function SamplePill({ className }: { className?: string }) {
  return (
    <span
      title={SAMPLE_TIP}
      className={cn(
        'shrink-0 rounded-[4px] border border-subtle bg-obsidian px-1 font-mono text-[8.5px] font-semibold uppercase leading-[14px] tracking-[0.08em] text-muted',
        className,
      )}
    >
      Sample data
    </span>
  );
}

/** True when the scroll region has content hidden below the fold. */
function useMoreBelow<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', check);
      ro.disconnect();
    };
  }, []);
  return [ref, more] as const;
}

export function MicroAppsWidget({ className }: { className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [flash, setFlash] = useFlash();
  const brainSubtitle = useVaultSubtitle();
  const [scrollRef, moreBelow] = useMoreBelow<HTMLDivElement>();

  const subtitleOf = (app: MicroAppItem) =>
    app.id === 'brain' ? (brainSubtitle ?? 'Wikilink graph across Obsidian vaults') : app.subtitle;

  return (
    <HudPanel
      title="MICRO APPS"
      icon={<LayoutGrid size={14} strokeWidth={2.2} />}
      // Count only at 2xl: at 1280px the header (title + EXPAND + ADD APP) has no room for it.
      headerExtra={
        <span
          className="hidden font-mono text-[10px] text-muted 2xl:inline"
          title={`${REAL_APPS.length} on real data · ${SAMPLE_APPS.length} on sample data`}
        >
          {MICRO_APPS.length}
        </span>
      }
      actions={[
        { label: 'EXPAND', onClick: () => setExpanded(true) },
        { label: '+ ADD APP', onClick: () => setFlash('Add a route in src/app/apps + a MICRO_APPS entry') },
      ]}
      className={cn('relative', className)}
      bodyClassName="relative flex flex-col"
    >
      <div ref={scrollRef} className="hud-scroll min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        <ul className="flex flex-col">
          {[...REAL_APPS, ...SAMPLE_APPS].map((app, i) => (
            <li
              key={app.id}
              // Hairline between the real-data group and the sample-data tool apps.
              className={cn(app.sample && i === REAL_APPS.length && i > 0 && 'mt-1 border-t border-subtle pt-1')}
            >
              <Link
                href={app.route}
                title={app.sample ? `${app.name} — ${SAMPLE_TIP}` : undefined}
                className="group flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-[6px] transition-colors hover:border-subtle hover:bg-panel-hover"
              >
                <MicroAppIcon
                  type={app.iconType}
                  color={app.accentColor}
                  className={cn('group-hover:brightness-125', app.sample && 'opacity-70 saturate-50')}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={cn('truncate text-[13px] font-semibold leading-tight', app.sample ? 'text-paper/80' : 'text-paper')}>
                      {app.name}
                    </span>
                    {app.sample && <SamplePill />}
                  </span>
                  <span className="block truncate text-[11px] leading-tight text-muted transition-colors group-hover:text-secondary">
                    {subtitleOf(app)}
                  </span>
                </span>
                <ArrowUpRight
                  size={13}
                  className="shrink-0 -translate-x-1 text-muted opacity-0 transition-all group-hover:translate-x-0 group-hover:text-orange group-hover:opacity-100"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-panel to-transparent transition-opacity duration-200',
          moreBelow ? 'opacity-100' : 'opacity-0',
        )}
      />
      <PanelFlash message={flash} />

      <HudModal
        open={expanded}
        onClose={() => setExpanded(false)}
        title="MICRO APPS · LAUNCHER"
        icon={<LayoutGrid size={14} strokeWidth={2.2} />}
        className="max-w-[720px]"
      >
        <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-3">
          {[...REAL_APPS, ...SAMPLE_APPS].map((app) => (
            <Link
              key={app.id}
              href={app.route}
              onClick={() => setExpanded(false)}
              className="group flex flex-col gap-3 rounded-[10px] border border-subtle bg-panel-elevated p-3.5 transition-all hover:-translate-y-0.5 hover:border-orange/50 hover:bg-panel-hover"
            >
              <div className="flex items-center justify-between gap-2">
                <MicroAppIcon type={app.iconType} color={app.accentColor} size={36} className={cn(app.sample && 'opacity-70 saturate-50')} />
                <span className="flex items-center gap-1.5">
                  {app.sample && <SamplePill />}
                  <ArrowUpRight size={14} className="text-muted transition-colors group-hover:text-orange" />
                </span>
              </div>
              <div>
                <div className="text-[14px] font-semibold text-paper">{app.name}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted">{subtitleOf(app)}</div>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                :{app.port}
                <span className="text-secondary">{app.route}</span>
              </div>
            </Link>
          ))}
        </div>
      </HudModal>
    </HudPanel>
  );
}
