'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { Globe, ListTree, Network, RefreshCw } from 'lucide-react';
import type { LaunchdJob, LaunchdScope, SystemsInventory } from '@/types/systems';
import { cn } from '@/lib/cn';
import { useSharedJson } from '@/components/dashboard/widgets/shared-json';
import { Panel } from './Panel';
import { AGENT_CHIP, formatAgo, formatBytes, formatDuration } from './format';

// Every launchd job (enabled or disabled) and every TCP listener with its PID / parent — GET /api/systems/inventory.

const API_URL = '/api/systems/inventory';
const POLL_MS = 30_000;

const SCOPE_LABEL: Record<LaunchdScope, string> = { user: 'user', app: 'app', 'global-agent': 'global', daemon: 'daemon' };

type JobFilter = 'all' | 'running' | 'loaded' | 'not-loaded' | 'disabled' | 'failing';
const FILTERS: { id: JobFilter; label: string; test: (j: LaunchdJob) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'running', label: 'Running', test: (j) => j.health === 'running' },
  { id: 'loaded', label: 'Loaded', test: (j) => j.loaded },
  { id: 'not-loaded', label: 'Not loaded', test: (j) => !j.loaded },
  { id: 'disabled', label: 'Disabled', test: (j) => !j.enabled },
  { id: 'failing', label: 'Failing', test: (j) => j.health === 'failing' || j.health === 'stopped' },
];

const th = 'whitespace-nowrap px-2 py-1.5 text-left font-semibold uppercase tracking-[0.08em] text-muted';
const td = 'whitespace-nowrap px-2 py-1.5 align-top';

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]',
        active ? 'border-orange/60 text-orange' : 'border-subtle text-muted hover:text-paper',
      )}
    >
      {children}
    </button>
  );
}

export function InventoryPanel({ now, highlighted }: { now: number | null; highlighted?: boolean }) {
  const { data, error, loading } = useSharedJson<SystemsInventory>(API_URL, POLL_MS);
  const [filter, setFilter] = useState<JobFilter>('all');
  const [q, setQ] = useState('');

  const jobs = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    const needle = q.trim().toLowerCase();
    return (data?.jobs ?? []).filter((j) => f.test(j) && (!needle || j.label.toLowerCase().includes(needle) || (j.program ?? '').toLowerCase().includes(needle)));
  }, [data, filter, q]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, (data?.jobs ?? []).filter(f.test).length])) as Record<JobFilter, number>, [data]);

  return (
    <Panel
      id="inventory"
      title="Launchd & listeners"
      icon={ListTree}
      highlighted={highlighted}
      meta={data ? `launchctl · lsof · ps — ${formatAgo(data.generatedAt, now)} in ${data.durationMs} ms` : 'launchctl · lsof · ps'}
    >
      {!data ? (
        loading || !error ? (
          <p className="flex items-center gap-2 font-mono text-[10.5px] text-muted">
            <RefreshCw className="h-3 w-3 robo-spin" /> Reading launchd jobs and listening ports…
          </p>
        ) : (
          <p className="font-mono text-[10.5px] text-[#F87171]">{error.message}</p>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label} {counts[f.id]}
              </Chip>
            ))}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter label / program"
              className="ml-auto h-7 w-full rounded-full border border-subtle bg-obsidian px-3 font-mono text-[10.5px] text-paper placeholder:text-muted sm:w-56"
            />
          </div>

          <div className="hud-scroll max-h-[460px] overflow-auto rounded-md border border-subtle">
            <table className="w-full font-mono text-[10.5px]">
              <thead className="sticky top-0 bg-panel-elevated">
                <tr>
                  <th className={th}>State</th>
                  <th className={th}>Label</th>
                  <th className={th}>Scope</th>
                  <th className={th}>Enabled</th>
                  <th className={th}>PID</th>
                  <th className={th}>Exit</th>
                  <th className={th}>Ports</th>
                  <th className={th}>Program</th>
                  <th className={th}>Schedule</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const chip = AGENT_CHIP[j.health];
                  return (
                    <tr key={`${j.scope}:${j.label}`} className={cn('border-t border-subtle/60', !j.enabled && 'opacity-60')}>
                      <td className={td}>
                        <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em]', chip.cls)}>{chip.label}</span>
                      </td>
                      <td className={cn(td, 'text-paper')} title={j.plistPath ?? 'registered by an app (no plist)'}>
                        {j.label}
                      </td>
                      <td className={cn(td, 'text-muted')}>{SCOPE_LABEL[j.scope]}</td>
                      <td className={cn(td, j.enabled ? 'text-secondary' : 'text-amber')}>{j.enabled ? 'yes' : 'disabled'}</td>
                      <td className={cn(td, 'text-secondary')}>{j.pid ?? '—'}</td>
                      <td className={cn(td, j.lastExit ? 'text-[#F87171]' : 'text-muted')}>{j.lastExit ?? '—'}</td>
                      <td className={cn(td, 'text-secondary')}>{j.ports.length ? j.ports.join(', ') : '—'}</td>
                      <td className={cn(td, 'max-w-[180px] truncate text-muted')}>{j.program ?? '—'}</td>
                      <td className={cn(td, 'text-muted')}>{j.schedule ?? '—'}</td>
                    </tr>
                  );
                })}
                {!jobs.length && (
                  <tr>
                    <td colSpan={9} className={cn(td, 'text-muted')}>
                      No jobs match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-subtle pt-3">
            <div className="mb-2 flex items-center gap-2">
              <Network className="h-3 w-3 text-orange" />
              <span className="hud-label !text-[10px]">Listening ports</span>
              <span className="ml-auto font-mono text-[9.5px] text-muted">
                {data.listeners.length} TCP listeners · {data.listeners.filter((l) => l.bind === 'all-interfaces').length} on all interfaces
              </span>
            </div>
            <div className="hud-scroll max-h-[420px] overflow-auto rounded-md border border-subtle">
              <table className="w-full font-mono text-[10.5px]">
                <thead className="sticky top-0 bg-panel-elevated">
                  <tr>
                    <th className={th}>Port</th>
                    <th className={th}>Bind</th>
                    <th className={th}>Process</th>
                    <th className={th}>PID</th>
                    <th className={th}>PPID</th>
                    <th className={th}>launchd job</th>
                    <th className={th}>Uptime</th>
                    <th className={th}>RSS</th>
                  </tr>
                </thead>
                <tbody>
                  {data.listeners.map((l) => (
                    <tr key={`${l.port}:${l.pid}`} className="border-t border-subtle/60">
                      <td className={cn(td, 'text-paper')}>
                        {l.bind === 'loopback' ? (
                          <a href={`http://127.0.0.1:${l.port}`} target="_blank" rel="noreferrer" className="hover:text-orange">
                            {l.port}
                          </a>
                        ) : (
                          l.port
                        )}
                      </td>
                      <td className={td} title={l.addrs.join(' · ')}>
                        {l.bind === 'all-interfaces' ? (
                          <span className="inline-flex items-center gap-0.5 text-amber">
                            <Globe className="h-3 w-3" /> all
                          </span>
                        ) : (
                          <span className="text-muted">loopback</span>
                        )}
                      </td>
                      <td className={cn(td, 'max-w-[200px] truncate text-secondary')}>{l.name}</td>
                      <td className={cn(td, 'text-secondary')}>{l.pid}</td>
                      <td className={cn(td, 'max-w-[220px] truncate text-muted')}>
                        {l.ppid ?? '—'}
                        {l.parentName && <span> · {l.parentName}</span>}
                      </td>
                      <td className={cn(td, l.launchdLabel ? 'text-secondary' : 'text-muted')}>{l.launchdLabel ?? '—'}</td>
                      <td className={cn(td, 'text-muted')}>{formatDuration(l.uptimeSec)}</td>
                      <td className={cn(td, 'text-muted')}>{formatBytes(l.rssBytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.notes.map((n) => (
            <p key={n} className="font-mono text-[9.5px] text-muted/80">
              {n}
            </p>
          ))}
        </>
      )}
    </Panel>
  );
}
