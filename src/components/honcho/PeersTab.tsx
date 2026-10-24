'use client';
import { useEffect, useState } from 'react';
import { BookUser, Copy, Eye, MessagesSquare, RefreshCw, Sparkles } from 'lucide-react';
import type { HonchoPage, HonchoPeer, HonchoPeerCard, HonchoRepresentation, HonchoSession, HonchoStats } from '@/types/honcho';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { fmtDate, fmtDateTime, peerColor, shortId, wsUrl } from './honcho-client';
import { useHonchoGet } from './useHoncho';
import { RichText } from './RichText';

interface Props {
  workspace: string;
  peer: HonchoPeer | null;
  peers: HonchoPeer[];
  stats: HonchoStats | null;
  onOpenSession: (sessionId: string) => void;
  onCopy: (text: string, what: string) => void;
}

export function PeersTab({ workspace, peer, peers, stats, onOpenSession, onCopy }: Props) {
  const [target, setTarget] = useState<string>(''); // '' = the peer's own (omniscient) view
  const [curateInput, setCurateInput] = useState('');
  const [curate, setCurate] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setTarget('');
    setCurateInput('');
    setCurate('');
  }, [peer?.id, workspace]);

  const pid = peer?.id ?? null;
  const card = useHonchoGet<HonchoPeerCard>(pid ? wsUrl(workspace, ['peers', pid, 'card'], { target }) : null, reload);
  const rep = useHonchoGet<HonchoRepresentation>(
    pid ? wsUrl(workspace, ['peers', pid, 'representation'], { target, q: curate }) : null,
    reload,
  );
  const sessions = useHonchoGet<HonchoPage<HonchoSession>>(pid ? wsUrl(workspace, ['peers', pid, 'sessions'], { size: 50 }) : null, reload);

  if (!peer) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <div>
          <BookUser className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-3 text-[13px] text-secondary">Pick a peer in the left rail to see its card and representation.</p>
        </div>
      </div>
    );
  }

  const st = stats?.peers[peer.id];
  const meta = Object.keys(peer.metadata ?? {}).length ? peer.metadata : null;
  const conf = Object.keys(peer.configuration ?? {}).length ? peer.configuration : null;
  const perspective = target ? `${peer.id} → ${target}` : `${peer.id} (self)`;

  return (
    <div className="hud-scroll min-h-0 flex-1 overflow-y-auto">
      {/* Header */}
      <div className="border-b border-subtle px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg text-[14px] font-bold text-obsidian" style={{ background: peerColor(peer.id) }}>
            {peer.id.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="selectable truncate text-[18px] font-bold text-paper">{peer.id}</h1>
            <div className="font-mono text-[10px] text-muted">
              since {fmtDate(peer.created_at)}
              {st && (
                <>
                  {' '}
                  · <span className="text-orange">{formatInt(st.messages ?? 0)}</span> messages · {formatInt(st.sessions)} sessions
                </>
              )}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
              <Eye className="h-3.5 w-3.5" /> Perspective
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-7 rounded-md border border-subtle bg-panel-elevated px-2 text-[11px] normal-case tracking-normal text-paper focus:border-orange/60 focus:outline-none"
              >
                <option value="">Honcho&apos;s view of {shortId(peer.id, 20)}</option>
                {peers
                  .filter((p) => p.id !== peer.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {shortId(peer.id, 14)} about {shortId(p.id, 20)}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              title="Reload"
              onClick={() => setReload((n) => n + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-subtle bg-panel-elevated text-muted hover:text-paper"
            >
              <RefreshCw className={cn('h-3 w-3', (card.loading || rep.loading) && 'robo-spin')} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Peer card */}
        <section className="hud-card flex min-h-[160px] flex-col p-4">
          <div className="mb-3 flex items-center gap-2">
            <BookUser className="h-3.5 w-3.5 text-orange" />
            <span className="hud-label">Peer card</span>
            <span className="font-mono text-[10px] text-muted">{perspective}</span>
            {card.data?.peer_card?.length ? (
              <button
                type="button"
                onClick={() => onCopy(card.data!.peer_card!.join('\n'), 'peer card')}
                className="ml-auto text-muted hover:text-paper"
                title="Copy card"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          {card.loading ? (
            <Skeleton lines={5} />
          ) : card.error ? (
            <ErrorLine text={card.error} />
          ) : card.data?.peer_card?.length ? (
            <ul className="selectable space-y-1.5">
              {card.data.peer_card.map((fact, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-secondary">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-orange/70" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{fact}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="No peer card yet — the deriver writes one after it has processed enough messages." />
          )}
        </section>

        {/* Representation */}
        <section className="hud-card flex min-h-[160px] flex-col p-4 xl:row-span-2">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-purple" />
            <span className="hud-label">Representation</span>
            <span className="font-mono text-[10px] text-muted">{perspective}</span>
            <form
              className="ml-auto flex items-center"
              onSubmit={(e) => {
                e.preventDefault();
                setCurate(curateInput.trim());
              }}
            >
              <input
                value={curateInput}
                onChange={(e) => setCurateInput(e.target.value)}
                placeholder="Curate around a topic…"
                className="h-7 w-48 rounded-l-md border border-subtle bg-panel-elevated px-2 text-[11px] text-paper placeholder:text-muted focus:border-purple/60 focus:outline-none"
              />
              <button type="submit" className="h-7 rounded-r-md border border-l-0 border-subtle bg-panel-elevated px-2 font-mono text-[9px] font-semibold uppercase text-secondary hover:text-paper">
                Go
              </button>
            </form>
          </div>
          {curate && (
            <button type="button" onClick={() => { setCurate(''); setCurateInput(''); }} className="mb-2 self-start rounded-full border border-purple/50 bg-purple/10 px-2 py-0.5 text-[10px] text-paper">
              curated: “{curate}” ×
            </button>
          )}
          {rep.loading ? (
            <Skeleton lines={10} />
          ) : rep.error ? (
            <ErrorLine text={rep.error} />
          ) : rep.data?.representation?.trim() ? (
            <RichText text={rep.data.representation} />
          ) : (
            <Empty text="Empty representation — no conclusions have been derived for this perspective yet." />
          )}
        </section>

        {/* Sessions + metadata */}
        <section className="hud-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <MessagesSquare className="h-3.5 w-3.5 text-teal" />
            <span className="hud-label">Sessions</span>
            <span className="ml-auto font-mono text-[10px] text-muted">{sessions.data ? formatInt(sessions.data.total) : ''}</span>
          </div>
          {sessions.loading ? (
            <Skeleton lines={4} />
          ) : sessions.error ? (
            <ErrorLine text={sessions.error} />
          ) : sessions.data?.items.length ? (
            <ul className="hud-scroll max-h-[320px] space-y-0.5 overflow-y-auto">
              {sessions.data.items.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onOpenSession(s.id)}
                    title={s.id}
                    className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-panel-hover"
                  >
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', s.is_active ? 'bg-green' : 'bg-highlight')} />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-secondary group-hover:text-paper">{s.id}</span>
                    {stats?.sessions[s.id] != null && <span className="font-mono text-[10px] text-muted">{stats.sessions[s.id]}</span>}
                    <span className="w-24 text-right font-mono text-[9.5px] text-muted">{fmtDate(s.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Not a member of any session." />
          )}
          {(meta || conf) && (
            <details className="mt-3 border-t border-subtle pt-2">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.08em] text-muted hover:text-secondary">
                Metadata &amp; configuration
              </summary>
              <pre className="selectable hud-scroll mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-obsidian p-2 font-mono text-[10.5px] text-secondary [overflow-wrap:anywhere]">
                {JSON.stringify({ metadata: meta ?? {}, configuration: conf ?? {} }, null, 2)}
              </pre>
            </details>
          )}
          <div className="mt-2 font-mono text-[9.5px] text-muted">created {fmtDateTime(peer.created_at)}</div>
        </section>
      </div>
    </div>
  );
}

export function Skeleton({ lines }: { lines: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-panel-elevated" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

export function ErrorLine({ text }: { text: string }) {
  return <div className="rounded-md border border-[#EF4444]/30 bg-[#EF4444]/5 px-3 py-2 font-mono text-[11px] text-[#F87171]">{text}</div>;
}

export function Empty({ text }: { text: string }) {
  return <div className="py-4 text-[12px] leading-relaxed text-muted">{text}</div>;
}
