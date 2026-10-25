'use client';
import { useRef } from 'react';
import { ListOrdered } from 'lucide-react';
import type { NotionPageDoc } from '@/types/notion';
import { cn } from '@/lib/cn';
import { ErrorNotice, ExternalPill, NoAccessNotice, Skeleton, fmtDay } from '@/components/notion/NotionBits';
import { MarkdownView } from '@/components/notion/MarkdownView';
import type { Remote } from '@/components/notion/useRemote';
import { fmtClock, type ScriptTiming } from './script-model';

/** Centre column: the selected page's sections rendered from Notion Markdown, with a chapter strip to jump between them. */
export function OutlineView({ page, fallbackTitle, fallbackUrl, timing }: { page: Remote<NotionPageDoc>; fallbackTitle: string; fallbackUrl: string | null; timing: ScriptTiming | null }) {
  const scroller = useRef<HTMLDivElement>(null);
  const d = page.data;

  const jump = (id: string) => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop - 52, behavior: 'smooth' });
  };

  if (page.status === 'error') {
    return page.noAccess ? <NoAccessNotice title={fallbackTitle} url={fallbackUrl ?? undefined} /> : <ErrorNotice message={page.error ?? 'Failed to load'} onRetry={() => page.reload()} />;
  }
  if (!d) return <Skeleton lines={14} />;

  return (
    <div ref={scroller} className="hud-scroll relative min-h-0 flex-1 overflow-y-auto">
      <header className="border-b border-subtle px-5 pb-3 pt-4">
        <h2 className="text-[18px] font-bold leading-snug tracking-tight text-paper">{d.title}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted">
          <span>{d.lastEdited ? `edited in Notion ${fmtDay(d.lastEdited)}` : ''}</span>
          <span>· {d.sections.length} sections</span>
          {timing && timing.totalWords > 0 && (
            <span>
              · {timing.totalWords.toLocaleString('en-US')} VO words ≈ {fmtClock(timing.totalSec)}
            </span>
          )}
          <ExternalPill href={d.url} className="ml-auto" />
        </div>
        {d.truncated && <p className="mt-2 rounded border border-amber/40 bg-amber/5 px-2 py-1 font-mono text-[10px] text-amber">This page is longer than the fetch budget; the end is cut off. Open it in Notion for the rest.</p>}
      </header>

      {d.sections.length > 1 && (
        <nav aria-label="Chapters" className="sticky top-0 z-10 flex gap-1.5 overflow-x-auto border-b border-subtle bg-panel/95 px-5 py-2 backdrop-blur [scrollbar-width:none]">
          <ListOrdered size={13} className="mt-1 shrink-0 text-muted" />
          {d.sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => jump(s.id)}
              className={cn('h-6 shrink-0 whitespace-nowrap rounded-full border border-subtle bg-panel-elevated px-2.5 font-mono text-[10px] text-secondary transition-colors hover:border-orange/60 hover:text-paper')}
            >
              {s.title.length > 34 ? `${s.title.slice(0, 33)}…` : s.title}
            </button>
          ))}
        </nav>
      )}

      <div className="space-y-6 px-5 py-4">
        {d.sections.map((s) => (
          <section key={s.id} data-section={s.id} aria-label={s.title}>
            {s.level > 0 && <h3 className="mb-2 flex items-baseline gap-2 border-b border-subtle pb-1.5 text-[15px] font-semibold text-paper">{s.title}</h3>}
            <MarkdownView md={s.markdown} />
          </section>
        ))}
        {d.sections.length === 0 && <p className="text-[13px] text-muted">This page is empty.</p>}
      </div>
    </div>
  );
}
