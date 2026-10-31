'use client';
// Threads: what connects the folders. Graphify clusters, the Stage A cross-domain network, folder bridges and the highlights list.
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Network, Sparkles, Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ForceGraph, linkKey, type FGLink, type FGNode } from './ForceGraph';
import { api, isBuilding } from './research-client';
import { ActionBadge, Building, chip, ContradictionChip, ErrorNote, field, Loading, Notice, NoveltyChip, Section, smallBtn, StorageBadge } from './ui';
import type { DomainLink, GraphData, SemanticCluster, SemanticThreadsResponse, ThreadCluster, ThreadsResponse } from './types';

type Sub = 'semantic' | 'clusters' | 'network' | 'bridges' | 'highlights';
const SUBS: { id: Sub; label: string; icon: typeof Network }[] = [
  { id: 'semantic', label: 'Semantic', icon: Sparkles },
  { id: 'clusters', label: 'Graph clusters', icon: Network },
  { id: 'network', label: 'Cross-domain network', icon: ArrowLeftRight },
  { id: 'bridges', label: 'Folder bridges', icon: ArrowLeftRight },
  { id: 'highlights', label: 'Highlights', icon: Star },
];
const PALETTE = ['#FF5500', '#22C55E', '#38BDF8', '#A78BFA', '#F59E0B', '#14B8A6', '#F472B6', '#94A3B8', '#EAB308', '#60A5FA'];
const colorOf = (c: number) => PALETTE[Math.abs(c) % PALETTE.length];

function noveltyColor(v: number): string {
  // low novelty = cool grey-blue, high = orange
  const t = Math.max(0, Math.min(1, (v - 0.4) / 0.5));
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(110, 255)},${lerp(140, 85)},${lerp(180, 0)})`;
}

// ───────────────────────── clusters ─────────────────────────

function ClusterGraph({ graph, community }: { graph: string; community: number }) {
  const [g, setG] = useState<GraphData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    setG(null);
    setErr(null);
    api<GraphData>(`/api/research/graph?source=${graph}&community=${community}&max=90&edges=260`, ac.signal)
      .then(setG)
      .catch((e: Error) => e.name !== 'AbortError' && setErr(e.message));
    return () => ac.abort();
  }, [graph, community]);
  const { nodes, links } = useMemo(() => {
    if (!g) return { nodes: [] as FGNode[], links: [] as FGLink[] };
    return {
      nodes: g.nodes.map((n) => ({ id: n.id, label: n.label, r: n.c === community ? 6 + Math.min(10, n.deg * 1.4) : 5, color: n.c === community ? '#FF5500' : '#64748B', group: n.c })),
      links: g.edges.map((e) => ({ source: e.s, target: e.t, w: 1, dashed: e.conf !== 'EXTRACTED' })),
    };
  }, [g, community]);
  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!g) return <Loading />;
  const picked = sel ? g.nodes.find((n) => n.id === sel) : null;
  return (
    <div>
      <ForceGraph nodes={nodes} links={links} selectedId={sel} onSelectNode={setSel} height={380} labelAll charge={-90} />
      <p className="mt-1.5 font-mono text-[10px] text-muted">
        {g.sampled.nodes} of {g.totals.nodes.toLocaleString()} nodes · orange = this cluster, grey = neighbours in other clusters · dashed = inferred link
        {picked && <span className="text-paper"> · {picked.label} ({g.communities.find((c) => c.id === picked.c)?.name ?? picked.c})</span>}
      </p>
    </div>
  );
}

function ClusterCard({ c, open, onToggle, onOpenDoc }: { c: ThreadCluster; open: boolean; onToggle: () => void; onOpenDoc: (id: string) => void }) {
  return (
    <li className={cn('rounded-lg border bg-panel px-3.5 py-3', open ? 'border-orange/50' : 'border-subtle')}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 text-left">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(c.id) }} />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold leading-snug text-paper">{c.name}</span>
          <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.05em] text-muted">
            {c.size} concepts · {c.members.length}+ {c.graph === 'voltamachine' ? 'papers' : 'sources'} · {c.bridges} bridge{c.bridges === 1 ? '' : 's'} out
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1">
            {c.concepts.slice(0, open ? 6 : 3).map((t) => (
              <span key={t} className={chip}>
                {t}
              </span>
            ))}
          </span>
          {c.folders.length > 0 && (
            <span className="mt-1.5 block font-mono text-[10px] text-secondary">
              {c.folders.map((f) => f.replace(/^\d+-/, '').replace(/_/g, ' ')).join(' · ')}
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-subtle pt-3">
          <ul className="space-y-1">
            {c.members.map((m) => (
              <li key={`${m.sid ?? m.label}`} className="flex items-baseline gap-2 text-[12.5px]">
                {m.rowId ? (
                  <button type="button" onClick={() => onOpenDoc(m.rowId!)} className="min-w-0 truncate text-left text-paper hover:text-orange">
                    {m.label}
                  </button>
                ) : (
                  <span className="min-w-0 truncate text-secondary">{m.label}</span>
                )}
                <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-muted">
                  {m.novelty !== null && m.novelty !== undefined && <span>n {m.novelty.toFixed(2)}</span>}
                  {m.action === 'escalate' && <span className="text-orange">escalate</span>}
                  <span>×{m.count}</span>
                </span>
              </li>
            ))}
          </ul>
          <ClusterGraph graph={c.graph} community={c.id} />
        </div>
      )}
    </li>
  );
}

function Clusters({ data, onOpenDoc }: { data: ThreadsResponse; onOpenDoc: (id: string) => void }) {
  const [graph, setGraph] = useState(data.clusterTotals[0]?.graph ?? 'voltamachine');
  const [q, setQ] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const list = data.clusters.filter((c) => c.graph === graph && (!q || `${c.name} ${c.concepts.join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  const total = data.clusterTotals.find((t) => t.graph === graph);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {data.clusterTotals.map((t) => (
          <button
            key={t.graph}
            type="button"
            onClick={() => {
              setGraph(t.graph);
              setOpenKey(null);
            }}
            className={cn('flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium', graph === t.graph ? 'border-orange bg-orange/10 text-paper' : 'border-transparent text-secondary hover:border-subtle hover:text-paper')}
          >
            {t.label}
            <span className="rounded-full bg-panel-elevated px-1.5 font-mono text-[10px] text-muted">{t.communities}</span>
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter clusters" aria-label="Filter clusters" className={cn(field, 'w-56 placeholder:text-muted')} />
        {total && <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.05em] text-muted">largest {total.shown} of {total.communities} communities</span>}
      </div>
      <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {list.map((c) => {
          const key = `${c.graph}:${c.id}`;
          return <ClusterCard key={key} c={c} open={openKey === key} onToggle={() => setOpenKey(openKey === key ? null : key)} onOpenDoc={onOpenDoc} />;
        })}
      </ul>
      {list.length === 0 && <p className="py-10 text-center text-secondary">No cluster matches.</p>}
    </div>
  );
}

// ───────────────────────── semantic (Phase 2) ─────────────────────────

const niceFolder = (f: string) => f.replace(/^\d+[-_ ]/, '').replace(/_/g, ' ') || '(top level)';
type SemSort = 'spread' | 'size' | 'cohesion';

function SemanticCard({ c, open, onToggle, onOpenDoc }: { c: SemanticCluster; open: boolean; onToggle: () => void; onOpenDoc: (id: string) => void }) {
  return (
    <li className={cn('rounded-lg border bg-panel px-3.5 py-3', open ? 'border-orange/50' : 'border-subtle')}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 text-left">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(c.id) }} />
        <span className="min-w-0 flex-1">
          <span className={cn('block text-[14px] font-semibold leading-snug', c.named ? 'text-paper' : 'text-secondary')}>{c.name}</span>
          <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.05em] text-muted">
            {c.size} docs · spans {c.spread} folders · cohesion {c.cohesion.toFixed(2)}
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1">
            {c.roots.map((r) => (
              <span key={r.key} className={chip}>
                {r.label} {r.count}
              </span>
            ))}
          </span>
          {c.named && c.terms.length > 0 && <span className="mt-1.5 block font-mono text-[10px] text-secondary">{c.terms.join(' · ')}</span>}
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-subtle pt-3">
          <div>
            <p className="hud-label mb-1 !text-[9.5px]">Folders</p>
            <ul className="flex flex-wrap gap-1">
              {c.folders.map((f) => (
                <li key={`${f.root}/${f.folder}`} className={chip}>
                  {niceFolder(f.folder)} {f.count}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="hud-label mb-1 !text-[9.5px]">Closest to the centre</p>
            <ul className="space-y-1">
              {c.members.map((m) => (
                <li key={m.id} className="flex items-baseline gap-2 text-[12.5px]">
                  <button type="button" onClick={() => onOpenDoc(m.id)} className="min-w-0 truncate text-left text-paper hover:text-orange">
                    {m.title}
                  </button>
                  <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-muted">
                    <span>{niceFolder(m.folder)}</span>
                    {m.novelty !== null && <span>n {m.novelty.toFixed(2)}</span>}
                    {m.storage === 'icloud' && <span className="text-amber">iCloud</span>}
                    <span>{m.sim.toFixed(2)}</span>
                  </span>
                </li>
              ))}
            </ul>
            {c.size > c.members.length && <p className="mt-1 font-mono text-[10px] text-muted">+{c.size - c.members.length} more</p>}
          </div>
        </div>
      )}
    </li>
  );
}

function Semantic({ onOpenDoc }: { onOpenDoc: (id: string) => void }) {
  const [data, setData] = useState<SemanticThreadsResponse | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SemSort>('spread');
  const [openId, setOpenId] = useState<number | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    api<{ threads: SemanticThreadsResponse | null }>('/api/research/phase2?view=threads', ac.signal)
      .then((d) => setData(d.threads))
      .catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
    return () => ac.abort();
  }, []);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (data === undefined) return <Loading>Reading the embedding clusters...</Loading>;
  if (data === null) return <Notice tone="orange">The Phase 2 index is not built yet. Build it from the Status tab (about two minutes; nothing is downloaded from iCloud).</Notice>;
  const needle = q.toLowerCase();
  const list = data.clusters
    .filter((c) => !needle || `${c.name} ${c.terms.join(' ')} ${c.members.map((m) => m.title).join(' ')}`.toLowerCase().includes(needle))
    .sort((a, b) => (sort === 'size' ? b.size - a.size : sort === 'cohesion' ? b.cohesion - a.cohesion : b.spread - a.spread || b.size - a.size));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter threads" aria-label="Filter semantic threads" className={cn(field, 'w-56 placeholder:text-muted')} />
        <label className="flex items-center gap-1.5">
          <span className="hud-label">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SemSort)} className={field} aria-label="Sort threads">
            <option value="spread">Crosses most folders</option>
            <option value="size">Largest</option>
            <option value="cohesion">Tightest</option>
          </select>
        </label>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.05em] text-muted">
          {data.clusters.length} threads · {data.docs.toLocaleString()} docs · built {data.builtAt.slice(0, 10)}
        </span>
      </div>
      <p className="mb-3 max-w-3xl text-[12.5px] leading-relaxed text-secondary">
        Every file grouped by meaning (Phase 2 embeddings of titles, folders, Stage A summaries and local text), whatever folder it was filed in. Spread is the effective number of folders a thread draws from.
      </p>
      <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {list.map((c) => (
          <SemanticCard key={c.id} c={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} onOpenDoc={onOpenDoc} />
        ))}
      </ul>
      {list.length === 0 && <p className="py-10 text-center text-secondary">No thread matches.</p>}
    </div>
  );
}

// ───────────────────────── domain network ─────────────────────────

function Network_({ data, onOpenDoc }: { data: ThreadsResponse; onOpenDoc: (id: string) => void }) {
  const net = data.domainNetwork;
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selLink, setSelLink] = useState<string | null>(null);
  const maxCount = Math.max(1, ...net.nodes.map((n) => n.count));
  const nodes: FGNode[] = useMemo(
    () => net.nodes.map((n) => ({ id: n.key, label: n.label, r: 5 + Math.sqrt(n.count / maxCount) * 22, color: noveltyColor(n.avgNovelty) })),
    [net.nodes, maxCount],
  );
  const links: FGLink[] = useMemo(() => net.links.map((l) => ({ source: l.a, target: l.b, w: l.weight })), [net.links]);
  const label = (k: string) => net.nodes.find((n) => n.key === k)?.label ?? k;
  const byKey = useMemo(() => new Map(net.links.map((l) => [linkKey(l.a, l.b), l])), [net.links]);
  const shownLinks: DomainLink[] = selLink ? [byKey.get(selLink)].filter((x): x is DomainLink => !!x) : selNode ? net.links.filter((l) => l.a === selNode || l.b === selNode).slice(0, 12) : net.links.slice(0, 8);
  const node = selNode ? net.nodes.find((n) => n.key === selNode) : null;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <ForceGraph
          nodes={nodes}
          links={links}
          selectedId={selNode}
          selectedLink={selLink}
          onSelectNode={(id) => {
            setSelNode(id);
            setSelLink(null);
          }}
          onSelectLink={(a, b) => {
            setSelLink(linkKey(a, b));
            setSelNode(null);
          }}
          height={560}
          charge={-220}
        />
        <p className="mt-1.5 font-mono text-[10px] text-muted">
          {net.nodes.length} domains · {net.links.length} cross-domain pairs from Stage A tags (a pair is two tags on the same paper). Node size = papers, colour = average novelty (blue low, orange high), line width = shared papers.
        </p>
      </div>
      <div className="min-w-0">
        <Section title={selLink ? 'Bridge' : node ? node.label : 'Strongest bridges'} right={(selNode || selLink) && <button type="button" onClick={() => { setSelNode(null); setSelLink(null); }} className={cn(smallBtn, 'h-6 px-2.5 text-[9.5px]')}>Clear</button>}>
          {node && (
            <p className="mb-2 font-mono text-[11px] text-secondary">
              {node.count} papers · average novelty {node.avgNovelty.toFixed(2)}
            </p>
          )}
          <ul className="space-y-3">
            {shownLinks.map((l) => (
              <li key={linkKey(l.a, l.b)} className="rounded-lg border border-subtle bg-panel p-3">
                <button type="button" onClick={() => { setSelLink(linkKey(l.a, l.b)); setSelNode(null); }} className="text-left text-[13px] font-semibold text-paper hover:text-orange">
                  {label(l.a)} <span className="text-orange">+</span> {label(l.b)}
                </button>
                <span className="ml-2 font-mono text-[10px] text-muted">{l.weight} papers</span>
                <ul className="mt-2 space-y-2">
                  {l.examples.map((ex) => (
                    <li key={ex.sid} className="text-[12px] leading-relaxed">
                      <button type="button" onClick={() => onOpenDoc(ex.sid)} className="text-left text-paper hover:text-orange">
                        {ex.title}
                      </button>
                      {ex.bridge && <p className="text-secondary">{ex.bridge}</p>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

// ───────────────────────── bridges + highlights ─────────────────────────

function Bridges({ data }: { data: ThreadsResponse }) {
  const nice = (f: string) => f.replace(/^\d+-/, '').replace(/_/g, ' ');
  if (!data.folderBridges.length) return <p className="py-10 text-center text-secondary">No graph edges cross folders.</p>;
  const max = Math.max(...data.folderBridges.map((b) => b.count));
  return (
    <div>
      <p className="mb-3 max-w-3xl text-[12.5px] leading-relaxed text-secondary">
        Concept links in the Voltamachine graph whose two papers live in different top-level folders of ~/Documents/Science. These are the threads that cross your own filing system.
      </p>
      <ul className="space-y-2">
        {data.folderBridges.map((b) => (
          <li key={`${b.a}|${b.b}`} className="rounded-lg border border-subtle bg-panel p-3">
            <div className="flex items-center gap-3">
              <p className="text-[13.5px] font-semibold text-paper">
                {nice(b.a)} <span className="text-orange">↔</span> {nice(b.b)}
              </p>
              <span className="ml-auto font-mono text-[11px] text-secondary">{b.count} links</span>
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-highlight">
              <div className="h-full rounded-full bg-orange" style={{ width: `${(b.count / max) * 100}%` }} />
            </div>
            <ul className="mt-2 space-y-1">
              {b.examples.map((e, i) => (
                <li key={i} className="text-[12px] text-secondary">
                  {e.from} <span className="font-mono text-[10px] text-muted">{e.relation.replace(/_/g, ' ')}</span> {e.to}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Highlights({ data, onOpenDoc }: { data: ThreadsResponse; onOpenDoc: (id: string) => void }) {
  return (
    <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
      {data.highlights.map((h) => (
        <li key={h.sid} className="rounded-lg border border-subtle bg-panel p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <NoveltyChip value={h.novelty} />
            <ActionBadge action={h.action} />
            {h.contradiction && <ContradictionChip />}
            {h.storage && <StorageBadge storage={h.storage} />}
          </div>
          <button type="button" disabled={!h.rowId} onClick={() => h.rowId && onOpenDoc(h.rowId)} className="mt-1.5 text-left text-[14px] font-semibold leading-snug text-paper hover:text-orange disabled:hover:text-paper">
            {h.title}
          </button>
          <p className="mt-0.5 font-mono text-[10px] text-muted">{h.folder.replace(/^\d+-/, '').replace(/_/g, ' ')}</p>
          {h.summary && <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-secondary">{h.summary}</p>}
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.05em] text-orange">{h.reasons.join(' · ')}</p>
        </li>
      ))}
    </ul>
  );
}

export function ThreadsView({ onOpenDoc }: { onOpenDoc: (id: string) => void }) {
  const [sub, setSub] = useState<Sub>('semantic');
  const [data, setData] = useState<ThreadsResponse | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    let retry: number | undefined;
    const go = () =>
      api<ThreadsResponse | { building: true }>('/api/research/threads', ac.signal)
        .then((d) => {
          if (isBuilding(d)) {
            setBuilding(true);
            retry = window.setTimeout(go, 2500);
          } else {
            setBuilding(false);
            setData(d);
          }
        })
        .catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
    void go();
    return () => {
      ac.abort();
      window.clearTimeout(retry);
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav className="flex shrink-0 flex-wrap gap-1 border-b border-subtle px-4 py-2" aria-label="Threads views">
        {SUBS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSub(s.id)}
            className={cn('flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors', sub === s.id ? 'border-orange bg-orange/10 text-paper' : 'border-transparent text-secondary hover:border-subtle hover:text-paper')}
          >
            <s.icon className="h-3.5 w-3.5" />
            {s.label}
            {data && s.id === 'highlights' && <span className="rounded-full bg-panel-elevated px-1.5 font-mono text-[10px] text-muted">{data.highlights.length}</span>}
            {data && s.id === 'bridges' && <span className="rounded-full bg-panel-elevated px-1.5 font-mono text-[10px] text-muted">{data.folderBridges.length}</span>}
          </button>
        ))}
      </nav>
      <main className="hud-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4">
        {building && <Building />}
        {error && <ErrorNote>{error}</ErrorNote>}
        {sub === 'semantic' && <Semantic onOpenDoc={onOpenDoc} />}
        {sub !== 'semantic' && !data && !error && !building && <Loading>Reading the graphs...</Loading>}
        {data && sub === 'clusters' && <Clusters data={data} onOpenDoc={onOpenDoc} />}
        {data && sub === 'network' && <Network_ data={data} onOpenDoc={onOpenDoc} />}
        {data && sub === 'bridges' && <Bridges data={data} />}
        {data && sub === 'highlights' && <Highlights data={data} onOpenDoc={onOpenDoc} />}
      </main>
    </div>
  );
}
