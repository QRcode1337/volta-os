'use client';
// Status: how much of the library Voltamachine has indexed, the indexer's state, and what the inventory is doing.
import { useCallback, useEffect, useState } from 'react';
import { Play, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { api, fmtDate, pct } from './research-client';
import { chip, ErrorNote, Loading, Notice, Section, smallBtn, Tick } from './ui';
import { fmtBytes, type Phase2Status, type StatusResponse } from './types';

function Bar({ parts }: { parts: { n: number; cls: string; label: string }[] }) {
  const total = parts.reduce((a, p) => a + p.n, 0) || 1;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-highlight" role="img" aria-label={parts.map((p) => `${p.label} ${p.n}`).join(', ')}>
      {parts.map((p) => (
        <div key={p.label} className={p.cls} style={{ width: `${(p.n / total) * 100}%` }} title={`${p.label}: ${p.n.toLocaleString()}`} />
      ))}
    </div>
  );
}

const card = 'rounded-lg border border-subtle bg-panel p-4';

const STAGE_LABEL: Record<Phase2Status['job']['stage'], string> = {
  idle: 'Idle',
  text: 'Reading titles, summaries and local text',
  embed: 'Embedding',
  cluster: 'Clustering',
  label: 'Naming clusters',
  done: 'Done',
  error: 'Failed',
};

/** Phase 2: the embedding index on Windsor. Polls its own endpoint while a build runs. */
function Phase2Panel({ initial }: { initial: Phase2Status }) {
  const [p, setP] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  useEffect(() => setP(initial), [initial]);
  useEffect(() => {
    if (!p.job.running) return;
    const t = window.setTimeout(() => {
      api<Phase2Status>('/api/research/phase2')
        .then(setP)
        .catch((e: Error) => setErr(e.message));
    }, 1500);
    return () => window.clearTimeout(t);
  }, [p]);
  const start = async (action: 'build' | 'label') => {
    setPosting(true);
    setErr(null);
    try {
      const res = await fetch('/api/research/phase2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const body = (await res.json().catch(() => ({}))) as Phase2Status & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Build failed (${res.status})`);
      setP(body);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPosting(false);
    }
  };
  const j = p.job;
  const ix = p.index;
  const cl = p.clusters;
  const unnamed = cl ? cl.count - cl.named : 0;
  return (
    <Section
      title="Phase 2 · semantic index"
      right={
        <span className="flex gap-1.5">
          {cl && unnamed > 0 && p.labeler.enabled && (
            <button type="button" disabled={j.running || posting} onClick={() => void start('label')} className={smallBtn} title={`Name the ${unnamed} unnamed clusters through the LLM router (task "${p.labeler.task}"); sends their top titles`}>
              <Sparkles className="h-3 w-3" /> Name clusters
            </button>
          )}
          <button type="button" disabled={j.running || posting || !p.embedder.ok} onClick={() => void start('build')} className={cn(smallBtn, 'border-orange/50 text-orange')}>
            {ix ? <RefreshCw className={cn('h-3 w-3', j.running && 'animate-spin')} /> : <Play className="h-3 w-3" />} {ix ? 'Update index' : 'Build index'}
          </button>
        </span>
      }
    >
      <div className="space-y-3">
        <Notice tone={p.built ? 'green' : 'orange'}>{p.note}</Notice>
        {err && <ErrorNote>{err}</ErrorNote>}
        {(j.running || j.stage === 'error' || (j.error && j.stage === 'done')) && (
          <div className={card}>
            <p className="text-[12.5px] text-paper">
              <strong>{STAGE_LABEL[j.stage]}</strong>
              {j.total > 0 && <span className="font-mono text-[11px] text-secondary"> · {j.done.toLocaleString()} / {j.total.toLocaleString()}</span>}
              {j.reused > 0 && <span className="font-mono text-[11px] text-muted"> · {j.reused.toLocaleString()} unchanged, reused</span>}
            </p>
            {j.running && j.total > 0 && (
              <div className="mt-2">
                <Bar parts={[{ n: j.done, cls: 'bg-orange', label: 'done' }, { n: Math.max(0, j.total - j.done), cls: 'bg-transparent', label: 'to go' }]} />
              </div>
            )}
            {j.error && <p className={cn('mt-2 text-[11.5px]', j.stage === 'error' ? 'text-[#EF4444]' : 'text-amber')}>{j.error}</p>}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className={card}>
            <h4 className="hud-label mb-2">Embedder</h4>
            <p className="text-[12.5px] text-paper">
              <Tick ok={p.embedder.ok} /> {p.embedder.model}
            </p>
            <p className="mt-0.5 font-mono text-[10.5px] text-muted">{p.embedder.url}/v1/embeddings</p>
            {p.embedder.error && <p className="mt-1.5 text-[11.5px] text-amber">{p.embedder.error}</p>}
            <p className="mt-2 font-mono text-[10.5px] text-muted">Cluster names: {p.labeler.enabled ? `LLM router task "${p.labeler.task}" (local first, then OmniRoute; sends cluster titles)` : 'off (term labels)'}</p>
          </div>
          <div className={card}>
            <h4 className="hud-label mb-2">Index</h4>
            {ix ? (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
                <dt className="text-muted">Documents</dt>
                <dd className="text-paper">{ix.docs.toLocaleString()}</dd>
                <dt className="text-muted">With summary</dt>
                <dd className="text-paper">{ix.withSummary.toLocaleString()}</dd>
                <dt className="text-muted">With local text</dt>
                <dd className="text-paper">{ix.withText.toLocaleString()}</dd>
                <dt className="text-muted">Vectors</dt>
                <dd className="text-paper">{ix.dim}-d · {fmtBytes(ix.bytes)}</dd>
                <dt className="text-muted">Built</dt>
                <dd className="text-paper">{fmtDate(ix.builtAt)}</dd>
                <dt className="text-muted">New since</dt>
                <dd className={p.missing ? 'text-amber' : 'text-green'}>{p.missing.toLocaleString()} file{p.missing === 1 ? '' : 's'}</dd>
              </dl>
            ) : (
              <p className="text-[12px] text-secondary">Not built. {p.missing.toLocaleString()} documents to embed.</p>
            )}
            <p className="mt-2 break-all font-mono text-[10px] text-muted">{p.dir}</p>
          </div>
          <div className={card}>
            <h4 className="hud-label mb-2">Semantic threads</h4>
            {cl ? (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
                <dt className="text-muted">Clusters</dt>
                <dd className="text-paper">{cl.count}</dd>
                <dt className="text-muted">Named by LLM</dt>
                <dd className={cl.named === cl.count ? 'text-green' : 'text-amber'}>
                  {cl.named} of {cl.count}
                </dd>
                <dt className="text-muted">Span 3+ folders</dt>
                <dd className="text-paper">{cl.crossFolder}</dd>
              </dl>
            ) : (
              <p className="text-[12px] text-secondary">Built with the index.</p>
            )}
            <p className="mt-2 text-[11.5px] text-secondary">See them in Threads → Semantic. Library search has a Semantic toggle; each document lists its nearest reading.</p>
          </div>
        </div>
      </div>
    </Section>
  );
}

export function StatusView() {
  const [s, setS] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  const load = useCallback(async (refresh = false, signal?: AbortSignal) => {
    try {
      setS(await api<StatusResponse>(`/api/research/status${refresh ? '?refresh=1' : ''}`, signal));
      setError(null);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const ac = new AbortController();
    void load(false, ac.signal);
    return () => ac.abort();
  }, [load]);
  // while the first build runs, poll
  useEffect(() => {
    if (!s || s.inventory.ready) return;
    const t = window.setTimeout(() => void load(), 2000);
    return () => window.clearTimeout(t);
  }, [s, load]);

  const rebuild = async () => {
    setRebuilding(true);
    await load(true);
    setRebuilding(false);
  };

  if (error) return <div className="p-4"><ErrorNote>{error}</ErrorNote></div>;
  if (!s) return <div className="p-4"><Loading /></div>;
  const inv = s.inventory;
  const totalFiles = s.roots.reduce((a, r) => a + r.files, 0);
  const totalIndexed = s.roots.reduce((a, r) => a + r.indexed, 0);
  const totalLocal = s.roots.reduce((a, r) => a + r.local, 0);
  const totalCloud = s.roots.reduce((a, r) => a + r.icloud, 0);
  const ix = s.indexer;

  return (
    <main className="hud-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4">
      <div className="mx-auto max-w-[1180px]">
        {s.warnings.length > 0 && (
          <div className="mb-4 space-y-1.5">
            {s.warnings.map((w) => (
              <Notice key={w}>{w}</Notice>
            ))}
          </div>
        )}

        <Section title="Coverage by root" right={<span className="font-mono text-[10px] text-muted">{totalFiles.toLocaleString()} files · {pct(totalIndexed, totalFiles)}% summarised by Stage A · {pct(totalCloud, totalFiles)}% in iCloud</span>}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {s.roots.map((r) => (
              <div key={r.id} className={card}>
                <div className="flex items-baseline gap-2">
                  <h4 className="text-[14px] font-semibold text-paper">{r.label}</h4>
                  <span className="font-mono text-[10px] text-muted">{r.files.toLocaleString()} files · {fmtBytes(r.bytes)}</span>
                  {!r.exists && <span className={cn(chip, 'ml-auto border-[#EF4444]/50 text-[#EF4444]')}>missing</span>}
                </div>
                <p className="mt-0.5 truncate font-mono text-[10px] text-muted" title={r.path}>{r.path}</p>
                <p className="hud-label mt-3 mb-1 !text-[9.5px]">Stage A summarised: {r.indexed.toLocaleString()} ({pct(r.indexed, r.files)}%)</p>
                <Bar parts={[{ n: r.indexed, cls: 'bg-orange', label: 'summarised' }, { n: r.files - r.indexed, cls: 'bg-transparent', label: 'not yet' }]} />
                <p className="hud-label mt-3 mb-1 !text-[9.5px]">
                  Local {r.local.toLocaleString()} · <span className="text-amber">in iCloud {r.icloud.toLocaleString()}</span> ({pct(r.icloud, r.files)}%)
                </p>
                <Bar parts={[{ n: r.local, cls: 'bg-green', label: 'local' }, { n: r.icloud, cls: 'bg-amber', label: 'in iCloud' }]} />
                {r.tracked && (
                  <p className="mt-2 font-mono text-[10px] text-muted">
                    Voltamachine's own index-status.json: {r.tracked.indexed} of {r.tracked.tracked.toLocaleString()} tracked files indexed
                  </p>
                )}
                {r.excluded.length > 0 && (
                  <p className="mt-1 truncate font-mono text-[10px] text-muted" title={r.excluded.join('\n')}>
                    skipped folders ({r.excluded.length}{r.excluded.length >= 60 ? '+' : ''}): {r.excluded.slice(0, 3).map((x) => x.split('/').slice(-1)[0]).join(', ')}
                  </p>
                )}
                {r.truncated && <p className="mt-1 text-[11px] text-amber">Capped: only the first files were listed.</p>}
              </div>
            ))}
          </div>
          <p className="mt-2 font-mono text-[10px] text-muted">
            Total: {totalLocal.toLocaleString()} local, {totalCloud.toLocaleString()} in iCloud. Placeholders are never opened; their contents are unread.
          </p>
        </Section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section title="Voltamachine indexer">
            <div className={card}>
              <ul className="space-y-2.5">
                {ix.agents.map((a) => (
                  <li key={a.label} className="text-[12.5px]">
                    <div className="flex items-center gap-2">
                      <Tick ok={a.loaded} />
                      <span className="font-mono text-[11.5px] text-paper">{a.label.replace('com.erismorn.', '')}</span>
                      <span className={cn(chip, a.loaded ? 'border-green/40 text-green' : 'border-amber/50 text-amber')}>{a.loaded ? 'loaded' : a.plist ? 'not loaded' : 'no plist'}</span>
                    </div>
                    <p className="ml-6 font-mono text-[10.5px] text-muted">
                      {a.state ?? '-'} · {a.schedule} · runs {a.runs ?? '-'} · last exit {a.lastExit ?? '-'}
                    </p>
                  </li>
                ))}
              </ul>
              <div className={cn('mt-3 rounded-md border px-3 py-2 text-[12.5px]', ix.hold.active ? 'border-amber/40 bg-amber/5' : 'border-green/40 bg-green/5')}>
                {ix.hold.active ? (
                  <>
                    <strong className="font-semibold text-paper">New batches are held.</strong> <span className="text-secondary">batch-index exits at once unless <code className="font-mono text-amber">{ix.hold.envVar}=1</code> is set for it.</span>
                    {ix.hold.reason && <p className="mt-1 font-mono text-[10.5px] text-muted">last run {ix.hold.at ?? ''}: {ix.hold.reason}</p>}
                  </>
                ) : (
                  <strong className="font-semibold text-paper">{ix.hold.envVar}=1 is set: batches may run.</strong>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
                <dt className="text-muted">Last batch</dt>
                <dd className="text-paper">{ix.lastBatch.n !== null ? `#${ix.lastBatch.n} · ${ix.lastBatch.at} · ${ix.lastBatch.processed ?? '?'} processed` : 'unknown'}</dd>
                <dt className="text-muted">Documents processed</dt>
                <dd className="text-paper">{ix.processedDocs ?? '-'}</dd>
                <dt className="text-muted">Stage B failures</dt>
                <dd className="text-paper">{ix.stageBFailed ?? '-'}</dd>
                <dt className="text-muted">index-status.json</dt>
                <dd className="text-paper">{ix.indexStatusAt ?? '-'}</dd>
                <dt className="text-muted">Voltamachina drive</dt>
                <dd className={ix.voltamachinaMounted ? 'text-green' : 'text-amber'}>{ix.voltamachinaMounted ? 'mounted' : 'not mounted'}</dd>
              </dl>
            </div>
          </Section>

          <Section title="Stage A records">
            <div className={card}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
                <dt className="text-muted">Records (stagea/*.json)</dt>
                <dd className="text-paper">{s.stageA.records}</dd>
                <dt className="text-muted">Joined by path</dt>
                <dd className="text-paper">{s.stageA.matchedByPath}</dd>
                <dt className="text-muted">Joined by unique file name</dt>
                <dd className="text-paper">{s.stageA.matchedByName}</dd>
                <dt className="text-muted">Not under ~/Documents</dt>
                <dd className={s.stageA.unmatched ? 'text-amber' : 'text-paper'}>{s.stageA.unmatched}</dd>
                <dt className="text-muted">Stage B reports with text</dt>
                <dd className="text-paper">{s.stageA.stageBFull}</dd>
                <dt className="text-muted">Stage B empty stubs (skipped)</dt>
                <dd className="text-paper">{s.stageA.stageBStubs}</dd>
                <dt className="text-muted">Escalate</dt>
                <dd className="text-orange">{s.stageA.escalate}</dd>
                <dt className="text-muted">With a contradiction</dt>
                <dd className="text-paper">{s.stageA.contradictions}</dd>
              </dl>
            </div>
          </Section>

          <Section
            title="File inventory"
            right={
              <button type="button" onClick={() => void rebuild()} disabled={rebuilding || inv.building} className={smallBtn}>
                <RefreshCw className={cn('h-3 w-3', (rebuilding || inv.building) && 'animate-spin')} /> Rebuild
              </button>
            }
          >
            <div className={card}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
                <dt className="text-muted">State</dt>
                <dd className="text-paper">{inv.building ? `building (${inv.files.toLocaleString()} so far)` : inv.ready ? 'ready' : 'not built'}</dd>
                <dt className="text-muted">Files listed</dt>
                <dd className="text-paper">{inv.files.toLocaleString()}</dd>
                <dt className="text-muted">Built</dt>
                <dd className="text-paper">{inv.builtAt ? `${fmtDate(inv.builtAt)} ${inv.builtAt.slice(11, 19)} UTC${inv.fromDisk ? ' (loaded from disk)' : ''}` : '-'}</dd>
                <dt className="text-muted">Walk time</dt>
                <dd className="text-paper">{inv.durationMs !== null ? `${(inv.durationMs / 1000).toFixed(1)} s (stat only)` : '-'}</dd>
                <dt className="text-muted">Saved to</dt>
                <dd className={cn('break-all', inv.persisted ? 'text-green' : 'text-amber')}>{inv.persistPath}</dd>
              </dl>
              {inv.persistError && <p className="mt-2 text-[11.5px] text-amber">{inv.persistError}</p>}
              {inv.error && <p className="mt-2 text-[11.5px] text-[#EF4444]">{inv.error}</p>}
            </div>
          </Section>

          <Section title="Vault, graphs and catalog">
            <div className={cn(card, 'space-y-2 text-[12px]')}>
              <p className="text-secondary">
                <strong className="text-paper">Obsidian vault:</strong> {s.vault.exists ? `${s.vault.syntheses} syntheses, ${s.vault.notesLocal} local notes read, ${s.vault.notesIcloud} in iCloud (skipped), reasoning text removed from ${s.vault.stripped}` : 'not found'}
              </p>
              {s.graphs.map((g) => (
                <p key={g.id} className="text-secondary">
                  <strong className="text-paper">{g.label}:</strong>{' '}
                  {g.error ? <span className="text-amber">{g.error}</span> : `${g.nodes?.toLocaleString()} nodes, ${g.edges?.toLocaleString()} edges, ${g.communities} communities (graph.json is local, built ${fmtDate(g.mtime)})`}
                </p>
              ))}
              <p className="text-secondary">
                <strong className="text-paper">Science/catalog.csv:</strong> {s.catalog.note}
              </p>
            </div>
          </Section>
        </div>

        <Phase2Panel initial={s.phase2} />
      </div>
    </main>
  );
}
