'use client';
import { ExternalLink, HardDrive, Library } from 'lucide-react';
import type { LtmDay, LtmStatus, ObsidianVault } from '@/types/ltm';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { agoLabel, appColor, dayLabel, minutesBetween } from './ltm-client';

interface DayRailProps {
  status: LtmStatus | null;
  nowIso: string | null; // set after mount
  days: LtmDay[];
  selected: string | null;
  onSelect: (date: string) => void;
  vaults: ObsidianVault[] | null;
}

export function DayRail({ status, nowIso, days, selected, onSelect, vaults }: DayRailProps) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const lastMins = status?.last && nowIso ? minutesBetween(status.last, nowIso) : null;
  const live = lastMins != null && lastMins <= 15;

  // Group days by month for headings.
  const groups: { month: string; days: LtmDay[] }[] = [];
  for (const d of days) {
    const month = dayLabel(d.date).month;
    const g = groups[groups.length - 1];
    if (g && g.month === month) g.days.push(d);
    else groups.push({ month, days: [d] });
  }

  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r border-subtle bg-panel/40">
      {/* Status */}
      <div className="border-b border-subtle p-3">
        <div className="hud-card p-3">
          <div className="flex items-center gap-2">
            <span
              className={cn('h-2 w-2 rounded-full', status?.available ? (live ? 'bg-green robo-pulse' : 'bg-amber') : 'bg-[#EF4444]')}
            />
            <span className="hud-label">
              {status == null ? 'Connecting…' : status.available ? (live ? 'Capturing' : 'Idle') : 'Unavailable'}
            </span>
            <HardDrive className="ml-auto h-3.5 w-3.5 text-muted" />
          </div>
          {status?.available ? (
            <>
              <div className="mt-2 font-doto text-[26px] font-bold leading-none text-orange">{formatInt(status.total)}</div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">captures · {status.apps} apps</div>
              <div className="mt-2 font-mono text-[10px] text-secondary">
                Last capture {lastMins != null ? agoLabel(lastMins) : '—'}
                {!status.framesAvailable && <span className="text-amber"> · screenshots offline</span>}
              </div>
              {status.pruned && status.pruned.total > 0 && (
                <div
                  className="mt-1.5 font-mono text-[10px] text-muted"
                  title="Moved to memory_pruned / ltm_pruned quarantine by ltm_prune.py — not deleted"
                >
                  {formatInt(status.pruned.total)} pruned · {formatInt(status.pruned.duplicate)} dupes ·{' '}
                  {formatInt(status.pruned.watching)} watching
                </div>
              )}
            </>
          ) : (
            status && <p className="mt-2 text-[11px] leading-snug text-secondary">{status.reason}</p>
          )}
        </div>
      </div>

      {/* Days */}
      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {groups.map((g) => (
          <div key={g.month} className="mb-2">
            <div className="hud-label px-2 py-1.5 text-[10px] text-muted">{g.month}</div>
            {g.days.map((d) => {
              const l = dayLabel(d.date);
              const active = d.date === selected;
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => onSelect(d.date)}
                  className={cn(
                    'group mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
                    active ? 'bg-orange/12 ring-1 ring-orange/40' : 'hover:bg-panel-hover',
                  )}
                >
                  <span className={cn('w-7 font-mono text-[10px] uppercase', active ? 'text-orange' : 'text-muted')}>{l.dow}</span>
                  <span className={cn('w-12 text-[12px] font-semibold', active ? 'text-paper' : 'text-secondary group-hover:text-paper')}>
                    {l.label}
                  </span>
                  <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-obsidian">
                    {d.apps.map((a) => (
                      <span key={a.app} style={{ width: `${(a.count / max) * 100}%`, background: appColor(a.app) }} />
                    ))}
                  </span>
                  <span className="w-9 text-right font-mono text-[10px] text-muted">{d.count}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Obsidian vaults */}
      <div className="border-t border-subtle p-3">
        <div className="mb-2 flex items-center gap-2">
          <Library className="h-3.5 w-3.5 text-purple" />
          <span className="hud-label">Obsidian vaults</span>
        </div>
        {vaults == null ? (
          <div className="font-mono text-[10px] text-muted">Loading…</div>
        ) : vaults.length === 0 ? (
          <div className="font-mono text-[10px] text-muted">No vaults registered</div>
        ) : (
          <ul className="space-y-1">
            {vaults.map((v) => (
              <li key={v.id}>
                <a
                  href={v.obsidianUrl}
                  title={v.path}
                  className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-panel-hover"
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', v.open ? 'bg-purple' : 'bg-highlight')} />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-secondary group-hover:text-paper">{v.name}</span>
                  <span className="font-mono text-[9px] uppercase text-muted">{v.location === 'icloud' ? 'iCloud' : 'local'}</span>
                  <span className="w-10 text-right font-mono text-[10px] text-muted">{formatInt(v.notes)}</span>
                  <ExternalLink className="h-3 w-3 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
