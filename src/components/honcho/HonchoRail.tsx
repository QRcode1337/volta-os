'use client';
import { Activity, Database, Users } from 'lucide-react';
import type { HonchoPeer, HonchoQueueResponse, HonchoStats, HonchoStatus, HonchoWorkspace } from '@/types/honcho';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { fmtSeconds, fmtTime, peerColor } from './honcho-client';

interface Props {
  status: HonchoStatus | null;
  queue: HonchoQueueResponse | null;
  workspaces: HonchoWorkspace[];
  workspace: string | null;
  onWorkspace: (id: string) => void;
  peers: HonchoPeer[];
  peersTotal: number;
  peersLoading: boolean;
  stats: HonchoStats | null;
  selectedPeer: string | null;
  onPeer: (id: string) => void;
}

export function HonchoRail({ status, queue, workspaces, workspace, onWorkspace, peers, peersTotal, peersLoading, stats, selectedPeer, onPeer }: Props) {
  const q = queue?.queue;
  const busy = !!q && q.pending_work_units + q.in_progress_work_units > 0;
  const pct = q && q.total_work_units > 0 ? Math.round((q.completed_work_units / q.total_work_units) * 100) : 100;
  const maxMsgs = Math.max(1, ...peers.map((p) => stats?.peers[p.id]?.messages ?? 0));

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-subtle bg-panel/40">
      {/* Status */}
      <div className="border-b border-subtle p-3">
        <div className="hud-card p-3">
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full', status ? (busy ? 'bg-amber robo-pulse' : 'bg-green') : 'bg-highlight')} />
            <span className="hud-label">{status == null ? 'Connecting…' : busy ? 'Deriving' : 'Online'}</span>
            <Activity className="ml-auto h-3.5 w-3.5 text-muted" />
          </div>
          {status && (
            <div className="mt-1 font-mono text-[10px] text-muted">
              {status.url.replace(/^https?:\/\//, '')} · {status.latencyMs}ms
            </div>
          )}
          {q ? (
            <>
              <div className="mt-2.5 flex items-baseline gap-1.5">
                <span className={cn('font-doto text-[26px] font-bold leading-none', busy ? 'text-amber' : 'text-orange')}>
                  {formatInt(q.pending_work_units)}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">pending work</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-obsidian">
                <div className="h-full rounded-full bg-orange/80" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-1 font-mono text-[9.5px] text-muted">
                <span>
                  <span className="text-secondary">{formatInt(q.in_progress_work_units)}</span> active
                </span>
                <span>
                  <span className="text-secondary">{formatInt(q.completed_work_units)}</span> done
                </span>
                <span>
                  <span className="text-secondary">{formatInt(q.total_work_units)}</span> total
                </span>
              </div>
              {queue?.deriver && (
                <div className="mt-2 font-mono text-[9.5px] text-muted">
                  Deriver backlog <span className="text-secondary">{fmtSeconds(queue.deriver.outstanding_work_seconds)}</span>
                  {queue.deriver.embeddings_pending > 0 && <> · {formatInt(queue.deriver.embeddings_pending)} embeds</>}
                  {queue.deriver.dreams_due > 0 && <> · {queue.deriver.dreams_due} dreams due</>}
                </div>
              )}
            </>
          ) : (
            status && <div className="mt-2 font-mono text-[10px] text-muted">Queue status loading…</div>
          )}
        </div>
      </div>

      {/* Workspace picker */}
      <div className="border-b border-subtle p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-purple" />
          <span className="hud-label">Workspace</span>
          <span className="ml-auto font-mono text-[10px] text-muted">{workspaces.length}</span>
        </div>
        {workspaces.length === 0 ? (
          <div className="font-mono text-[10px] text-muted">{status ? 'No workspaces' : '—'}</div>
        ) : workspaces.length <= 4 ? (
          <div className="space-y-0.5">
            {workspaces.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => onWorkspace(w.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors',
                  w.id === workspace ? 'bg-orange/12 text-paper ring-1 ring-orange/40' : 'text-secondary hover:bg-panel-hover hover:text-paper',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', w.id === workspace ? 'bg-orange' : 'bg-highlight')} />
                <span className="min-w-0 flex-1 truncate font-medium">{w.id}</span>
              </button>
            ))}
          </div>
        ) : (
          <select
            value={workspace ?? ''}
            onChange={(e) => onWorkspace(e.target.value)}
            className="h-8 w-full rounded-md border border-subtle bg-panel-elevated px-2 text-[12px] text-paper focus:border-orange/60 focus:outline-none"
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.id}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Peers */}
      <div className="flex items-center gap-2 px-3 pb-1 pt-3">
        <Users className="h-3.5 w-3.5 text-teal" />
        <span className="hud-label">Peers</span>
        <span className="ml-auto font-mono text-[10px] text-muted">{formatInt(peersTotal)}</span>
      </div>
      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {peersLoading && !peers.length
          ? Array.from({ length: 6 }, (_, i) => <div key={i} className="mx-1 my-1 h-9 animate-pulse rounded-md bg-panel" />)
          : peers.map((p) => {
              const st = stats?.peers[p.id];
              const active = p.id === selectedPeer;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPeer(p.id)}
                  title={p.id}
                  className={cn(
                    'group mb-0.5 flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left transition-colors',
                    active ? 'bg-orange/12 ring-1 ring-orange/40' : 'hover:bg-panel-hover',
                  )}
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: peerColor(p.id) }} />
                    <span className={cn('min-w-0 flex-1 truncate text-[12px] font-medium', active ? 'text-paper' : 'text-secondary group-hover:text-paper')}>
                      {p.id}
                    </span>
                    <span className="font-mono text-[10px] text-muted">
                      {st?.messages != null ? formatInt(st.messages) : stats ? '—' : '…'}
                    </span>
                  </span>
                  <span className="flex w-full items-center gap-2 pl-4">
                    <span className="flex h-1 flex-1 overflow-hidden rounded-full bg-obsidian">
                      <span style={{ width: `${((st?.messages ?? 0) / maxMsgs) * 100}%`, background: peerColor(p.id) }} />
                    </span>
                    <span className="w-16 text-right font-mono text-[9px] uppercase text-muted">
                      {st ? `${st.sessions} sess` : ''}
                    </span>
                  </span>
                </button>
              );
            })}
        {!peersLoading && !peers.length && <div className="px-2 py-3 font-mono text-[10px] text-muted">No peers in this workspace</div>}
      </div>
      <div className="border-t border-subtle px-3 py-2 font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
        counts = messages sent
        {stats?.partial && <span title="Some peer/session pairs hit caps or failed to count; message counts are lower bounds"> (≥ lower bounds)</span>} ·{' '}
        {stats ? `counted ${fmtTime(stats.computedAt)}` : 'counting…'}
      </div>
    </aside>
  );
}
