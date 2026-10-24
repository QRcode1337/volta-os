'use client';
// Tiny, safe markdown-ish renderer for Honcho text (representations, dialectic answers, summaries).
// Handles headings, bullet/numbered lists, blank-line paragraphs, **bold**, `code`. No HTML injection.
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { splitHighlight } from './honcho-client';

function inline(text: string, keyBase: string, highlight?: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  const plain = (t: string) => {
    if (!highlight) return t;
    return splitHighlight(t, highlight).map((s, j) =>
      s.hit ? (
        <mark key={`${keyBase}-h${i}-${j}`} className="rounded-sm bg-orange/25 px-0.5 text-paper">
          {s.text}
        </mark>
      ) : (
        s.text
      ),
    );
  };
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<span key={`${keyBase}-t${i++}`}>{plain(text.slice(last, m.index))}</span>);
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={`${keyBase}-b${i++}`} className="font-semibold text-paper">{tok.slice(2, -2)}</strong>);
    else out.push(<code key={`${keyBase}-c${i++}`} className="rounded bg-obsidian px-1 py-px font-mono text-[0.9em] text-amber">{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(<span key={`${keyBase}-t${i++}`}>{plain(text.slice(last))}</span>);
  return out;
}

export function RichText({ text, className, highlight }: { text: string; className?: string; highlight?: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    const k = `p${blocks.length}`;
    blocks.push(
      <p key={k} className="whitespace-pre-wrap">
        {inline(para.join('\n'), k, highlight)}
      </p>,
    );
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const k = `l${blocks.length}`;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={k} className={cn('space-y-1 pl-5', list.ordered ? 'list-decimal' : 'list-disc marker:text-orange/70')}>
        {list.items.map((it, j) => {
          // Representation lines look like "[2026-09-26 02:03:21] fact…"
          const ts = /^\[(\d{4}-\d\d-\d\d[ T]\d\d:\d\d)(?::\d\d(?:\.\d+)?)?\]\s+(.*)$/.exec(it);
          return (
            <li key={j}>
              {ts && <span className="mr-1.5 font-mono text-[10px] text-muted">{ts[1].replace('T', ' ')}</span>}
              {inline(ts ? ts[2] : it, `${k}-${j}`, highlight)}
            </li>
          );
        })}
      </Tag>,
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const stamped = /^\[\d{4}-\d\d-\d\d[ T]\d\d:\d\d[^\]]*\]\s+/.test(line);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      const k = `h${blocks.length}`;
      blocks.push(
        <div key={k} className={cn('hud-label pt-1', h[1].length <= 2 ? 'text-orange' : 'text-secondary')}>
          {h[2].replace(/\*\*/g, '')}
        </div>,
      );
    } else if (ul || ol || stamped) {
      flushPara();
      const ordered = !!ol;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push(ul ? ul[1] : ol ? ol[1] : line.trim());
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();

  // overflow-wrap:anywhere — long unbroken tokens (ids, paths, masked keys) must not widen the scroll column.
  return <div className={cn('selectable min-w-0 space-y-2.5 text-[13px] leading-relaxed text-secondary [overflow-wrap:anywhere]', className)}>{blocks}</div>;
}
