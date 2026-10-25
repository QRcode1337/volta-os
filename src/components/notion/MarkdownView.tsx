'use client';
// Small Markdown renderer for Notion pages (headings, lists, to-dos, quotes/callouts, code, tables, rules, links).
// No dependencies and no raw HTML: text is always rendered as React text, links are limited to http(s)/mailto.
import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'hr' }
  | { t: 'code'; lang: string; text: string }
  | { t: 'quote'; md: string }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'list'; items: ListItem[]; ordered: boolean };

interface ListItem {
  text: string;
  check: boolean | null;
  kids: { items: ListItem[]; ordered: boolean } | null;
}

const LIST_RE = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, '|').trim());

function parseList(lines: string[], from: number, indent: number): { list: { items: ListItem[]; ordered: boolean }; next: number } {
  const items: ListItem[] = [];
  let ordered = false;
  let i = from;
  while (i < lines.length) {
    const m = lines[i].match(LIST_RE);
    if (!m) break;
    const ind = m[1].replace(/\t/g, '  ').length;
    if (ind < indent) break;
    if (ind > indent) {
      // deeper line without a parent item at this level: attach to the previous item
      const prev = items[items.length - 1];
      if (!prev) break;
      const sub = parseList(lines, i, ind);
      prev.kids = sub.list;
      i = sub.next;
      continue;
    }
    if (items.length === 0) ordered = /\d/.test(m[2]);
    let text = m[3];
    let check: boolean | null = null;
    const cb = text.match(/^\[( |x|X)\]\s+(.*)$/);
    if (cb) {
      check = cb[1] !== ' ';
      text = cb[2];
    }
    items.push({ text, check, kids: null });
    i++;
    // continuation lines (indented, not a list marker) belong to the item
    while (i < lines.length && lines[i].trim() !== '' && !LIST_RE.test(lines[i]) && /^\s{2,}/.test(lines[i])) {
      items[items.length - 1].text += `\n${lines[i].trim()}`;
      i++;
    }
  }
  return { list: { items, ordered }, next: i };
}

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r/g, '').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(/^```(.*)$/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push({ t: 'code', lang: fence[1].trim(), text: body.join('\n') });
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      out.push({ t: 'h', level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      out.push({ t: 'hr' });
      i++;
      continue;
    }
    if (/^>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      out.push({ t: 'quote', md: body.join('\n') });
      continue;
    }
    if (TABLE_ROW.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(splitRow(lines[i++]));
      out.push({ t: 'table', head, rows });
      continue;
    }
    const lm = line.match(LIST_RE);
    if (lm) {
      const { list, next } = parseList(lines, i, lm[1].replace(/\t/g, '  ').length);
      out.push({ t: 'list', items: list.items, ordered: list.ordered });
      i = next;
      continue;
    }
    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*(---+)\s*$)/.test(lines[i]) && !LIST_RE.test(lines[i]) && !(TABLE_ROW.test(lines[i]) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? ''))) {
      para.push(lines[i++]);
    }
    out.push({ t: 'p', text: para.join('\n') });
  }
  return out;
}

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

const INLINE = /(`[^`]+`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*(.+?)\*\*)|(~~(.+?)~~)|(\*([^*\s][^*]*?)\*)|((?<![\w])_([^_\s][^_]*?)_(?![\w]))/g;

export function renderInline(text: string, keyBase = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const key = `${keyBase}-${n++}`;
    if (m[1]) {
      out.push(
        <code key={key} className="rounded bg-obsidian px-1 py-px font-mono text-[0.9em] text-amber">
          {m[1].slice(1, -1)}
        </code>,
      );
    } else if (m[2]) {
      const label = renderInline(m[3], key);
      out.push(
        SAFE_HREF.test(m[4]) ? (
          <a key={key} href={m[4]} target="_blank" rel="noreferrer noopener" className="text-orange underline decoration-orange/40 underline-offset-2 hover:decoration-orange">
            {label}
          </a>
        ) : (
          <Fragment key={key}>{label}</Fragment>
        ),
      );
    } else if (m[5]) out.push(<strong key={key} className="font-semibold text-paper">{renderInline(m[6], key)}</strong>);
    else if (m[7]) out.push(<s key={key} className="text-muted">{renderInline(m[8], key)}</s>);
    else if (m[9]) out.push(<em key={key}>{renderInline(m[10], key)}</em>);
    else if (m[11]) out.push(<em key={key}>{renderInline(m[12], key)}</em>);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const TIER_TONES: [RegExp, string][] = [
  [/verified|confirmed|approved|\bok\b|\byes\b|✓|✅/i, 'border-green/50 bg-green/10 text-green'],
  [/disput|false|debunk|wrong|\bno\b|reject/i, 'border-[#EF4444]/50 bg-[#EF4444]/10 text-[#EF4444]'],
  [/legend|folklore|unverified|unproven|claim|rumou?r|pending|open|todo/i, 'border-amber/50 bg-amber/10 text-amber'],
];

export function toneFor(text: string): string {
  return TIER_TONES.find(([re]) => re.test(text))?.[1] ?? 'border-subtle bg-panel-elevated text-secondary';
}

const BADGE_HEADER = /tier|status|verif|confidence|state/i;

function ListView({ list, keyBase }: { list: { items: ListItem[]; ordered: boolean }; keyBase: string }) {
  const Tag = list.ordered ? 'ol' : 'ul';
  return (
    <Tag className={cn('my-1.5 space-y-1 pl-5', list.ordered ? 'list-decimal' : 'list-disc', 'marker:text-muted')}>
      {list.items.map((it, i) => (
        <li key={i} className={cn('pl-0.5 leading-relaxed', it.check !== null && 'list-none -ml-5 flex gap-2')}>
          {it.check !== null && (
            <span aria-hidden className={cn('mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[9px]', it.check ? 'border-green bg-green/20 text-green' : 'border-highlight')}>
              {it.check ? '✓' : ''}
            </span>
          )}
          <span className={cn('whitespace-pre-line', it.check && 'text-muted line-through')}>{renderInline(it.text, `${keyBase}-${i}`)}</span>
          {it.kids && <ListView list={it.kids} keyBase={`${keyBase}-${i}k`} />}
        </li>
      ))}
    </Tag>
  );
}

export function MarkdownView({ md, className, compact = false }: { md: string; className?: string; compact?: boolean }) {
  const blocks = parseBlocks(md);
  const base = compact ? 'text-[12.5px]' : 'text-[14px]';
  return (
    <div className={cn('selectable leading-relaxed text-secondary', base, className)}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.t) {
          case 'h': {
            const size = b.level === 1 ? 'text-[1.35em]' : b.level === 2 ? 'text-[1.18em]' : 'text-[1.04em]';
            return (
              <p key={key} role="heading" aria-level={b.level} className={cn('mb-1.5 mt-4 font-semibold tracking-tight text-paper first:mt-0', size)}>
                {renderInline(b.text, key)}
              </p>
            );
          }
          case 'p':
            return (
              <p key={key} className="my-2 whitespace-pre-line first:mt-0">
                {renderInline(b.text, key)}
              </p>
            );
          case 'hr':
            return <hr key={key} className="my-4 border-subtle" />;
          case 'code':
            return (
              <pre key={key} className="hud-scroll my-2 overflow-x-auto rounded-md border border-subtle bg-obsidian p-3 font-mono text-[0.88em] leading-relaxed text-secondary">
                {b.text}
              </pre>
            );
          case 'quote':
            return (
              <blockquote key={key} className="my-2.5 rounded-r-md border-l-2 border-orange/60 bg-panel-elevated/60 px-3 py-2">
                <MarkdownView md={b.md} compact={compact} className="text-secondary" />
              </blockquote>
            );
          case 'list':
            return <ListView key={key} list={b} keyBase={key} />;
          case 'table':
            return (
              <div key={key} className="hud-scroll my-2.5 overflow-x-auto rounded-md border border-subtle">
                <table className="w-full min-w-[420px] border-collapse text-left text-[0.92em]">
                  <thead>
                    <tr className="bg-panel-elevated">
                      {b.head.map((h, c) => (
                        <th key={c} className="border-b border-subtle px-2.5 py-1.5 font-mono text-[0.78em] font-semibold uppercase tracking-[0.06em] text-muted">
                          {renderInline(h, `${key}h${c}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, ri) => (
                      <tr key={ri} className="align-top odd:bg-obsidian/30">
                        {b.head.map((h, c) => {
                          const cell = r[c] ?? '';
                          const badge = BADGE_HEADER.test(h) && cell.trim();
                          return (
                            <td key={c} className="border-b border-subtle/60 px-2.5 py-1.5">
                              {badge ? (
                                <span className={cn('inline-block rounded-full border px-2 py-px font-mono text-[0.82em] font-semibold', toneFor(cell))}>{renderInline(cell.replace(/\*\*/g, ''), `${key}c${ri}-${c}`)}</span>
                              ) : (
                                renderInline(cell, `${key}c${ri}-${c}`)
                              )}
                            </td>
                          );
                        })}
                      </tr>
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
