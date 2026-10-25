'use client';
// A small, dependency-free markdown renderer for syntheses and Stage B reports. Renders React nodes only (no raw HTML),
// and only http(s) / obsidian links are clickable.
import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\s][^*\n]*\*)|(\[\[[^\]\n]+\]\])|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s)<>]+)/g;

function safeHref(h: string): string | null {
  return /^(https?:|obsidian:)/i.test(h) ? h : null;
}

export function Inline({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    const tok = m[0];
    if (m[1]) out.push(<code key={key++} className="rounded bg-panel-elevated px-1 py-0.5 font-mono text-[0.9em] text-amber">{tok.slice(1, -1)}</code>);
    else if (m[2] || m[3]) out.push(<strong key={key++} className="font-semibold text-paper"><Inline text={tok.slice(2, -2)} /></strong>);
    else if (m[4]) out.push(<em key={key++}><Inline text={tok.slice(1, -1)} /></em>);
    else if (m[5]) {
      const inner = tok.slice(2, -2);
      out.push(<span key={key++} className="text-orange">{inner.includes('|') ? inner.split('|')[1] : inner}</span>);
    } else if (m[6]) {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      const href = mm ? safeHref(mm[2]) : null;
      out.push(href ? <a key={key++} href={href} target="_blank" rel="noreferrer noopener" className="text-orange underline decoration-orange/40 hover:decoration-orange">{mm![1]}</a> : <Fragment key={key++}>{mm ? mm[1] : tok}</Fragment>);
    } else if (m[7]) {
      const href = safeHref(tok.replace(/[.,;]+$/, ''));
      out.push(href ? <a key={key++} href={href} target="_blank" rel="noreferrer noopener" className="break-all text-orange underline decoration-orange/40 hover:decoration-orange">{tok}</a> : tok);
    }
    last = i + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul' | 'ol'; items: { text: string; depth: number }[] }
  | { t: 'quote'; text: string }
  | { t: 'code'; text: string }
  | { t: 'hr' }
  | { t: 'table'; head: string[]; rows: string[][] };

const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

function parse(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: 'p', text: para.join(' ').trim() });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const buf: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) buf.push(lines[i]);
      blocks.push({ t: 'code', text: buf.join('\n') });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ t: 'h', level: h[1].length, text: h[2].replace(/\s*#+\s*$/, '') });
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      blocks.push({ t: 'hr' });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) rows.push(cells(lines[i]));
      i--;
      blocks.push({ t: 'table', head, rows });
      continue;
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flush();
      const ordered = /\d/.test(li[2]);
      const items: { text: string; depth: number }[] = [];
      for (; i < lines.length; i++) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (m) items.push({ text: m[3], depth: Math.min(3, Math.floor(m[1].replace(/\t/g, '  ').length / 2)) });
        else if (/^\s{2,}\S/.test(lines[i]) && items.length) items[items.length - 1].text += ` ${lines[i].trim()}`;
        else break;
      }
      i--;
      blocks.push({ t: ordered ? 'ol' : 'ul', items });
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const buf: string[] = [];
      for (; i < lines.length && /^>\s?/.test(lines[i]); i++) buf.push(lines[i].replace(/^>\s?/, ''));
      i--;
      blocks.push({ t: 'quote', text: buf.join(' ') });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}

const H_CLASS = ['', 'mt-5 mb-2 text-[20px] font-bold', 'mt-5 mb-2 text-[17px] font-bold', 'mt-4 mb-1.5 text-[15px] font-semibold', 'mt-3 mb-1 text-[13.5px] font-semibold', 'mt-3 mb-1 text-[13px] font-semibold', 'mt-3 mb-1 text-[12px] font-semibold'];

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parse(text);
  return (
    <div className={cn('text-[13.5px] leading-relaxed text-secondary', className)}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h': {
            const Tag = `h${Math.min(6, b.level)}` as 'h1';
            return <Tag key={i} className={cn('text-paper', H_CLASS[b.level])}><Inline text={b.text} /></Tag>;
          }
          case 'p':
            return <p key={i} className="my-2"><Inline text={b.text} /></p>;
          case 'ul':
          case 'ol': {
            const List = b.t;
            return (
              <List key={i} className={cn('my-2 space-y-1 pl-5', b.t === 'ul' ? 'list-disc' : 'list-decimal')}>
                {b.items.map((it, j) => (
                  <li key={j} style={{ marginLeft: it.depth * 16 }}><Inline text={it.text} /></li>
                ))}
              </List>
            );
          }
          case 'quote':
            return <blockquote key={i} className="my-2 border-l-2 border-orange/50 pl-3 italic text-secondary"><Inline text={b.text} /></blockquote>;
          case 'code':
            return <pre key={i} className="hud-scroll my-2 overflow-x-auto rounded-md border border-subtle bg-panel p-3 font-mono text-[11.5px] text-paper">{b.text}</pre>;
          case 'hr':
            return <hr key={i} className="my-4 border-subtle" />;
          case 'table':
            return (
              <div key={i} className="hud-scroll my-3 overflow-x-auto">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr>{b.head.map((c, j) => <th key={j} className="border-b border-highlight px-2 py-1 text-left font-semibold text-paper"><Inline text={c} /></th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>{r.map((c, k) => <td key={k} className="border-b border-subtle px-2 py-1 align-top"><Inline text={c} /></td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
