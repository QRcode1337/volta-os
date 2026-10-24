'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, FileText, Loader2 } from 'lucide-react';
import type { HonchoMessage, HonchoPage, HonchoPeer, HonchoSessionSummaries, HonchoSummary } from '@/types/honcho';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { dayKey, fmtDate, fmtDateTime, fmtTime, hGet, isAbort, isOffline, peerColor, splitHighlight, wsUrl } from './honcho-client';
import { useHonchoGet, useReportOffline } from './useHoncho';
import { RichText } from './RichText';
import { ErrorLine } from './PeersTab';

export interface MessageFocus {
  id: string;
  created_at: string;
  query?: string;
}

interface Props {
  workspace: string;
  session: string;
  focus: MessageFocus | null;
  /** Messages from this peer are right-aligned ("me"). */
  selfPeer: string | null;
  totalHint?: number;
  onCopy: (text: string, what: string) => void;
}

const PAGE = 50;
const LONG = 1400;

function dedupeSort(list: HonchoMessage[]): HonchoMessage[] {
  const m = new Map<string, HonchoMessage>();
  for (const x of list) m.set(x.id, x);
  return [...m.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
}

export function MessageThread({ workspace, session, focus, selfPeer, totalHint, onCopy }: Props) {
  const reportOffline = useReportOffline();
  const [messages, setMessages] = useState<HonchoMessage[]>([]);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [hasLater, setHasLater] = useState(false);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState<'earlier' | 'later' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showSummary, setShowSummary] = useState<'short' | 'long' | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<'bottom' | 'focus' | null>(null);

  const summaries = useHonchoGet<HonchoSessionSummaries>(wsUrl(workspace, ['sessions', session, 'summaries']));
  const members = useHonchoGet<HonchoPage<HonchoPeer>>(wsUrl(workspace, ['sessions', session, 'peers']));

  const url = useCallback(
    (q: Record<string, string | number | undefined>) => wsUrl(workspace, ['sessions', session, 'messages'], q),
    [workspace, session],
  );

  // Initial window: latest page, or a window around the focused message.
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setMessages([]);
    setExpanded(new Set());
    const run = async () => {
      if (focus) {
        const [before, after] = await Promise.all([
          hGet<HonchoPage<HonchoMessage>>(url({ order: 'desc', before: focus.created_at, size: 15 }), ac.signal),
          hGet<HonchoPage<HonchoMessage>>(url({ order: 'asc', from: focus.created_at, size: 40 }), ac.signal),
        ]);
        setMessages(dedupeSort([...before.items, ...after.items]));
        setHasEarlier(before.total > before.items.length);
        setHasLater(after.total > after.items.length);
        pendingScroll.current = 'focus';
      } else {
        const latest = await hGet<HonchoPage<HonchoMessage>>(url({ order: 'desc', size: PAGE }), ac.signal);
        setMessages(dedupeSort(latest.items));
        setHasEarlier(latest.total > latest.items.length);
        setHasLater(false);
        pendingScroll.current = 'bottom';
      }
    };
    run()
      .catch((err) => {
        if (isAbort(err)) return;
        if (isOffline(err)) reportOffline((err as Error).message);
        setError((err as Error).message);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [url, focus, reportOffline]);

  // Scroll after a window lands.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pendingScroll.current || loading) return;
    if (pendingScroll.current === 'bottom') el.scrollTop = el.scrollHeight;
    else if (focus) el.querySelector<HTMLElement>(`[data-mid="${CSS.escape(focus.id)}"]`)?.scrollIntoView({ block: 'center' });
    pendingScroll.current = null;
  }, [messages, loading, focus]);

  const loadEarlier = async () => {
    if (!messages.length) return;
    setMore('earlier');
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const r = await hGet<HonchoPage<HonchoMessage>>(url({ order: 'desc', before: messages[0].created_at, size: PAGE }));
      setMessages((m) => dedupeSort([...r.items, ...m]));
      setHasEarlier(r.total > r.items.length);
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - prevHeight;
      });
    } catch (err) {
      if (isOffline(err)) reportOffline((err as Error).message);
      setError((err as Error).message);
    } finally {
      setMore(null);
    }
  };

  const loadLater = async () => {
    if (!messages.length) return;
    setMore('later');
    try {
      const r = await hGet<HonchoPage<HonchoMessage>>(url({ order: 'asc', after: messages[messages.length - 1].created_at, size: PAGE }));
      setMessages((m) => dedupeSort([...m, ...r.items]));
      setHasLater(r.total > r.items.length);
    } catch (err) {
      if (isOffline(err)) reportOffline((err as Error).message);
      setError((err as Error).message);
    } finally {
      setMore(null);
    }
  };

  const memberIds = members.data?.items.map((p) => p.id) ?? [];
  const tokens = useMemo(() => messages.reduce((n, m) => n + (m.token_count ?? 0), 0), [messages]);
  // A focus (deep link / search hit) whose message isn't in the loaded window: say so instead of failing silently.
  const focusMissing = !!focus && !loading && !error && !messages.some((m) => m.id === focus.id);
  const summary: HonchoSummary | null =
    showSummary === 'short' ? (summaries.data?.short_summary ?? null) : showSummary === 'long' ? (summaries.data?.long_summary ?? null) : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Session header */}
      <div className="shrink-0 border-b border-subtle px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="selectable min-w-0 flex-1 truncate text-[14px] font-semibold text-paper" title={session}>
            {session}
          </h2>
          <span className="font-mono text-[10px] text-muted">
            {totalHint != null ? `${formatInt(totalHint)} msgs · ` : ''}
            {formatInt(messages.length)} loaded · {formatInt(tokens)} tok
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {memberIds.map((id) => (
            <span
              key={id}
              title={id}
              className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-subtle px-2 py-0.5 text-[10.5px] text-secondary"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: peerColor(id) }} />
              <span className="truncate">{id}</span>
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1">
            {(['short', 'long'] as const).map((k) => {
              const s = k === 'short' ? summaries.data?.short_summary : summaries.data?.long_summary;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!s}
                  onClick={() => setShowSummary((cur) => (cur === k ? null : k))}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] transition-colors',
                    showSummary === k ? 'border-purple/60 bg-purple/15 text-paper' : 'border-subtle text-muted hover:text-paper',
                    !s && 'cursor-not-allowed opacity-40 hover:text-muted',
                  )}
                  title={s ? `${k} summary · ${s.token_count} tokens · ${fmtDateTime(s.created_at)}` : `No ${k} summary yet`}
                >
                  <FileText className="h-3 w-3" /> {k} summary
                </button>
              );
            })}
          </span>
        </div>
        {summary && (
          <div className="hud-scroll mt-2 max-h-[34vh] overflow-y-auto rounded-md border border-purple/30 bg-purple/5 p-3">
            <div className="mb-1.5 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
              {summary.summary_type} summary · {summary.token_count} tokens · {fmtDateTime(summary.created_at)}
              <button type="button" onClick={() => onCopy(summary.content, 'summary')} className="ml-auto text-muted hover:text-paper" title="Copy summary">
                <Copy className="h-3 w-3" />
              </button>
            </div>
            <RichText text={summary.content} className="text-[12.5px]" />
          </div>
        )}
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="hud-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {error && <ErrorLine text={error} />}
        {focusMissing && (
          <div className="mb-2 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 font-mono text-[11px] text-amber [overflow-wrap:anywhere]">
            Message {focus.id} isn&apos;t in this session around {fmtDateTime(focus.created_at)} — it may have been deleted, or the
            link&apos;s time doesn&apos;t match. Showing the messages nearest that time.
          </div>
        )}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className={cn('h-14 animate-pulse rounded-xl bg-panel', i % 2 ? 'ml-auto w-[55%]' : 'w-[65%]')} />
            ))}
          </div>
        ) : (
          <>
            {hasEarlier && (
              <MoreButton dir="earlier" busy={more === 'earlier'} onClick={() => void loadEarlier()} />
            )}
            {!messages.length && !error && <div className="py-10 text-center text-[12px] text-muted">No messages in this session.</div>}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
              const sameRun = !!prev && !newDay && prev.peer_id === m.peer_id;
              const mine = selfPeer != null && m.peer_id === selfPeer;
              const color = peerColor(m.peer_id);
              const isFocus = focus?.id === m.id;
              const long = m.content.length > LONG && !expanded.has(m.id);
              const text = long ? `${m.content.slice(0, LONG)}…` : m.content;
              return (
                <div key={m.id} data-mid={m.id}>
                  {newDay && (
                    <div className="my-3 flex items-center gap-3">
                      <div className="h-px flex-1 bg-subtle" />
                      <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">{fmtDate(m.created_at)}</span>
                      <div className="h-px flex-1 bg-subtle" />
                    </div>
                  )}
                  <div className={cn('flex', mine ? 'justify-end' : 'justify-start', sameRun ? 'mt-1' : 'mt-3')}>
                    <div className="min-w-0 max-w-[78%]">
                      {!sameRun && (
                        <div className={cn('mb-1 flex items-center gap-1.5 text-[10.5px]', mine && 'justify-end')}>
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                          <span className="truncate font-semibold" style={{ color }} title={m.peer_id}>
                            {m.peer_id}
                          </span>
                          <span className="font-mono text-[9.5px] text-muted">{fmtTime(m.created_at)}</span>
                        </div>
                      )}
                      <div
                        className={cn(
                          'group relative rounded-xl border px-3 py-2 text-[12.5px] leading-relaxed',
                          mine ? 'rounded-tr-sm bg-panel-elevated' : 'rounded-tl-sm bg-panel',
                          isFocus ? 'ring-2 ring-orange/70' : '',
                        )}
                        style={{ borderColor: `${color}55` }}
                        title={fmtDateTime(m.created_at)}
                      >
                        <div className="selectable whitespace-pre-wrap text-paper/90 [overflow-wrap:anywhere]">
                          {isFocus && focus?.query
                            ? splitHighlight(text, focus.query).map((s, j) =>
                                s.hit ? (
                                  <mark key={j} className="rounded-sm bg-orange/30 px-0.5 text-paper">
                                    {s.text}
                                  </mark>
                                ) : (
                                  <span key={j}>{s.text}</span>
                                ),
                              )
                            : text}
                        </div>
                        <div className="mt-1 flex items-center gap-2 font-mono text-[9px] text-muted">
                          {sameRun && <span>{fmtTime(m.created_at)}</span>}
                          <span>{m.token_count} tok</span>
                          {m.content.length > LONG && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded((s) => {
                                  const n = new Set(s);
                                  if (n.has(m.id)) n.delete(m.id);
                                  else n.add(m.id);
                                  return n;
                                })
                              }
                              className="text-orange hover:underline"
                            >
                              {long ? `show all (${formatInt(m.content.length)} chars)` : 'collapse'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onCopy(m.content, 'message')}
                            className="ml-auto opacity-0 transition-opacity hover:text-paper group-hover:opacity-100"
                            title="Copy message"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {hasLater && <MoreButton dir="later" busy={more === 'later'} onClick={() => void loadLater()} />}
          </>
        )}
      </div>
    </div>
  );
}

function MoreButton({ dir, busy, onClick }: { dir: 'earlier' | 'later'; busy: boolean; onClick: () => void }) {
  const Icon = dir === 'earlier' ? ChevronUp : ChevronDown;
  return (
    <div className="my-2 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary hover:text-paper disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3 w-3 robo-spin" /> : <Icon className="h-3 w-3" />}
        Load {dir}
      </button>
    </div>
  );
}
