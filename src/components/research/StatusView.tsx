'use client';
// Status: how much of the library Voltamachine has indexed, the indexer's state, and what the inventory is doing.
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { api, fmtDate, pct } from './research-client';
import { chip, ErrorNote, Loading, Notice, Section, smallBtn, Tick } from './ui';
import { fmtBytes, type StatusResponse } from './types';

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

        <Section title="Phase 2">
          <Notice tone="orange">{s.phase2.note}</Notice>
        </Section>
      </div>
    </main>
  );
}
