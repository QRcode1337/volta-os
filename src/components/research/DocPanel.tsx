'use client';
// Slide-over detail for one library row: Stage A fields, Stage B, vault notes that mention it, graph concepts, related papers,
// and its nearest neighbours in the Phase 2 embedding index.
import { useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Markdown } from './Markdown';
import { api, fmtDate, isBuilding } from './research-client';
import { ActionBadge, chip, ContradictionChip, CopyButton, ErrorNote, Loading, NoveltyChip, Section, StorageBadge } from './ui';
import { fmtBytes, type DocDetail, type LibraryRow, type RelatedResponse } from './types';

function List({ items, ordered }: { items: string[]; ordered?: boolean }) {
  if (!items.length) return <p className="text-[12px] text-muted">None recorded.</p>;
  const L = ordered ? 'ol' : 'ul';
  return (
    <L className={cn('space-y-1.5 pl-5 text-[12.5px] leading-relaxed text-secondary', ordered ? 'list-decimal' : 'list-disc')}>
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </L>
  );
}

/** Phase 2 nearest neighbours. Quietly absent when there is no index or the row is newer than it. */
function NearestByMeaning({ row, onOpen }: { row: LibraryRow; onOpen: (id: string) => void }) {
  const [rel, setRel] = useState<RelatedResponse | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    setRel(null);
    setNote(null);
    api<RelatedResponse>(`/api/research/phase2?related=${encodeURIComponent(row.id)}&n=10`, ac.signal)
      .then(setRel)
      .catch((e: Error) => e.name !== 'AbortError' && setNote(e.message));
    return () => ac.abort();
  }, [row.id]);
  if (note) return <Section title="Nearest by meaning"><p className="text-[12px] text-muted">{note}</p></Section>;
  if (!rel?.related.length) return null;
  return (
    <Section title="Nearest by meaning" right={<span className="font-mono text-[10px] text-muted">Phase 2 embeddings</span>}>
      <ul className="space-y-1.5">
        {rel.related.map((x) => {
          const elsewhere = x.root !== row.root || x.folder !== row.folder;
          return (
            <li key={x.id} className="flex items-baseline gap-2">
              <button type="button" onClick={() => onOpen(x.id)} className="min-w-0 truncate text-left text-[12.5px] text-paper hover:text-orange">
                {x.title}
              </button>
              <span className={cn('ml-auto shrink-0 font-mono text-[10px]', elsewhere ? 'text-orange' : 'text-muted')} title={elsewhere ? 'Filed in a different folder' : 'Same folder'}>
                {elsewhere ? `${x.folder.replace(/^\d+[-_ ]/, '').replace(/_/g, ' ')} · ` : ''}
                {x.sim.toFixed(2)}
              </span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function DocPanel({ id, onClose, onOpen, onCopied }: { id: string; onClose: () => void; onOpen: (id: string) => void; onCopied: (ok: boolean, what: string) => void }) {
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showB, setShowB] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    setDoc(null);
    setError(null);
    setShowB(false);
    api<DocDetail | { building: true }>(`/api/research/doc?id=${encodeURIComponent(id)}`, ac.signal)
      .then((d) => (isBuilding(d) ? setError('The inventory is still building; try again in a moment.') : setDoc(d)))
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => ac.abort();
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const r = doc?.row;
  const a = doc?.stageA;
  const b = a?.stageB;
  return (
    <aside className="fixed bottom-0 right-0 top-14 z-30 flex w-full max-w-[560px] flex-col border-l border-highlight bg-panel shadow-[-12px_0_40px_rgba(0,0,0,0.5)]" aria-label="Document detail">
      <header className="flex shrink-0 items-start gap-3 border-b border-subtle px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="hud-label">{r ? `${r.rootLabel} / ${r.folder}${r.sub ? ` / ${r.sub}` : ''}` : 'Document'}</p>
          <h2 className="mt-1 text-[16px] font-bold leading-snug text-paper">{r?.title ?? (error ? 'Not available' : '...')}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full border border-subtle text-muted hover:text-paper">
          <X className="h-3.5 w-3.5" />
        </button>
      </header>
      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        {!doc && !error && <Loading />}
        {doc && r && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <StorageBadge storage={r.storage} />
              <span className={chip}>{r.ext || r.kind}</span>
              {r.size > 0 && <span className={chip}>{fmtBytes(r.size)}</span>}
              {r.mtime > 0 && <span className={chip}>{fmtDate(r.mtime)}</span>}
              <NoveltyChip value={r.novelty} />
              <ActionBadge action={r.action} />
              {r.contradiction && <ContradictionChip />}
            </div>

            <Section title="Where it is">
              <p className="break-all rounded-md border border-subtle bg-obsidian px-2.5 py-2 font-mono text-[11px] leading-relaxed text-secondary">{r.path}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <CopyButton text={r.path} label="Open in Finder path" onCopied={onCopied} />
                {r.brctl && <CopyButton text={r.brctl} label="Copy brctl download" onCopied={onCopied} />}
                {r.mirror?.exists && <CopyButton text={r.mirror.path} label="Copy Voltamachina path" onCopied={onCopied} />}
              </div>
              {r.brctl && <p className="mt-2 break-all rounded-md border border-amber/30 bg-amber/5 px-2.5 py-2 font-mono text-[10.5px] text-amber">{r.brctl}</p>}
              {r.storage === 'icloud' && <p className="mt-2 text-[12px] text-muted">An iCloud placeholder: nothing about its contents was read. Run the command above in a terminal to download it.</p>}
              {r.mirror?.exists && r.storage !== 'local' && <p className="mt-2 text-[12px] text-green">A copy is on the Voltamachina drive, so you can open it without downloading from iCloud.</p>}
              {a && a.matchedBy === 'name' && <p className="mt-2 text-[12px] text-muted">Joined to its Stage A record by unique file name (the folder differs from the path Voltamachine recorded).</p>}
            </Section>

            {a ? (
              <>
                <Section title="Stage A summary">
                  <p className="text-[13px] leading-relaxed text-secondary">{a.summary || 'No summary.'}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {a.domainTags.map((t) => (
                      <span key={t} className={chip}>
                        {t}
                      </span>
                    ))}
                  </div>
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                    {[
                      ['Novelty', a.noveltyScore?.toFixed(2) ?? '-'],
                      ['Confidence', a.confidence?.toFixed(2) ?? '-'],
                      ['Domains', a.crossDomainCount ?? '-'],
                      ['Action', a.recommendedAction ?? '-'],
                    ].map(([k, v]) => (
                      <div key={String(k)} className="rounded-md border border-subtle bg-obsidian px-2 py-1.5">
                        <dt className="hud-label !text-[9px] !text-muted">{k}</dt>
                        <dd className="mt-0.5 font-mono text-[13px] text-paper">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </Section>
                <Section title={`Key claims (${a.keyClaims.length})`}>
                  <List items={a.keyClaims} />
                </Section>
                {a.methods.length > 0 && (
                  <Section title="Methods">
                    <List items={a.methods} />
                  </Section>
                )}
                {a.crossDomainLinks.length > 0 && (
                  <Section title="Cross-domain links">
                    <List items={a.crossDomainLinks} />
                  </Section>
                )}
                {a.hasContradiction && (
                  <Section title="Contradictions">
                    <List items={a.contradictionNotes.length ? a.contradictionNotes : ['Flagged by Stage A, with no notes.']} />
                  </Section>
                )}
                {b && (
                  <Section title="Stage B" right={<span className="font-mono text-[10px] text-muted">{b.model ?? ''} {b.generatedAt ? fmtDate(b.generatedAt) : ''}</span>}>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {b.priority && <span className={cn(chip, (b.priority === 'high' || b.priority === 'critical') && 'border-orange/50 text-orange')}>priority {b.priority}</span>}
                      {b.publishRecommendation && <span className={chip}>{b.publishRecommendation.replace(/_/g, ' ')}</span>}
                      {Object.entries(b.risk).map(([k, v]) => (
                        <span key={k} className={chip}>
                          {k.replace(/([A-Z])/g, ' $1').toLowerCase()}: {v}
                        </span>
                      ))}
                    </div>
                    {b.escalationReason && <p className="mb-2 text-[12px] text-muted">Escalated because: {b.escalationReason}</p>}
                    {b.coreInsight && <p className="mb-2 text-[13px] leading-relaxed text-paper">{b.coreInsight}</p>}
                    {b.whyItMatters && <p className="mb-2 text-[12.5px] leading-relaxed text-secondary">{b.whyItMatters}</p>}
                    {b.testableHypotheses.length > 0 && (
                      <>
                        <p className="hud-label mt-3 mb-1">Testable hypotheses</p>
                        <List items={b.testableHypotheses} ordered />
                      </>
                    )}
                    {b.validationPlan.length > 0 && (
                      <>
                        <p className="hud-label mt-3 mb-1">Validation plan</p>
                        <List items={b.validationPlan} ordered />
                      </>
                    )}
                    {b.crossDomainSynthesis.length > 0 && (
                      <>
                        <p className="hud-label mt-3 mb-1">Cross-domain synthesis</p>
                        <List items={b.crossDomainSynthesis} />
                      </>
                    )}
                    {!b.coreInsight && !b.synthesisSummary && !b.whyItMatters && !doc.stageBText && <p className="text-[12px] text-muted">Stage B ran but produced no text for this paper (an empty stub).</p>}
                    {doc.stageBText && (
                      <div className="mt-3">
                        <button type="button" onClick={() => setShowB((s) => !s)} className="font-mono text-[10px] uppercase tracking-[0.06em] text-orange hover:underline">
                          {showB ? 'Hide' : 'Read'} the full Stage B report
                        </button>
                        {showB && <Markdown text={doc.stageBText} className="mt-2 rounded-md border border-subtle bg-obsidian p-3" />}
                      </div>
                    )}
                  </Section>
                )}
              </>
            ) : (
              <Section title="Voltamachine">
                <p className="text-[12.5px] text-muted">Not indexed by Voltamachine Stage A yet, so there is no summary. Search matches this file by name and folder only.</p>
              </Section>
            )}

            <Section title={`Vault notes that mention it (${doc.vaultNotes.length})`}>
              {doc.vaultNotes.length === 0 ? (
                <p className="text-[12px] text-muted">No local Obsidian note mentions this paper by title or file name.</p>
              ) : (
                <ul className="space-y-2">
                  {doc.vaultNotes.map((n) => (
                    <li key={n.rel} className="rounded-md border border-subtle bg-obsidian p-2.5">
                      <a href={n.obsidian} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-orange hover:underline">
                        <ExternalLink className="h-3 w-3" /> {n.title}
                      </a>
                      <p className="mt-0.5 font-mono text-[10px] text-muted">{n.rel}</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-secondary">{n.snippet}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {doc.concepts.length > 0 && (
              <Section title="Graph concepts">
                <div className="flex flex-wrap gap-1.5">
                  {doc.concepts.map((c) => (
                    <span key={c.id} className={chip} title={`cluster: ${c.communityName}`}>
                      {c.label}
                    </span>
                  ))}
                </div>
              </Section>
            )}
            {doc.related.length > 0 && (
              <Section title="Related papers">
                <ul className="space-y-1.5">
                  {doc.related.map((x) => (
                    <li key={x.id}>
                      <button type="button" onClick={() => onOpen(x.id)} className="text-left text-[12.5px] text-paper hover:text-orange">
                        {x.title}
                      </button>
                      <span className="ml-2 font-mono text-[10px] text-muted">{x.reason}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {r && <NearestByMeaning row={r} onOpen={onOpen} />}
          </>
        )}
      </div>
    </aside>
  );
}
