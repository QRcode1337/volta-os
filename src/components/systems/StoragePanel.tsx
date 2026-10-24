'use client';
import { HardDrive, RefreshCw } from 'lucide-react';
import type { StorageReport } from '@/types/systems';
import { cn } from '@/lib/cn';
import { Panel } from './Panel';
import { SEVERITY_BAR, SEVERITY_TEXT, formatAgo, formatBytes } from './format';

function purgeText(iso: string | undefined, now: number | null): string | null {
  if (!iso || now == null) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const days = Math.ceil((new Date(y, m - 1, d).getTime() - now) / 86_400_000);
  return days > 0 ? `purge allowed in ${days} day${days === 1 ? '' : 's'}` : 'purge allowed now';
}

export function StoragePanel({ storage, now, highlighted }: { storage: StorageReport; now: number | null; highlighted?: boolean }) {
  const { volumes, sizes } = storage;
  const max = Math.max(1, ...sizes.items.map((i) => i.bytes ?? 0));
  return (
    <Panel id="storage" title="Storage" icon={HardDrive} highlighted={highlighted} meta="df -k · du -sk (nice'd)">
      <ul className="flex flex-col gap-3">
        {volumes.map((v) => (
          <li key={v.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] font-semibold text-paper">{v.label}</span>
              <span className="truncate font-mono text-[10px] text-muted">{v.mount}</span>
              <span className={cn('ml-auto shrink-0 font-mono text-[11px] font-semibold', SEVERITY_TEXT[v.severity])}>
                {v.mounted ? `${formatBytes(v.freeBytes)} free` : 'not mounted'}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-obsidian">
              {v.usedPct != null && <div className={cn('h-full rounded-full', SEVERITY_BAR[v.severity])} style={{ width: `${Math.min(100, v.usedPct)}%` }} />}
            </div>
            <div className="flex flex-wrap gap-x-3 font-mono text-[9.5px] text-muted">
              {v.mounted && (
                <span>
                  {v.usedPct}% used · {formatBytes(v.usedBytes)} of {formatBytes(v.totalBytes)}
                </span>
              )}
              <span>{v.thresholds}</span>
            </div>
            {v.note && <p className="font-mono text-[9.5px] text-muted/80">{v.note}</p>}
          </li>
        ))}
      </ul>

      <div className="border-t border-subtle pt-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="hud-label !text-[10px]">Biggest folders</span>
          <span className="ml-auto font-mono text-[9.5px] text-muted">
            {sizes.status === 'ready'
              ? `measured ${formatAgo(sizes.computedAt, now)}${sizes.durationMs != null ? ` in ${(sizes.durationMs / 1000).toFixed(1)}s` : ''} · every ${sizes.ttlMinutes} min`
              : sizes.status === 'pending'
                ? ''
                : 'failed'}
          </span>
        </div>
        {sizes.status === 'pending' ? (
          <p className="flex items-center gap-2 font-mono text-[10.5px] text-muted">
            <RefreshCw className="h-3 w-3 robo-spin" /> Measuring folder sizes in the background (du, low priority, ~10 s)…
          </p>
        ) : sizes.status === 'error' ? (
          <p className="font-mono text-[10.5px] text-[#F87171]">{sizes.error}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sizes.items.map((i) => {
              const purge = purgeText(i.purgeAfter, now);
              return (
                <li key={i.id} className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 truncate text-[12px] text-paper">{i.label}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-muted" title={i.path}>
                      {i.path}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-secondary">
                      {i.error && i.bytes == null ? <span className="text-muted">{i.error}</span> : formatBytes(i.bytes)}
                      {i.partial && <span className="text-amber"> ≥</span>}
                      {i.apparentBytes != null && <span className="text-muted"> [{formatBytes(i.apparentBytes)}]</span>}
                    </span>
                  </div>
                  {i.bytes != null && (
                    <div className="h-1 w-full overflow-hidden rounded-full bg-obsidian">
                      <div className="h-full rounded-full bg-orange/70" style={{ width: `${Math.max(0.5, (i.bytes / max) * 100)}%` }} />
                    </div>
                  )}
                  {(i.note || purge) && (
                    <p className="font-mono text-[9.5px] text-muted">
                      {i.note}
                      {i.note && purge ? ' · ' : ''}
                      {purge && <span className={purge === 'purge allowed now' ? 'text-amber' : 'text-secondary'}>{purge}</span>}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
