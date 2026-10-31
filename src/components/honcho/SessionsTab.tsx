'use client';
import { useEffect, useMemo, useState } from 'react';
import { Filter, Loader2, MessagesSquare, X } from 'lucide-react';
import type { HonchoPage, HonchoSession, HonchoStats } from '@/types/honcho';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { fmtDate, fmtTime, hGet, isAbort, isOffline, wsUrl } from './honcho-client';
import { useReportOffline } from './useHoncho';
import { MessageThread, type MessageFocus } from './MessageThread';
import { ErrorLine } from './PeersTab';

interface Props {
  workspace: string;
  session: string | null;
  focus: MessageFocus | null;
  onSession: (id: string) => void;
  selfPeer: string | null;
  stats: HonchoStats | null;
  onCopy: (text: string, what: string) => void;
}

const PAGE = 100;

export function SessionsTab({ workspace, session, focus, onSession, selfPeer, stats, onCopy }: Props) {
  const reportOffline = useReportOffline();
  const [list, setList] = useState<HonchoSession[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    hGet<HonchoPage<HonchoSession>>(wsUrl(workspace, ['sessions'], { page, size: PAGE }), ac.signal)
      .then((r) => {
        setList((prev) => (page === 1 ? r.items : [...prev, ...r.items.filter((s) => !prev.some((p) => p.id === s.id))]));
        setTotal(r.total);
      })
      .catch((err) => {
        if (isAbort(err)) return;
        if (isOffline(err)) reportOffline((err as Error).message);
        setError((err as Error).message);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [workspace, page, reportOffline]);

  // Default to the newest session once the list lands.
  useEffect(() => {
    if (!session && list.length) onSession(list[0].id);
  }, [session, list, onSession]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? list.filter((s) => s.id.toLowerCase().includes(f)) : list;
  }, [list, filter]);

  return (
    <div className="flex min-h-0 flex-1 max-md:flex-col">
      <div className="flex w-[300px] shrink-0 flex-col border-r border-subtle max-md:max-h-[40dvh] max-md:overflow-y-auto max-md:w-full max-md:shrink-0 max-md:border-r-0 max-md:border-b">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-subtle px-3">
          <MessagesSquare className="h-3.5 w-3.5 text-teal" />
          <span className="hud-label">Sessions</span>
          <span className="ml-auto font-mono text-[10px] text-muted">{formatInt(total)}</span>
        </div>
        <label className="mx-2 mt-2 flex h-7 shrink-0 items-center gap-2 rounded-md border border-subtle bg-panel-elevated px-2 focus-within:border-orange/60">
          <Filter className="h-3 w-3 text-muted" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by id…"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-paper placeholder:text-muted focus:outline-none"
          />
          {filter && (
            <button type="button" onClick={() => setFilter('')} className="text-muted hover:text-paper" aria-label="Clear filter">
              <X className="h-3 w-3" />
            </button>
          )}
        </label>
        <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {error && <ErrorLine text={error} />}
          {loading && !list.length
            ? Array.from({ length: 10 }, (_, i) => <div key={i} className="my-1 h-11 animate-pulse rounded-md bg-panel" />)
            : shown.map((s) => {
                const active = s.id === session;
                const n = stats?.sessions[s.id];
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSession(s.id)}
                    title={s.id}
                    className={cn(
                      'group mb-0.5 flex w-full flex-col rounded-md px-2 py-1.5 text-left transition-colors',
                      active ? 'bg-orange/12 ring-1 ring-orange/40' : 'hover:bg-panel-hover',
                    )}
                  >
                    <span className="flex w-full items-center gap-2">
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', s.is_active ? 'bg-green' : 'bg-highlight')} />
                      <span className={cn('min-w-0 flex-1 truncate text-[12px] font-medium', active ? 'text-paper' : 'text-secondary group-hover:text-paper')}>
                        {s.id}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 pl-3.5 font-mono text-[9.5px] text-muted">
                      <span>
                        {fmtDate(s.created_at)} {fmtTime(s.created_at)}
                      </span>
                      <span className="ml-auto">{n != null ? `${formatInt(n)} msgs` : ''}</span>
                    </span>
                  </button>
                );
              })}
          {!loading && list.length < total && !filter && (
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              className="mt-1 w-full rounded-md border border-subtle py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-secondary hover:text-paper"
            >
              Load more ({formatInt(total - list.length)})
            </button>
          )}
          {loading && list.length > 0 && <Loader2 className="mx-auto my-2 h-4 w-4 robo-spin text-muted" />}
          {!loading && !error && !list.length && <div className="px-2 py-4 text-[12px] text-muted">No sessions in this workspace.</div>}
        </div>
      </div>
      {session ? (
        <MessageThread
          key={`${workspace}/${session}`}
          workspace={workspace}
          session={session}
          focus={focus}
          selfPeer={selfPeer}
          totalHint={stats?.sessions[session]}
          onCopy={onCopy}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-[12px] text-muted">Select a session</div>
      )}
    </div>
  );
}
