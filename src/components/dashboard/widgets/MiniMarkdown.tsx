import { Fragment, type ReactNode } from 'react';

/**
 * Tiny dependency-free markdown renderer (no innerHTML).
 * Blocks: #–#### headings, - / * / 1. lists (incl. [ ] / [x] tasks), ``` code fences, > quotes, --- rules, | tables, paragraphs.
 * Inline: `code`, **bold**, *italic* / _italic_, [text](url) (rendered as styled text).
 */

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|(?<!\w)__[^_]+__(?!\w)|\*[^*\s][^*]*\*|(?<!\w)_[^_\s][^_]*_(?!\w)|\[[^\]]+\]\([^)]+\))/g;

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith('`')) {
      out.push(
        <code key={k} className="rounded-[4px] border border-subtle bg-obsidian px-1 py-px font-mono text-[0.86em] text-amber">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith('**') || tok.startsWith('__')) {
      out.push(
        <strong key={k} className="font-semibold text-paper">
          {inline(tok.slice(2, -2), k)}
        </strong>,
      );
    } else if (tok.startsWith('[')) {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      out.push(
        <span key={k} className="text-orange underline decoration-orange/40 underline-offset-2" title={lm?.[2]}>
          {lm?.[1] ?? tok}
        </span>,
      );
    } else {
      out.push(
        <em key={k} className="italic text-paper/90">
          {inline(tok.slice(1, -1), k)}
        </em>,
      );
    }
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul' | 'ol'; items: { text: string; task?: boolean; done?: boolean }[] }
  | { t: 'code'; lang: string; text: string }
  | { t: 'quote'; text: string }
  | { t: 'hr' }
  | { t: 'table'; head: string[]; rows: string[][] };

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function parse(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    // code fence
    const fence = /^```(\S*)/.exec(trimmed);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) buf.push(lines[i++]);
      i++; // closing fence
      blocks.push({ t: 'code', lang: fence[1], text: buf.join('\n') });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (h) {
      blocks.push({ t: 'h', level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }
    if (trimmed.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const r = lines[i].trim();
        if (!/^\|?\s*:?-{2,}/.test(r)) rows.push(splitRow(r));
        i++;
      }
      blocks.push({ t: 'table', head: rows[0] ?? [], rows: rows.slice(1) });
      continue;
    }
    if (trimmed.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) buf.push(lines[i++].trim().replace(/^>\s?/, ''));
      blocks.push({ t: 'quote', text: buf.join(' ') });
      continue;
    }
    const isUl = /^[-*+]\s+/.test(trimmed);
    const isOl = /^\d+[.)]\s+/.test(trimmed);
    if (isUl || isOl) {
      const items: { text: string; task?: boolean; done?: boolean }[] = [];
      const re = isUl ? /^[-*+]\s+/ : /^\d+[.)]\s+/;
      while (i < lines.length && re.test(lines[i].trim())) {
        let text = lines[i].trim().replace(re, '');
        const task = /^\[( |x|X)\]\s+/.exec(text);
        if (task) text = text.slice(task[0].length);
        items.push({ text, task: !!task, done: task ? task[1].toLowerCase() === 'x' : undefined });
        i++;
        // continuation lines (indented, non-list)
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !re.test(lines[i].trim())) {
          items[items.length - 1].text += ` ${lines[i].trim()}`;
          i++;
        }
      }
      blocks.push({ t: isUl ? 'ul' : 'ol', items });
      continue;
    }
    // paragraph
    const buf: string[] = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|```|>|\||[-*+]\s|\d+[.)]\s|-{3,}$)/.test(lines[i].trim())
    ) {
      buf.push(lines[i++].trim());
    }
    blocks.push({ t: 'p', text: buf.join(' ') });
  }
  return blocks;
}

const H_CLASS: Record<number, string> = {
  1: 'mt-1 text-[17px] font-semibold text-paper',
  2: 'mt-3 border-b border-subtle pb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-orange',
  3: 'mt-2.5 text-[13px] font-semibold text-paper',
  4: 'mt-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-secondary',
};

export function MiniMarkdown({ source, className }: { source: string; className?: string }) {
  const blocks = parse(source);
  return (
    <div className={className}>
      {blocks.map((b, bi) => {
        const k = `b${bi}`;
        switch (b.t) {
          case 'h': {
            const Tag = (`h${Math.min(6, b.level + 2)}` as 'h3');
            return (
              <Tag key={k} className={H_CLASS[b.level]}>
                {inline(b.text, k)}
              </Tag>
            );
          }
          case 'p':
            return (
              <p key={k} className="mt-2 text-[12.5px] leading-relaxed text-secondary">
                {inline(b.text, k)}
              </p>
            );
          case 'ul':
          case 'ol':
            return (
              <ul key={k} className="mt-2 flex flex-col gap-1">
                {b.items.map((it, ii) => (
                  <li key={ii} className="flex gap-2 text-[12.5px] leading-relaxed text-secondary">
                    {it.task ? (
                      <span
                        className={
                          'mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[9px] font-bold ' +
                          (it.done ? 'border-green/60 bg-green/15 text-green' : 'border-highlight text-transparent')
                        }
                      >
                        ✓
                      </span>
                    ) : b.t === 'ol' ? (
                      <span className="mt-px w-4 shrink-0 text-right font-mono text-[11px] text-orange">{ii + 1}.</span>
                    ) : (
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-orange" />
                    )}
                    <span className={it.done ? 'text-muted line-through' : undefined}>{inline(it.text, `${k}-${ii}`)}</span>
                  </li>
                ))}
              </ul>
            );
          case 'code':
            return (
              <pre
                key={k}
                className="selectable hud-scroll mt-2 overflow-x-auto rounded-lg border border-subtle bg-obsidian px-3 py-2.5 font-mono text-[11px] leading-relaxed text-paper/90"
              >
                {b.lang && <span className="mb-1 block text-[9px] uppercase tracking-[0.1em] text-muted">{b.lang}</span>}
                <code>{b.text}</code>
              </pre>
            );
          case 'quote':
            return (
              <blockquote key={k} className="mt-2 border-l-2 border-orange/60 pl-3 text-[12.5px] italic leading-relaxed text-secondary">
                {inline(b.text, k)}
              </blockquote>
            );
          case 'hr':
            return <hr key={k} className="my-3 border-subtle" />;
          case 'table':
            return (
              <div key={k} className="hud-scroll mt-2 overflow-x-auto rounded-lg border border-subtle">
                <table className="w-full border-collapse text-left text-[11.5px]">
                  <thead className="bg-panel-elevated">
                    <tr>
                      {b.head.map((c, ci) => (
                        <th key={ci} className="px-2.5 py-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                          {inline(c, `${k}-h${ci}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, ri) => (
                      <tr key={ri} className="border-t border-subtle">
                        {r.map((c, ci) => (
                          <td key={ci} className="px-2.5 py-1.5 text-secondary">
                            {inline(c, `${k}-${ri}-${ci}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return <Fragment key={k} />;
        }
      })}
    </div>
  );
}
