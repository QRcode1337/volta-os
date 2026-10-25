'use client';
// Syntheses: the cross-paper syntheses (Obsidian vault Synthesis/ plus ErisMorn notes), as a readable list and reader.
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Markdown } from './Markdown';
import { api, fmtDate } from './research-client';
import { chip, CopyButton, ErrorNote, field, Loading } from './ui';
import type { SynthesisDetail, SynthesisItem } from './types';

type Kind = 'all' | 'topic' | 'batch';

export function SynthesesView({ onCopied }: { onCopied: (ok: boolean, what: string) => void }) {
  const [items, setItems] = useState<SynthesisItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<SynthesisDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    api<{ items: SynthesisItem[] }>('/api/research/syntheses', ac.signal)
      .then((d) => setItems(d.items))
      .catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const ac = new AbortController();
    setDetail(null);
    setDetailError(null);
    api<SynthesisDetail>(`/api/research/synthesis?id=${encodeURIComponent(selected)}`, ac.signal)
      .then(setDetail)
      .catch((e: Error) => e.name !== 'AbortError' && setDetailError(e.message));
    return () => ac.abort();
  }, [selected]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items ?? []).filter((i) => (kind === 'all' || i.kind === kind) && (!needle || `${i.title} ${i.excerpt} ${i.tags.join(' ')} ${i.file}`.toLowerCase().includes(needle)));
  }, [items, q, kind]);
  const counts = useMemo(() => ({ all: items?.length ?? 0, topic: items?.filter((i) => i.kind === 'topic').length ?? 0, batch: items?.filter((i) => i.kind === 'batch').length ?? 0 }), [items]);

  // open the first synthesis once the list is in
  useEffect(() => {
    if (!selected && list.length) setSelected(list[0].id);
  }, [list, selected]);

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-[360px] shrink-0 flex-col border-r border-subtle">
        <div className="shrink-0 space-y-2 border-b border-subtle px-3 py-2.5">
          <label className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search syntheses" aria-label="Search syntheses" className={cn(field, 'w-full pl-8 placeholder:text-muted')} />
          </label>
          <div className="flex gap-1">
            {(['all', 'topic', 'batch'] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn('flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-medium capitalize', kind === k ? 'border-orange bg-orange/10 text-paper' : 'border-transparent text-secondary hover:border-subtle hover:text-paper')}
              >
                {k === 'batch' ? 'Batch reports' : k === 'topic' ? 'Topic syntheses' : 'All'}
                <span className="rounded-full bg-panel-elevated px-1.5 font-mono text-[10px] text-muted">{counts[k]}</span>
              </button>
            ))}
          </div>
        </div>
        <ul className="hud-scroll min-h-0 flex-1 overflow-y-auto p-2">
          {error && <ErrorNote>{error}</ErrorNote>}
          {!items && !error && <Loading />}
          {list.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => setSelected(i.id)}
                className={cn('mb-1 w-full rounded-lg border px-3 py-2 text-left transition-colors', selected === i.id ? 'border-orange/60 bg-orange/5' : 'border-transparent hover:border-subtle hover:bg-panel')}
              >
                <span className="block text-[13px] font-semibold leading-snug text-paper">{i.title}</span>
                <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.04em] text-muted">
                  {i.date ?? 'undated'} · {i.kind === 'batch' ? `batch${i.papersReviewed ? ` · ${i.papersReviewed} papers` : ''}` : 'topic'} · {i.words.toLocaleString()} words{i.source === 'erismorn' ? ' · ErisMorn' : ''}
                </span>
                {i.excerpt && <span className="mt-1 line-clamp-2 block text-[11.5px] leading-relaxed text-secondary">{i.excerpt}</span>}
              </button>
            </li>
          ))}
          {items && list.length === 0 && <p className="p-4 text-center text-secondary">No synthesis matches.</p>}
        </ul>
      </aside>
      <main className="hud-scroll min-w-0 flex-1 overflow-y-auto px-8 pb-24 pt-5">
        {detailError && <ErrorNote>{detailError}</ErrorNote>}
        {selected && !detail && !detailError && <Loading />}
        {detail && (
          <article className="mx-auto max-w-[820px]">
            <p className="hud-label">{detail.source === 'vault' ? 'Obsidian vault / Synthesis' : 'ErisMorn / voltamachine / synthesis'}</p>
            <h2 className="mt-1 text-[24px] font-bold leading-tight text-paper">{detail.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {detail.date && <span className={chip}>{fmtDate(detail.date)}</span>}
              <span className={chip}>{detail.words.toLocaleString()} words</span>
              {detail.papersReviewed !== null && <span className={chip}>{detail.papersReviewed} papers</span>}
              {detail.tags.map((t) => (
                <span key={t} className={chip}>
                  {t}
                </span>
              ))}
              {detail.strippedThinking && <span className={cn(chip, 'border-amber/40 text-amber')} title="The model's leaked reasoning ('Thinking...') was removed from this view. The note itself is unchanged.">reasoning text removed</span>}
              {detail.obsidian && (
                <a href={detail.obsidian} className={cn(chip, 'inline-flex items-center gap-1 border-purple/50 text-purple hover:text-paper')}>
                  <ExternalLink className="h-3 w-3" /> Open in Obsidian
                </a>
              )}
              <CopyButton text={detail.path} label="Copy path" onCopied={onCopied} />
            </div>
            {detail.markdown.trim() ? <Markdown text={detail.markdown} className="mt-4" /> : <p className="mt-6 text-secondary">This note is empty.</p>}
          </article>
        )}
      </main>
    </div>
  );
}
