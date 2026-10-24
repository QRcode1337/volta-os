'use client';

import { Fragment, useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

// Read-only markdown preview for Note Ring notes: YAML frontmatter → metadata chips, then headings,
// paragraphs, lists (incl. task boxes), quotes, code fences, tables, hr and inline code/bold/italic/links/wikilinks.

const MAX_CHARS = 60_000; // very long notes are cut; the full note opens in Obsidian

export interface FrontmatterField {
  key: string;
  values: string[];
}

/** "[[target|Label]]" → "Label", "[[folder/Target]]" → "Target", quotes stripped. */
function cleanValue(v: string): string {
  let s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, (_, t: string) => t.split('/').pop() ?? t);
  return s.trim();
}

/** Minimal YAML frontmatter parser: `key: value`, `key: [a, b]` and `key:` followed by `- item` lines. */
export function parseFrontmatter(src: string): { fields: FrontmatterField[]; body: string } {
  const text = src.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return { fields: [], body: text };
  const end = text.indexOf('\n---', 4);
  if (end < 0) return { fields: [], body: text };
  const block = text.slice(4, end).split('\n');
  const after = text.indexOf('\n', end + 4);
  const body = after < 0 ? '' : text.slice(after + 1);
  const fields: FrontmatterField[] = [];
  let current: FrontmatterField | null = null;
  for (const raw of block) {
    if (!raw.trim()) continue;
    const item = /^\s*-\s+(.*)$/.exec(raw);
    if (item && current) {
      const v = cleanValue(item[1]);
      if (v) current.values.push(v);
      continue;
    }
    const kv = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(raw);
    if (!kv) continue;
    const value = kv[2].trim();
    current = { key: kv[1], values: [] };
    if (value.startsWith('[') && value.endsWith(']')) {
      current.values = value
        .slice(1, -1)
        .split(',')
        .map(cleanValue)
        .filter(Boolean);
    } else if (value && value !== '|' && value !== '>') {
      current.values = [cleanValue(value)];
    }
    fields.push(current);
  }
  return { fields: fields.filter((f) => f.values.length > 0), body };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/;

function chipText(f: FrontmatterField, maxItems: number): string {
  const vals = f.values.map((v) => (ISO_DATE.test(v) ? v.slice(0, 16).replace('T', ' ') : v)).map((v) => (v.length > 42 ? `${v.slice(0, 40)}…` : v));
  const shown = vals.slice(0, maxItems).join(', ');
  return vals.length > maxItems ? `${shown} +${vals.length - maxItems}` : shown;
}

/** Small metadata chips for frontmatter fields. */
export function FrontmatterChips({ fields, max = 10, className }: { fields: FrontmatterField[]; max?: number; className?: string }) {
  if (!fields.length) return null;
  const shown = fields.slice(0, max);
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {shown.map((f) => (
        <span
          key={f.key}
          title={`${f.key}: ${f.values.join(', ')}`}
          className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-subtle bg-obsidian/70 px-2 py-[2px] font-mono text-[9.5px] leading-4"
        >
          <span className="uppercase tracking-[0.08em] text-teal">{f.key}</span>
          <span className="truncate text-secondary">{chipText(f, 3)}</span>
        </span>
      ))}
      {fields.length > max && <span className="px-1 py-[2px] font-mono text-[9.5px] text-muted">+{fields.length - max} more</span>}
    </div>
  );
}

// ───────────────────────────── inline ─────────────────────────────

// Emphasis follows CommonMark flanking rules closely enough for dev notes: `_`/`__` never open or close
// inside a word (CAPTURE_TIMEOUT, ltm_daemon.py, unsafe_control_path stay literal), `*` must hug its text
// on both sides and not touch a word char outside (so "*.md and *.ts" and "2*3*4" stay literal).
const INLINE_RE = new RegExp(
  [
    '(`[^`]+`)', // 1 inline code
    '(!\\[[^\\]]*\\]\\([^)]*\\)|!\\[\\[[^\\]]+\\]\\])', // 2 image / embed
    '(\\[\\[[^\\]]+\\]\\])', // 3 wikilink
    '(\\[[^\\]]+\\]\\([^)]+\\))', // 4 markdown link
    '(\\*\\*(?=\\S)[^*]*?\\S\\*\\*|(?<![A-Za-z0-9_])__(?=\\S)[^_]*?[^\\s_]__(?![A-Za-z0-9_]))', // 5 bold
    '((?<![A-Za-z0-9*\\\\])\\*(?=[^\\s*])(?:[^*]*?[^\\s*])?\\*(?![A-Za-z0-9*])|(?<![A-Za-z0-9_\\\\])_(?=[^\\s_])(?:[^_]*?[^\\s_])?_(?![A-Za-z0-9_]))', // 6 italic
    '(~~[^~]+~~)', // 7 strike
    '(==[^=]+==)', // 8 highlight
  ].join('|'),
  'g',
);
/** Python-style dunders (`__init__`, `__main__`) are identifiers in these notes, not bold text. */
const DUNDER = /^__[a-z][a-z0-9]*__$/;

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const key = `${keyBase}-${k++}`;
    if (m[1]) {
      out.push(
        <code key={key} className="rounded bg-panel-hover px-1 py-px font-mono text-[0.86em] text-amber">
          {t.slice(1, -1)}
        </code>,
      );
    } else if (m[2]) {
      out.push(
        <span key={key} className="rounded border border-subtle px-1 font-mono text-[0.8em] text-muted">
          image
        </span>,
      );
    } else if (m[3]) {
      const inner = t.slice(2, -2);
      const label = inner.includes('|') ? inner.slice(inner.indexOf('|') + 1) : (inner.split('#')[0].split('/').pop() ?? inner);
      out.push(
        <span key={key} className="text-purple" title={inner}>
          {label}
        </span>,
      );
    } else if (m[4]) {
      const label = t.slice(1, t.indexOf(']'));
      const href = t.slice(t.indexOf('](') + 2, -1);
      out.push(
        <span key={key} className="text-orange underline decoration-orange/40 underline-offset-2" title={href}>
          {label}
        </span>,
      );
    } else if (m[5] && DUNDER.test(t)) {
      out.push(t);
    } else if (m[5]) {
      out.push(
        <strong key={key} className="font-semibold text-paper">
          {t.slice(2, -2)}
        </strong>,
      );
    } else if (m[6]) {
      out.push(
        <em key={key} className="italic text-paper">
          {t.slice(1, -1)}
        </em>,
      );
    } else if (m[7]) {
      out.push(
        <s key={key} className="text-muted">
          {t.slice(2, -2)}
        </s>,
      );
    } else if (m[8]) {
      out.push(
        <mark key={key} className="rounded bg-amber/20 px-0.5 text-paper">
          {t.slice(2, -2)}
        </mark>,
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ───────────────────────────── blocks ─────────────────────────────

function renderBlocks(src: string, full: boolean): ReactNode[] {
  const lines = src.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const isBlockStart = (l: string) => /^\s*(#{1,6}\s|```|>|[-*+]\s|\d+[.)]\s|\|)/.test(l) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }

    // fenced code
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim().toLowerCase();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++]);
      i++;
      blocks.push(
        <div key={key++} className="mb-3 overflow-hidden rounded-lg border border-subtle bg-obsidian">
          {lang && <div className="border-b border-subtle px-3 py-1 font-mono text-[9px] uppercase tracking-widest text-muted">{lang}</div>}
          <pre className="hud-scroll overflow-x-auto whitespace-pre px-3 py-2 font-mono text-[11px] leading-5 text-secondary">{body.join('\n') || ' '}</pre>
        </div>,
      );
      continue;
    }

    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      const level = h[1].length;
      const cls =
        level === 1
          ? cn('mb-3 mt-1 font-bold tracking-tight text-paper', full ? 'text-[26px]' : 'text-[19px]')
          : level === 2
            ? cn('mb-2 mt-5 border-b border-subtle pb-1 font-semibold text-paper', full ? 'text-[18px]' : 'text-[14.5px]')
            : 'mb-1.5 mt-4 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-secondary';
      blocks.push(
        <div key={key++} className={cls} role="heading" aria-level={level}>
          {level === 2 && <span className="mr-2 font-doto text-orange">#</span>}
          {inline(h[2].replace(/\s*#+\s*$/, ''), `h${key}`)}
        </div>,
      );
      i++;
      continue;
    }

    // horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<hr key={key++} className="my-4 border-subtle" />);
      i++;
      continue;
    }

    // blockquote / callout
    if (trimmed.startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) body.push(lines[i++].trim().replace(/^>\s?/, ''));
      const callout = /^\[!(\w+)\][+-]?\s*(.*)$/.exec(body[0] ?? '');
      if (callout) body[0] = callout[2] ? `**${callout[2]}**` : `**${callout[1]}**`;
      blocks.push(
        <blockquote key={key++} className="mb-3 border-l-2 border-orange/50 bg-panel-elevated/50 py-1.5 pl-3 pr-2 text-secondary">
          {body.map((b, j) => (
            <p key={j} className={cn(j > 0 && 'mt-1')}>
              {inline(b, `q${key}-${j}`)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // table
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const r = lines[i].trim().replace(/^\||\|$/g, '');
        if (!/^\s*:?-{2,}/.test(r)) rows.push(r.split('|').map((c) => c.trim()));
        i++;
      }
      const [head, ...rest] = rows;
      blocks.push(
        <div key={key++} className="hud-scroll mb-3 overflow-x-auto rounded-lg border border-subtle">
          <table className="w-full border-collapse text-left text-[11.5px]">
            <thead className="bg-panel-elevated">
              <tr>
                {head?.map((c, j) => (
                  <th key={j} className="border-b border-subtle px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-secondary">
                    {inline(c, `th${key}-${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rest.map((r, ri) => (
                <tr key={ri} className="border-b border-subtle/60 last:border-0">
                  {r.map((c, j) => (
                    <td key={j} className="px-2.5 py-1.5 align-top text-secondary">
                      {inline(c, `td${key}-${ri}-${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // lists (one level of nesting by indentation)
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items: { depth: number; text: string; task: null | boolean }[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        const raw = lines[i];
        const indent = raw.length - raw.trimStart().length;
        let text = raw.trim().replace(/^([-*+]|\d+[.)])\s+/, '');
        let task: null | boolean = null;
        const tm = /^\[( |x|X)\]\s+(.*)$/.exec(text);
        if (tm) {
          task = tm[1] !== ' ';
          text = tm[2];
        }
        items.push({ depth: indent >= 2 ? 1 : 0, text, task });
        i++;
        // lazy continuation lines
        while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i]) && /^\s{2,}/.test(lines[i])) {
          items[items.length - 1].text += ` ${lines[i].trim()}`;
          i++;
        }
      }
      let n = 0;
      blocks.push(
        <ul key={key++} className="mb-3 flex flex-col gap-1">
          {items.map((it, j) => {
            if (it.depth === 0) n++;
            return (
              <li key={j} className={cn('flex gap-2 text-secondary', it.depth === 1 && 'pl-5')}>
                <span className="mt-[1px] shrink-0 select-none font-mono text-[0.85em] text-orange/80">
                  {it.task !== null ? (it.task ? '☑' : '☐') : ordered && it.depth === 0 ? `${n}.` : it.depth === 1 ? '◦' : '•'}
                </span>
                <span className={cn('min-w-0', it.task && 'text-muted line-through decoration-muted/50')}>{inline(it.text, `li${key}-${j}`)}</span>
              </li>
            );
          })}
        </ul>,
      );
      continue;
    }

    // paragraph: gather consecutive non-block lines
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !(para.length > 0 && isBlockStart(lines[i]))) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push(
      <p key={key++} className="mb-3 text-secondary">
        {para.map((pl, j) => (
          <Fragment key={j}>
            {j > 0 && ' '}
            {inline(pl, `p${key}-${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return blocks;
}

interface NotePreviewProps {
  /** Raw markdown, frontmatter included. */
  source: string;
  /** 'card' = inspection modal, 'full' = fullscreen reader. */
  variant?: 'card' | 'full';
  className?: string;
}

/** Readable, read-only rendering of a note: frontmatter chips + markdown body. */
export function NotePreview({ source, variant = 'card', className }: NotePreviewProps) {
  const full = variant === 'full';
  const { fields, blocks, truncated, empty } = useMemo(() => {
    const { fields, body } = parseFrontmatter(source);
    const truncated = body.length > MAX_CHARS;
    const text = truncated ? body.slice(0, MAX_CHARS) : body;
    return { fields, blocks: renderBlocks(text, full), truncated, empty: !text.trim() };
  }, [source, full]);

  return (
    <div className={cn('selectable leading-relaxed', full ? 'text-[14px]' : 'text-[12.5px]', className)}>
      <FrontmatterChips fields={fields} max={full ? 24 : 10} className="mb-4" />
      {empty ? <p className="font-mono text-[11px] text-muted">This note has no body text.</p> : blocks}
      {truncated && (
        <p className="mt-2 rounded-lg border border-dashed border-subtle px-3 py-2 font-mono text-[10.5px] text-muted">
          Preview truncated at {MAX_CHARS.toLocaleString('en-US')} characters — open in Obsidian for the full note.
        </p>
      )}
    </div>
  );
}
