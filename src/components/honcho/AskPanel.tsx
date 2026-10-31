'use client';
import { useEffect, useRef, useState } from 'react';
import { Copy, CornerDownLeft, Loader2, MessageCircleQuestion, Square, Trash2, X } from 'lucide-react';
import { HONCHO_REASONING_LEVELS, type HonchoChatResponse, type HonchoPeer, type HonchoReasoningLevel } from '@/types/honcho';
import { cn } from '@/lib/cn';
import { HonchoClientError, hPost, isAbort, isOffline, peerColor, shortId, wsUrl } from './honcho-client';
import { useReportOffline } from './useHoncho';
import { RichText } from './RichText';

interface Turn {
  id: number;
  query: string;
  label: string;
  answer: string | null;
  error: string | null;
  elapsedMs: number | null;
  streaming?: boolean;
}

/** Reads the proxy's SSE stream (`data: {delta}` … `data: {done,elapsedMs}` / `{error}`), calling onDelta per chunk. */
async function streamAnswer(url: string, body: unknown, signal: AbortSignal, onDelta: (t: string) => void): Promise<number | null> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    cache: 'no-store',
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string; offline?: boolean; url?: string };
    throw new HonchoClientError(e.error ?? `HTTP ${res.status}`, res.status, !!e.offline, e.url ?? null);
  }
  if (!res.body || !/text\/event-stream/i.test(res.headers.get('content-type') ?? '')) throw new Error('not a stream');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let elapsed: number | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (!raw.startsWith('data:')) continue;
      const ev = JSON.parse(raw.slice(5).trim()) as { delta?: string; done?: boolean; elapsedMs?: number; error?: string };
      if (ev.error) throw new HonchoClientError(ev.error, 502);
      if (ev.delta) onDelta(ev.delta);
      if (ev.done) elapsed = ev.elapsedMs ?? null;
    }
  }
  return elapsed;
}

interface Props {
  workspace: string;
  peers: HonchoPeer[];
  selectedPeer: string | null;
  session: string | null;
  onCopy: (text: string, what: string) => void;
  className?: string;
  /** Phones show the panel as a full-screen sheet; this renders its close button there. */
  onClose?: () => void;
}

export function AskPanel({ workspace, peers, selectedPeer, session, onCopy, className, onClose }: Props) {
  const reportOffline = useReportOffline();
  const [mode, setMode] = useState<'peer' | 'workspace'>('peer');
  const [target, setTarget] = useState('');
  const [scopeSession, setScopeSession] = useState(false);
  const [level, setLevel] = useState<HonchoReasoningLevel>('low');
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => setTarget(''), [selectedPeer]);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Elapsed counter while waiting (ticks in an effect, never during render).
  useEffect(() => {
    if (pending == null) return;
    const t0 = performance.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed(Math.floor((performance.now() - t0) / 1000)), 500);
    return () => clearInterval(t);
  }, [pending]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, pending]);

  const peerMode = mode === 'peer' && !!selectedPeer;
  const label = peerMode
    ? `${shortId(selectedPeer!, 18)}${target ? ` about ${shortId(target, 18)}` : ''}`
    : 'workspace';

  const ask = async () => {
    const query = input.trim();
    if (!query || pending != null) return;
    const id = nextId.current++;
    const ac = new AbortController();
    abortRef.current = ac;
    setTurns((t) => [...t, { id, query, label, answer: null, error: null, elapsedMs: null }]);
    setInput('');
    setPending(id);
    const payload = {
      query,
      peer: peerMode ? selectedPeer : undefined,
      target: peerMode && target ? target : undefined,
      session: scopeSession && session ? session : undefined,
      reasoning_level: level,
    };
    const t0 = performance.now();
    const patch = (f: (x: Turn) => Turn) => setTurns((t) => t.map((x) => (x.id === id ? f(x) : x)));
    try {
      let got = false;
      try {
        const ms = await streamAnswer(wsUrl(workspace, ['chat']), { ...payload, stream: true }, ac.signal, (d) => {
          got = true;
          patch((x) => ({ ...x, answer: (x.answer ?? '') + d, streaming: true }));
        });
        patch((x) => ({ ...x, answer: x.answer ?? '', streaming: false, elapsedMs: ms ?? Math.round(performance.now() - t0) }));
      } catch (err) {
        // Real HTTP/API errors and cancels surface as-is; only a broken stream falls back to the JSON path.
        if (isAbort(err) || err instanceof HonchoClientError) {
          if (got && !isAbort(err)) patch((x) => ({ ...x, streaming: false }));
          throw err;
        }
        if (got) throw err;
        const r = await hPost<HonchoChatResponse>(wsUrl(workspace, ['chat']), payload, ac.signal);
        patch((x) => ({ ...x, answer: r.content ?? '', elapsedMs: r.elapsedMs }));
      }
    } catch (err) {
      if (isOffline(err)) reportOffline((err as Error).message);
      const msg = isAbort(err) ? 'Cancelled' : (err as Error).message;
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: msg, streaming: false } : x)));
    } finally {
      setPending(null);
      abortRef.current = null;
    }
  };

  return (
    <aside className={cn('flex w-[340px] shrink-0 flex-col border-l border-subtle bg-panel/40', className)}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-subtle px-3">
        <MessageCircleQuestion className="h-3.5 w-3.5 text-orange" />
        <span className="hud-label">Ask Honcho</span>
        {turns.length > 0 && pending == null && (
          <button type="button" onClick={() => setTurns([])} className="ml-auto text-muted hover:text-paper" title="Clear conversation">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close Ask Honcho" className={cn('rounded-full border border-subtle p-2 text-muted hover:text-paper md:hidden', !(turns.length > 0 && pending == null) && 'ml-auto')}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Options */}
      <div className="shrink-0 space-y-2 border-b border-subtle p-3">
        <div className="flex rounded-full border border-subtle bg-panel-elevated p-0.5">
          {(['peer', 'workspace'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={m === 'peer' && !selectedPeer}
              onClick={() => setMode(m)}
              className={cn(
                'flex-1 truncate rounded-full px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] disabled:opacity-40',
                (m === 'peer' ? peerMode : !peerMode) ? 'bg-orange text-obsidian' : 'text-muted hover:text-paper',
              )}
            >
              {m === 'peer' ? `As ${selectedPeer ? shortId(selectedPeer, 14) : 'peer'}` : 'Whole workspace'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {peerMode && (
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              title="Ask about another peer from this peer's perspective"
              className="h-7 min-w-0 flex-1 rounded-md border border-subtle bg-panel-elevated px-2 text-[11px] text-paper focus:outline-none"
            >
              <option value="">About itself</option>
              {peers
                .filter((p) => p.id !== selectedPeer)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    About {p.id}
                  </option>
                ))}
            </select>
          )}
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as HonchoReasoningLevel)}
            title="Reasoning level (higher = slower)"
            className={cn('h-7 rounded-md border border-subtle bg-panel-elevated px-2 text-[11px] text-paper focus:outline-none', !peerMode && 'flex-1')}
          >
            {HONCHO_REASONING_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <label className={cn('flex items-center gap-2 text-[11px]', session ? 'text-secondary' : 'text-muted opacity-50')}>
          <input type="checkbox" disabled={!session} checked={scopeSession && !!session} onChange={(e) => setScopeSession(e.target.checked)} className="accent-[#FF5500]" />
          <span className="truncate">Limit to session {session ? shortId(session, 26) : '(open one first)'}</span>
        </label>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="hud-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {!turns.length && (
          <div className="pt-6 text-center text-[12px] leading-relaxed text-muted">
            Ask in natural language. Honcho&apos;s dialectic agent reasons over conclusions and messages, so answers can take a while at higher
            reasoning levels.
          </div>
        )}
        {turns.map((t) => (
          <div key={t.id} className="space-y-1.5">
            <div className="ml-6 rounded-xl rounded-tr-sm border border-orange/30 bg-orange/10 px-3 py-2 text-[12.5px] text-paper">
              <div className="selectable whitespace-pre-wrap">{t.query}</div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted">{t.label}</div>
            </div>
            <div className="mr-2 rounded-xl rounded-tl-sm border border-subtle bg-panel px-3 py-2">
              {t.error ? (
                <>
                  {t.answer && <RichText text={t.answer} className="text-[12.5px]" />}
                  <div className={cn('font-mono text-[11px]', t.answer && 'mt-1.5', t.error === 'Cancelled' ? 'text-muted' : 'text-[#F87171]')}>
                    {t.error}
                    {t.answer ? ' (partial answer)' : ''}
                  </div>
                </>
              ) : t.answer == null ? (
                <div className="flex items-center gap-2 font-mono text-[10.5px] text-secondary">
                  <Loader2 className="h-3.5 w-3.5 robo-spin text-orange" /> Thinking… {elapsed}s
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className="ml-auto flex items-center gap-1 rounded-full border border-subtle px-2 py-0.5 text-[9px] uppercase text-muted hover:text-paper"
                  >
                    <Square className="h-2.5 w-2.5" /> Stop
                  </button>
                </div>
              ) : t.answer ? (
                <>
                  <RichText text={t.answer} className="text-[12.5px]" />
                  <div className="mt-1.5 flex items-center gap-2 font-mono text-[9px] text-muted">
                    {t.streaming ? (
                      <>
                        <Loader2 className="h-3 w-3 robo-spin text-orange" /> {elapsed}s
                        <button
                          type="button"
                          onClick={() => abortRef.current?.abort()}
                          className="flex items-center gap-1 rounded-full border border-subtle px-2 py-0.5 text-[9px] uppercase text-muted hover:text-paper"
                        >
                          <Square className="h-2.5 w-2.5" /> Stop
                        </button>
                      </>
                    ) : (
                      t.elapsedMs != null && `${(t.elapsedMs / 1000).toFixed(1)}s`
                    )}
                    <button type="button" disabled={t.streaming} onClick={() => onCopy(t.answer!, 'answer')} className="ml-auto disabled:opacity-40 hover:text-paper" title="Copy answer">
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-[12px] text-muted">Honcho returned an empty answer.</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form
        className="shrink-0 border-t border-subtle p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <div className="rounded-lg border border-subtle bg-panel-elevated focus-within:border-orange/60">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask();
              }
            }}
            rows={3}
            maxLength={10000}
            placeholder={peerMode ? `What does Honcho know about ${target || selectedPeer}?` : 'Ask the whole workspace…'}
            className="block w-full resize-none bg-transparent px-3 py-2 text-[12.5px] text-paper placeholder:text-muted focus:outline-none"
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            {peerMode && <span className="h-1.5 w-1.5 rounded-full" style={{ background: peerColor(selectedPeer!) }} />}
            <span className="truncate font-mono text-[9px] uppercase tracking-[0.08em] text-muted">{label} · {level}</span>
            <button
              type="submit"
              disabled={!input.trim() || pending != null}
              className="ml-auto flex items-center gap-1 rounded-full bg-orange px-2.5 py-1 font-mono text-[9.5px] font-semibold uppercase text-obsidian disabled:opacity-40"
            >
              Ask <CornerDownLeft className="h-3 w-3" />
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
}
