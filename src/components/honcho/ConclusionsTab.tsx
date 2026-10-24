'use client';
import { useEffect, useState } from 'react';
import { Lightbulb, Loader2, Search, X } from 'lucide-react';
import type { HonchoConclusion, HonchoConclusionLevel, HonchoPage, HonchoPeer } from '@/types/honcho';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { fmtDateTime, hGet, hPost, isAbort, isOffline, peerColor, shortId, wsUrl } from './honcho-client';
import { useReportOffline } from './useHoncho';
import { Empty, ErrorLine, Skeleton } from './PeersTab';

interface Props {
  workspace: string;
  peers: HonchoPeer[];
  selectedPeer: string | null;
  onOpenSession: (sessionId: string) => void;
}

const LEVEL_STYLE: Record<HonchoConclusionLevel, string> = {
  explicit: 'border-teal/50 text-teal',
  deductive: 'border-purple/50 text-purple',
  inductive: 'border-amber/50 text-amber',
  contradiction: 'border-[#EF4444]/50 text-[#F87171]',
};
const LEVELS: HonchoConclusionLevel[] = ['explicit', 'deductive', 'inductive', 'contradiction'];
const PAGE = 50;

export function ConclusionsTab({ workspace, peers, selectedPeer, onOpenSession }: Props) {
  const reportOffline = useReportOffline();
  const [observer, setObserver] = useState(selectedPeer ?? '');
  const [observed, setObserved] = useState(selectedPeer ?? '');
  const [level, setLevel] = useState<string>('');
  const [items, setItems] = useState<HonchoConclusion[]>([]);
  /** null until the first page for the current filters resolves (never show a made-up 0). */
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [qInput, setQInput] = useState('');
  const [qResults, setQResults] = useState<HonchoConclusion[] | null>(null);
  const [qFor, setQFor] = useState('');
  const [querying, setQuerying] = useState(false);

  // Follow the rail's peer selection.
  useEffect(() => {
    if (!selectedPeer) return;
    setObserver(selectedPeer);
    setObserved(selectedPeer);
  }, [selectedPeer]);

  useEffect(() => {
    setPage(1);
  }, [observer, observed, level, workspace]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    hGet<HonchoPage<HonchoConclusion>>(
      wsUrl(workspace, ['conclusions'], { observer, observed, level, page, size: PAGE }),
      ac.signal,
    )
      .then((r) => {
        setItems((prev) => (page === 1 ? r.items : [...prev, ...r.items]));
        setTotal(r.total);
      })
      .catch((err) => {
        if (isAbort(err)) return;
        if (isOffline(err)) reportOffline((err as Error).message);
        setError((err as Error).message);
        if (page === 1) setTotal(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [workspace, observer, observed, level, page, reportOffline]);

  const canQuery = !!observer && !!observed && qInput.trim().length > 0;
  const runQuery = async () => {
    if (!canQuery) return;
    setQuerying(true);
    setError(null);
    try {
      const r = await hPost<HonchoConclusion[]>(wsUrl(workspace, ['conclusions', 'query']), {
        query: qInput.trim(),
        observer,
        observed,
        top_k: 30,
      });
      setQResults(r);
      setQFor(qInput.trim());
    } catch (err) {
      if (isOffline(err)) reportOffline((err as Error).message);
      setError((err as Error).message);
    } finally {
      setQuerying(false);
    }
  };

  const shown = qResults ?? items;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Controls */}
      <div className="shrink-0 space-y-2 border-b border-subtle px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <PeerSelect label="Observer" value={observer} onChange={setObserver} peers={peers} />
          <PeerSelect label="About" value={observed} onChange={setObserved} peers={peers} />
          <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
            Level
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="h-7 rounded-md border border-subtle bg-panel-elevated px-2 text-[11px] normal-case tracking-normal text-paper focus:outline-none"
            >
              <option value="">All</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <span className="ml-auto font-mono text-[10px] text-muted">
            {qResults
              ? `${qResults.length} semantic matches`
              : loading && page === 1
                ? 'counting…'
                : total == null
                  ? '— conclusions'
                  : `${formatInt(total)} conclusions`}
          </span>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void runQuery();
          }}
        >
          <label className="flex h-8 flex-1 items-center gap-2 rounded-full border border-subtle bg-panel-elevated px-3 focus-within:border-purple/60">
            <Search className="h-3.5 w-3.5 text-muted" />
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder={observer && observed ? `Semantic query over what ${shortId(observer, 18)} concluded about ${shortId(observed, 18)}…` : 'Pick an observer and a subject to run a semantic query'}
              className="min-w-0 flex-1 bg-transparent text-[12px] text-paper placeholder:text-muted focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={!canQuery || querying}
            className="flex h-8 items-center gap-1.5 rounded-full bg-purple px-3 font-mono text-[10px] font-semibold uppercase text-obsidian disabled:opacity-40"
          >
            {querying ? <Loader2 className="h-3.5 w-3.5 robo-spin" /> : <Lightbulb className="h-3.5 w-3.5" />} Query
          </button>
          {qResults && (
            <button
              type="button"
              onClick={() => {
                setQResults(null);
                setQInput('');
              }}
              className="flex h-8 items-center gap-1 rounded-full border border-purple/50 bg-purple/10 px-2.5 text-[10px] text-paper"
            >
              “{shortId(qFor, 24)}” <X className="h-3 w-3" />
            </button>
          )}
        </form>
      </div>

      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {error && <ErrorLine text={error} />}
        {loading && !items.length && !qResults ? (
          <Skeleton lines={10} />
        ) : !shown.length ? (
          <Empty text={qResults ? 'No conclusions matched that query.' : 'No conclusions for these filters yet. The deriver creates them from new messages.'} />
        ) : (
          <ul className="space-y-2">
            {shown.map((c) => (
              <li key={c.id} className="hud-card px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[9.5px] text-muted">
                  <span className={cn('rounded-full border px-1.5 py-px uppercase tracking-[0.06em]', LEVEL_STYLE[c.level] ?? 'border-subtle')}>{c.level}</span>
                  <PeerDot id={c.observer_id} />
                  <span>→</span>
                  <PeerDot id={c.observed_id} />
                  {c.times_derived > 1 && <span className="text-amber">×{c.times_derived}</span>}
                  {c.source_ids.length > 0 && <span>{c.source_ids.length} sources</span>}
                  <span className="ml-auto">{fmtDateTime(c.created_at)}</span>
                </div>
                <p className="selectable mt-1.5 text-[13px] leading-relaxed text-paper/90 [overflow-wrap:anywhere]">{c.content}</p>
                {c.session_id && (
                  <button
                    type="button"
                    onClick={() => onOpenSession(c.session_id!)}
                    className="mt-1 font-mono text-[10px] text-orange hover:underline"
                    title={c.session_id}
                  >
                    session {shortId(c.session_id, 40)} →
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!qResults && total != null && items.length < total && (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              disabled={loading}
              onClick={() => setPage((p) => p + 1)}
              className="flex items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-secondary hover:text-paper disabled:opacity-60"
            >
              {loading && <Loader2 className="h-3 w-3 robo-spin" />} Load more ({formatInt(total - items.length)})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PeerDot({ id }: { id: string }) {
  return (
    <span className="flex items-center gap-1 text-secondary" title={id}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: peerColor(id) }} />
      {shortId(id, 22)}
    </span>
  );
}

function PeerSelect({ label, value, onChange, peers }: { label: string; value: string; onChange: (v: string) => void; peers: HonchoPeer[] }) {
  return (
    <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 max-w-[180px] rounded-md border border-subtle bg-panel-elevated px-2 text-[11px] normal-case tracking-normal text-paper focus:outline-none"
      >
        <option value="">Any</option>
        {peers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id}
          </option>
        ))}
      </select>
    </label>
  );
}
