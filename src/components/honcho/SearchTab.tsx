'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, SearchX } from 'lucide-react';
import type { HonchoMessage } from '@/types/honcho';
import { cn } from '@/lib/cn';
import { fmtDateTime, hPost, isAbort, isOffline, peerColor, shortId, splitHighlight, wsUrl } from './honcho-client';
import { useReportOffline } from './useHoncho';
import { Empty, ErrorLine, Skeleton } from './PeersTab';

export type SearchScope = 'workspace' | 'peer' | 'session';

interface Props {
  workspace: string;
  query: string;
  scope: SearchScope;
  onScope: (s: SearchScope) => void;
  peer: string | null;
  session: string | null;
  onOpen: (m: HonchoMessage) => void;
}

/** Snippet centred on the first query-word hit. */
function snippet(text: string, query: string, len = 360): string {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  const lower = text.toLowerCase();
  let at = -1;
  for (const w of words) {
    const i = lower.indexOf(w);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (text.length <= len) return text;
  const start = Math.max(0, (at < 0 ? 0 : at) - Math.floor(len / 3));
  return `${start > 0 ? '…' : ''}${text.slice(start, start + len)}${start + len < text.length ? '…' : ''}`;
}

export function SearchTab({ workspace, query, scope, onScope, peer, session, onOpen }: Props) {
  const reportOffline = useReportOffline();
  const [results, setResults] = useState<HonchoMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query) {
      setResults(null);
      setError(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    const body = {
      query,
      limit: 50,
      peer: scope === 'peer' ? (peer ?? undefined) : undefined,
      session: scope === 'session' ? (session ?? undefined) : undefined,
    };
    hPost<HonchoMessage[]>(wsUrl(workspace, ['search']), body, ac.signal)
      .then(setResults)
      .catch((err) => {
        if (isAbort(err)) return;
        if (isOffline(err)) reportOffline((err as Error).message);
        setError((err as Error).message);
        setResults(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [workspace, query, scope, peer, session, reportOffline]);

  const scopes: { id: SearchScope; label: string; disabled: boolean }[] = [
    { id: 'workspace', label: 'Workspace', disabled: false },
    { id: 'peer', label: peer ? `Peer · ${shortId(peer, 16)}` : 'Peer', disabled: !peer },
    { id: 'session', label: session ? `Session · ${shortId(session, 18)}` : 'Session', disabled: !session },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-subtle px-4">
        <span className="hud-label">Search</span>
        <div className="flex rounded-full border border-subtle bg-panel-elevated p-0.5">
          {scopes.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={s.disabled}
              onClick={() => onScope(s.id)}
              className={cn(
                'rounded-full px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] disabled:opacity-40',
                scope === s.id ? 'bg-orange text-obsidian' : 'text-muted hover:text-paper',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[10px] text-muted">
          {query ? (loading ? 'searching…' : results ? `${results.length} results for “${shortId(query, 40)}”` : '') : 'press / to search'}
        </span>
      </div>
      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {error && <ErrorLine text={error} />}
        {!query ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <SearchX className="h-8 w-8 text-muted" />
            <p className="mt-3 max-w-sm text-[12.5px] leading-relaxed text-secondary">
              Hybrid (semantic + text) search over every message Honcho stores. Type in the search bar above — results link straight into
              the session thread.
            </p>
          </div>
        ) : loading && !results ? (
          <Skeleton lines={12} />
        ) : results && !results.length ? (
          <Empty text="No messages matched." />
        ) : (
          <ul className="space-y-2">
            {results?.map((m) => {
              const color = peerColor(m.peer_id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(m)}
                    className="group hud-card block w-full px-3 py-2.5 text-left transition-colors hover:border-highlight"
                  >
                    <div className="flex items-center gap-2 font-mono text-[9.5px] text-muted">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                      <span className="shrink-0 font-sans text-[11px] font-semibold" style={{ color }} title={m.peer_id}>
                        {shortId(m.peer_id, 28)}
                      </span>
                      <span className="truncate" title={m.session_id}>
                        in {shortId(m.session_id, 44)}
                      </span>
                      <span className="ml-auto shrink-0">{fmtDateTime(m.created_at)}</span>
                      <ArrowUpRight className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-paper/85 [overflow-wrap:anywhere]">
                      {splitHighlight(snippet(m.content, query), query).map((s, i) =>
                        s.hit ? (
                          <mark key={i} className="rounded-sm bg-orange/25 px-0.5 text-paper">
                            {s.text}
                          </mark>
                        ) : (
                          <span key={i}>{s.text}</span>
                        ),
                      )}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
