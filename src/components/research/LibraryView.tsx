'use client';
// Library: ranked search over every file in the research roots, joined to Voltamachine Stage A.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileText, Orbit, Search, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { api, fmtDate, isBuilding, qs } from './research-client';
import { ActionBadge, Building, chip, ContradictionChip, CopyButton, ErrorNote, field, NoveltyChip, smallBtn, StorageBadge } from './ui';
import { fmtBytes, tagKey, type Facets, type LibraryRow, type SearchResponse } from './types';

interface Filters {
  q: string;
  root: string;
  folder: string;
  kind: string;
  storage: string;
  tag: string;
  minNovelty: string;
  escalate: boolean;
  contradiction: boolean;
  indexed: boolean;
  rerank: boolean;
  /** Phase 2 hybrid ranking (on by default; falls back to plain matching when there is no index). */
  semantic: boolean;
  sort: string;
}
const EMPTY: Filters = { q: '', root: '', folder: '', kind: '', storage: '', tag: '', minNovelty: '', escalate: false, contradiction: false, indexed: false, rerank: false, semantic: true, sort: '' };
const PAGE = 50;
const STORAGES = [
  { id: '', label: 'All' },
  { id: 'local', label: 'Local' },
  { id: 'icloud', label: 'In iCloud' },
  { id: 'external', label: 'Voltamachina only' },
];
const FILTER_KEY = 'volta:research:filters';

function loadFilters(): Filters {
  try {
    const raw = window.localStorage.getItem(FILTER_KEY);
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<Filters>), q: '' };
  } catch {
    // storage unavailable
  }
  return EMPTY;
}

function Toggle({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={cn('flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors', on ? 'border-orange bg-orange/10 text-paper' : 'border-subtle text-secondary hover:border-highlight hover:text-paper')}
    >
      {children}
    </button>
  );
}

function Row({ r, active, onOpen, onCopied, onTag }: { r: LibraryRow; active: boolean; onOpen: () => void; onCopied: (ok: boolean, what: string) => void; onTag: (t: string) => void }) {
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}
        className={cn('group cursor-pointer rounded-lg border bg-panel px-3.5 py-3 transition-colors hover:border-highlight', active ? 'border-orange/60' : 'border-subtle')}
      >
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-[14px] font-semibold leading-snug text-paper">{r.title}</h3>
              <StorageBadge storage={r.storage} />
              <span className={chip}>{r.ext || r.kind}</span>
              <NoveltyChip value={r.novelty} />
              <ActionBadge action={r.action} />
              {r.contradiction && <ContradictionChip />}
              {r.obsidian && (
                <a
                  href={r.obsidian}
                  onClick={(e) => e.stopPropagation()}
                  title={`${r.vaultNotes} Obsidian note${r.vaultNotes === 1 ? '' : 's'} mention this`}
                  className={cn(chip, 'inline-flex items-center gap-1 border-purple/50 text-purple hover:text-paper')}
                >
                  <ExternalLink className="h-3 w-3" /> Obsidian{r.vaultNotes > 1 ? ` ×${r.vaultNotes}` : ''}
                </a>
              )}
            </div>
            <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted" title={r.path}>
              {r.rootLabel} / {r.rel}
              {r.size > 0 && <span> · {fmtBytes(r.size)}</span>}
              {r.mtime > 0 && <span> · {fmtDate(r.mtime)}</span>}
            </p>
            {r.summary && <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-secondary">{r.summary}</p>}
            {r.tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {r.tags.slice(0, 5).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTag(t);
                    }}
                    className={cn(chip, 'hover:border-highlight hover:text-paper')}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            {r.brctl && (
              <p className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded border border-amber/30 bg-amber/5 px-2 py-1 font-mono text-[10.5px] text-amber" title={r.brctl}>
                  {r.brctl}
                </code>
                <CopyButton text={r.brctl} label="Copy" title="Copy the brctl download command (run it yourself in a terminal)" onCopied={onCopied} />
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <CopyButton text={r.path} label="Open in Finder path" title={`Copy the path: ${r.path}`} onCopied={onCopied} />
            {r.mirror?.exists && r.storage !== 'local' && <CopyButton text={r.mirror.path} label="Voltamachina copy" title={`A local copy exists: ${r.mirror.path}`} onCopied={onCopied} className="border-green/40 text-green" />}
          </div>
        </div>
      </div>
    </li>
  );
}

export function LibraryView({ activeId, onOpen, onCopied, onMeta }: { activeId: string | null; onOpen: (id: string) => void; onCopied: (ok: boolean, what: string) => void; onMeta?: (f: Facets, inv: SearchResponse['inventory']) => void }) {
  const [f, setF] = useState<Filters>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [debounced, setDebounced] = useState('');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [building, setBuilding] = useState<{ files: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setF(loadFilters());
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(FILTER_KEY, JSON.stringify({ ...f, q: '' }));
    } catch {
      // storage unavailable
    }
  }, [f, hydrated]);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(f.q.trim()), 220);
    return () => window.clearTimeout(t);
  }, [f.q]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const params = useMemo(
    () => ({
      q: debounced,
      root: f.root,
      folder: f.folder,
      kind: f.kind,
      storage: f.storage,
      tag: f.tag,
      minNovelty: f.minNovelty,
      escalate: f.escalate,
      contradiction: f.contradiction,
      indexed: f.indexed,
      rerank: f.rerank && !!debounced,
      semantic: f.semantic && !!debounced,
      sort: f.sort,
    }),
    [debounced, f.root, f.folder, f.kind, f.storage, f.tag, f.minNovelty, f.escalate, f.contradiction, f.indexed, f.rerank, f.semantic, f.sort],
  );

  const run = useCallback(
    async (offset: number, signal?: AbortSignal) => {
      const res = await api<SearchResponse | { building: true; inventory: { files: number } }>(`/api/research/search${qs({ ...params, limit: PAGE, offset })}`, signal);
      if (isBuilding(res)) {
        setBuilding({ files: (res as unknown as { inventory: { files: number } }).inventory.files });
        return null;
      }
      setBuilding(null);
      return res;
    },
    [params],
  );

  useEffect(() => {
    if (!hydrated) return;
    const ac = new AbortController();
    let retry: number | undefined;
    const go = () => {
      setLoading(true);
      run(0, ac.signal)
        .then((res) => {
          if (!res) {
            retry = window.setTimeout(go, 2500);
            return;
          }
          setData(res);
          setRows(res.rows);
          setFacets(res.facets);
          onMeta?.(res.facets, res.inventory);
          setError(null);
        })
        .catch((e: Error) => {
          if (e.name !== 'AbortError') setError(e.message);
        })
        .finally(() => setLoading(false));
    };
    go();
    return () => {
      ac.abort();
      window.clearTimeout(retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, hydrated]);

  const more = async () => {
    try {
      const res = await run(rows.length);
      if (res) setRows((r) => [...r, ...res.rows]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const set = (p: Partial<Filters>) => setF((x) => ({ ...x, ...p }));
  const folderOptions = useMemo(() => (facets?.folders ?? []).filter((x) => !f.root || x.root === f.root).slice(0, 80), [facets, f.root]);
  const active = f.root || f.folder || f.kind || f.storage || f.tag || f.minNovelty || f.escalate || f.contradiction || f.indexed;
  const counts = (key: string) => facets?.storage.find((s) => s.key === key)?.count;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b border-subtle px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex min-w-[260px] flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted" />
            <input
              ref={searchRef}
              value={f.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="Find a file, paper, idea or tag   ( / )"
              aria-label="Search the research library"
              className="h-9 w-full rounded-full border border-subtle bg-panel pl-9 pr-3 text-[13px] text-paper placeholder:text-muted focus:border-orange/60 focus:outline-none"
            />
          </label>
          <nav className="flex flex-wrap gap-1" aria-label="Where the file is">
            {STORAGES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => set({ storage: s.id })}
                className={cn('flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors', f.storage === s.id ? 'border-orange bg-orange/10 text-paper' : 'border-transparent text-secondary hover:border-subtle hover:text-paper')}
              >
                {s.label}
                {s.id && counts(s.id) !== undefined && <span className="rounded-full bg-panel-elevated px-1.5 font-mono text-[10px] text-muted">{counts(s.id)?.toLocaleString()}</span>}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={f.root} onChange={(e) => set({ root: e.target.value, folder: '' })} className={field} aria-label="Root">
            <option value="">All roots</option>
            {facets?.roots.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label} ({r.count.toLocaleString()})
              </option>
            ))}
          </select>
          <select value={f.folder} onChange={(e) => set({ folder: e.target.value })} className={cn(field, 'max-w-[230px]')} aria-label="Folder">
            <option value="">All folders</option>
            {folderOptions.map((x) => (
              <option key={`${x.root}/${x.key}`} value={x.key}>
                {f.root ? '' : `${x.root} / `}
                {x.label} ({x.count})
              </option>
            ))}
          </select>
          <select value={f.kind} onChange={(e) => set({ kind: e.target.value })} className={field} aria-label="Type">
            <option value="">Any type</option>
            {facets?.kinds.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label} ({k.count.toLocaleString()})
              </option>
            ))}
          </select>
          <select value={f.tag} onChange={(e) => set({ tag: e.target.value })} className={cn(field, 'max-w-[190px]')} aria-label="Domain tag">
            <option value="">Any domain tag</option>
            {facets?.tags.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label} ({t.count})
              </option>
            ))}
          </select>
          <select value={f.minNovelty} onChange={(e) => set({ minNovelty: e.target.value })} className={field} aria-label="Minimum novelty">
            <option value="">Novelty: any</option>
            {['0.5', '0.7', '0.8', '0.9'].map((v) => (
              <option key={v} value={v}>
                Novelty ≥ {v}
              </option>
            ))}
          </select>
          <Toggle on={f.escalate} onClick={() => set({ escalate: !f.escalate })} title="Stage A recommended action is escalate">
            Escalate
          </Toggle>
          <Toggle on={f.contradiction} onClick={() => set({ contradiction: !f.contradiction })}>
            Has contradiction
          </Toggle>
          <Toggle on={f.indexed} onClick={() => set({ indexed: !f.indexed })} title="Only files Voltamachine Stage A has summarised">
            Indexed
          </Toggle>
          <Toggle on={f.semantic} onClick={() => set({ semantic: !f.semantic })} title="Phase 2: rank by meaning as well as words (local embeddings, nothing leaves this Mac). Finds close matches that share no words with the query.">
            <Orbit className="h-3 w-3" /> Semantic
          </Toggle>
          <Toggle on={f.rerank} onClick={() => set({ rerank: !f.rerank })} title="Re-rank the top 30 matches with JEV (sends their titles, tags and summaries to TypeSafe). Falls back to the plain order if JEV is unavailable.">
            <Sparkles className="h-3 w-3" /> JEV re-rank
          </Toggle>
          <label className="ml-auto flex items-center gap-1.5">
            <span className="hud-label">Sort</span>
            <select value={f.sort} onChange={(e) => set({ sort: e.target.value })} className={field} aria-label="Sort">
              <option value="">{debounced ? 'Best match' : 'Recent'}</option>
              <option value="recent">Recent</option>
              <option value="novelty">Novelty</option>
              <option value="name">Title</option>
              <option value="size">Size</option>
            </select>
          </label>
          {active && (
            <button type="button" onClick={() => setF((x) => ({ ...EMPTY, q: x.q }))} className={smallBtn}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      <main className="hud-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-3">
        {building && <Building files={building.files} />}
        {error && <ErrorNote>{error}</ErrorNote>}
        {data && (
          <p className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted">
            <span>
              {data.total.toLocaleString()} result{data.total === 1 ? '' : 's'}
              {debounced ? ` for "${debounced}"` : ''}
            </span>
            {data.semantic === 'on' && <span className="text-teal">ranked by meaning + words</span>}
            {data.semantic === 'unavailable' && <span title="No Phase 2 index yet, or the embedding server did not answer in time">semantic unavailable, words only</span>}
            {data.rerank === 'jev' && <span className="text-purple">top 30 re-ranked by JEV</span>}
            {data.rerank === 'fallback' && <span>JEV unavailable, plain order</span>}
            {loading && <span className="text-orange">searching...</span>}
          </p>
        )}
        {data && rows.length === 0 && !loading && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="font-doto text-4xl text-orange">0</p>
            <p className="text-secondary">Nothing matches. Try fewer words or clear the filters.</p>
          </div>
        )}
        <ul className="space-y-2">
          {rows.map((r) => (
            <Row key={r.id} r={r} active={activeId === r.id} onOpen={() => onOpen(r.id)} onCopied={onCopied} onTag={(t) => set({ tag: tagKey(t) })} />
          ))}
        </ul>
        {data && rows.length < data.total && (
          <div className="mt-4 flex justify-center">
            <button type="button" onClick={() => void more()} className={smallBtn}>
              Show {Math.min(PAGE, data.total - rows.length)} more ({(data.total - rows.length).toLocaleString()} left)
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
