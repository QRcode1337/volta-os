'use client';

import { memo, useMemo, type ReactNode } from 'react';

// Tiny read-only markdown renderer tuned for Obsidian notes: frontmatter (values rendered inline, lists as
// chips), headings, lists, task lists, quotes + callouts, hr, tables, code fences (simple syntax tinting),
// HTML comments, and inline code / bold / italic / ==highlight== / #tags / [links](url) / [links](note.md) /
// [[wikilinks|alias]] / ![[embeds]]. Links between notes open in the inspector; ones that don't resolve
// render dimmed without an underline, so inert text never looks clickable.

const MAX_RENDER_CHARS = 100_000;

const KEYWORDS =
  /\b(const|let|var|function|return|if|else|for|while|import|from|export|default|class|new|async|await|true|false|null|undefined|type|interface|def|in|of)\b/;

const TOKEN_RE =
  /(\/\/.*$|#(?!!).*$|<!--.*?-->)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_][\w-]*\b)|(\s+|[^\s\w]+)/g;

/** 'wiki' = an Obsidian [[target]] (no alias/heading); 'path' = a markdown-link href (URI-decoded, no #anchor). */
export type LinkKind = 'wiki' | 'path';

export interface MarkdownViewProps {
  source: string;
  /** Resolve a link target to a note id, or null when it isn't a known note. Keep it stable (useCallback). */
  resolveLink?: (target: string, kind: LinkKind) => string | null;
  /** Open a note id returned by `resolveLink`. Keep it stable (useCallback). */
  onOpenNote?: (id: string) => void;
}

interface Ctx {
  resolveLink?: (target: string, kind: LinkKind) => string | null;
  onOpenNote?: (id: string) => void;
}

const LINK_CLS = 'text-orange underline decoration-orange/40 underline-offset-2 transition-colors hover:decoration-orange';
const INERT_CLS = 'cursor-default text-orange/45';

/** A link to another note: a button when it resolves, a dimmed un-underlined span otherwise. */
function noteLink(key: string, display: ReactNode, target: string, kind: LinkKind, ctx: Ctx, title: string): ReactNode {
  const id = target && ctx.onOpenNote ? (ctx.resolveLink?.(target, kind) ?? null) : null;
  return id ? (
    <button key={key} type="button" onClick={() => ctx.onOpenNote?.(id)} className={LINK_CLS} title={`Open ${title}`}>
      {display}
    </button>
  ) : (
    <span key={key} className={INERT_CLS} title={`${title} — not found in the indexed vaults`}>
      {display}
    </span>
  );
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function tintLine(line: string, lang: string, key: number): ReactNode {
  const parts: ReactNode[] = [];
  const shellish = lang === 'sh' || lang === 'bash' || lang === 'yaml' || lang === 'yml' || lang === 'py' || lang === 'python';
  let m: RegExpExecArray | null;
  let i = 0;
  const re = new RegExp(TOKEN_RE.source, 'gm');
  while ((m = re.exec(line)) !== null) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    const [tok, comment, str, num, word] = m;
    let color: string | undefined;
    if (comment && (comment.startsWith('//') || comment.startsWith('<!--') || shellish)) color = '#6E6A61';
    else if (comment) color = undefined;
    else if (str) color = '#22C55E';
    else if (num) color = '#F5A623';
    else if (word && KEYWORDS.test(word)) color = '#A855F7';
    else if (word && /^[A-Z][A-Za-z0-9]+$/.test(word)) color = '#14B8A6';
    parts.push(
      <span key={i++} style={color ? { color } : undefined}>
        {tok}
      </span>,
    );
  }
  return (
    <div key={key} className="whitespace-pre">
      {parts.length ? parts : ' '}
    </div>
  );
}

const INLINE_RE =
  /(!?\[\[[^\]\n]+\]\])|(`[^`]+`)|(\*\*[^*]+\*\*)|(==[^=\n]+==)|(\*[^*\s][^*]*\*|(?<!\w)_[^_\s][^_]*_(?!\w))|(\[[^\]]+\]\([^)\s]+\))|(<!--.*?-->)|((?:^|(?<=\s))#[A-Za-z][\w/-]*)/g;

function wikiTarget(inner: string): { target: string; display: string } {
  const [left, alias] = inner.split('|');
  const hashAt = left.search(/[#^]/);
  const target = (hashAt >= 0 ? left.slice(0, hashAt) : left).trim();
  const heading = hashAt >= 0 ? left.slice(hashAt + 1).trim() : '';
  const display = alias?.trim() || (heading ? `${target || 'this note'} › ${heading}` : target);
  return { target, display };
}

function inline(text: string, keyBase: string, ctx: Ctx): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  // Fresh regex per call: inline() recurses (bold → inner spans), so a shared /g lastIndex would loop forever.
  const re = new RegExp(INLINE_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const key = `${keyBase}-${k++}`;
    if (m[1]) {
      const embed = t.startsWith('!');
      const { target, display } = wikiTarget(t.slice(embed ? 3 : 2, -2));
      if (embed) {
        out.push(
          <span key={key} className="inline-flex items-center gap-1 rounded border border-subtle bg-panel-hover px-1.5 py-px font-mono text-[0.82em] text-muted">
            ⧉ {display}
          </span>,
        );
      } else {
        out.push(noteLink(key, display, target, 'wiki', ctx, `[[${target}]]`));
      }
    } else if (m[2]) {
      out.push(
        <code key={key} className="rounded bg-panel-hover px-1 py-px font-mono text-[0.86em] text-amber">
          {t.slice(1, -1)}
        </code>,
      );
    } else if (m[3]) {
      out.push(
        <strong key={key} className="font-semibold text-paper">
          {inline(t.slice(2, -2), key, ctx)}
        </strong>,
      );
    } else if (m[4]) {
      out.push(
        <mark key={key} className="rounded-sm bg-amber/20 px-0.5 text-paper">
          {t.slice(2, -2)}
        </mark>,
      );
    } else if (m[5]) {
      out.push(
        <em key={key} className="font-serif italic text-paper">
          {t.slice(1, -1)}
        </em>,
      );
    } else if (m[6]) {
      const label = t.slice(1, t.indexOf(']'));
      const href = t.slice(t.indexOf('](') + 2, -1).replace(/^<|>$/g, '');
      if (/^(https?:|mailto:)/i.test(href)) {
        out.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLS}>
            {label}
          </a>,
        );
      } else {
        // Relative link to another note, e.g. [ErisMorn](erismorn.md) or (../summaries/2026-10/A%20B.md#x).
        const hashAt = href.indexOf('#');
        const path = safeDecode(hashAt >= 0 ? href.slice(0, hashAt) : href).trim();
        const isNote = !!path && (/\.md$/i.test(path) || !/\.[a-z0-9]{1,5}$/i.test(path));
        out.push(
          isNote ? (
            noteLink(key, label, /\.md$/i.test(path) ? path : `${path}.md`, 'path', ctx, path)
          ) : (
            <span key={key} className={INERT_CLS} title={path ? `${path} (not a note)` : 'Link within this note'}>
              {label}
            </span>
          ),
        );
      }
    } else if (m[7]) {
      out.push(
        <span key={key} className="font-mono text-[0.85em] text-muted">
          {t}
        </span>,
      );
    } else if (m[8]) {
      out.push(
        <span key={key} className="rounded-full bg-purple/15 px-1.5 py-px font-mono text-[0.82em] text-purple">
          {t.trim()}
        </span>,
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Inline-render several source lines, keeping Obsidian's soft line breaks. */
function lines2(lines: string[], keyBase: string, ctx: Ctx): ReactNode[] {
  const out: ReactNode[] = [];
  lines.forEach((l, j) => {
    if (j > 0) out.push(<br key={`${keyBase}-br${j}`} />);
    out.push(...inline(l, `${keyBase}-${j}`, ctx));
  });
  return out;
}

const CALLOUT_COLORS: Record<string, string> = {
  note: '#3B82F6',
  info: '#3B82F6',
  tip: '#14B8A6',
  success: '#22C55E',
  question: '#F5A623',
  warning: '#F5A623',
  danger: '#EF4444',
  bug: '#EF4444',
  example: '#A855F7',
  quote: '#A39E93',
  abstract: '#06B6D4',
  summary: '#06B6D4',
  tldr: '#06B6D4',
  todo: '#3B82F6',
};

const unquote = (v: string) => v.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

/** YAML-ish frontmatter: `key: value` rows rendered inline (so [[links]] work); list items become chips. */
function Frontmatter({ lines, ctx }: { lines: string[]; ctx: Ctx }) {
  const rows: { key: string; value: string; items: string[]; extra: string[] }[] = [];
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const item = /^\s*-\s+(.*)$/.exec(raw);
    const idx = raw.indexOf(':');
    if (!item && idx > 0 && !/^\s/.test(raw)) {
      const value = raw.slice(idx + 1).trim();
      const arr = /^\[(?!\[)(.*)\]$/.exec(value); // inline list: tags: [a, b]
      rows.push({
        key: raw.slice(0, idx),
        value: arr ? '' : value,
        items: arr ? arr[1].split(',').map((x) => x.trim()).filter(Boolean) : [],
        extra: [],
      });
      continue;
    }
    if (!rows.length) rows.push({ key: '', value: '', items: [], extra: [] });
    const cur = rows[rows.length - 1];
    if (item) cur.items.push(item[1].trim());
    else cur.extra.push(raw.trim());
  }
  return (
    <div className="mb-4 rounded-lg border border-subtle bg-obsidian/60 p-3 font-mono text-[11px] leading-5">
      <div className="hud-label mb-1.5 !text-[9px] !text-muted">FRONTMATTER</div>
      {rows.map((r, j) => (
        <div key={j} className="flex gap-2">
          {r.key && (
            <>
              <span className="shrink-0 text-teal">{r.key}</span>
              <span className="text-muted">:</span>
            </>
          )}
          <div className="min-w-0 flex-1 text-paper [overflow-wrap:anywhere]">
            {r.value && <span>{inline(unquote(r.value), `fm${j}`, ctx)}</span>}
            {r.items.length > 0 && (
              <div className="flex flex-wrap gap-1 py-0.5">
                {r.items.map((it, k) => (
                  <span key={k} className="inline-flex max-w-full items-center rounded-full border border-subtle bg-panel-elevated px-1.5 leading-[18px] text-secondary">
                    <span className="min-w-0 truncate">{inline(unquote(it), `fm${j}-${k}`, ctx)}</span>
                  </span>
                ))}
              </div>
            )}
            {r.extra.map((e, k) => (
              <div key={`x${k}`} className="text-secondary">
                {inline(e, `fmx${j}-${k}`, ctx)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Read-only render of an Obsidian note. Memoised (and the parse cached) so typing elsewhere doesn't re-parse. */
export const MarkdownView = memo(function MarkdownView({ source, resolveLink, onOpenNote }: MarkdownViewProps) {
  const blocks = useMemo(() => renderBlocks(source, { resolveLink, onOpenNote }), [source, resolveLink, onOpenNote]);
  const truncated = source.length > MAX_RENDER_CHARS;
  return (
    <div className="selectable">
      {blocks}
      {truncated && (
        <div className="mt-4 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 font-mono text-[10.5px] text-amber">
          Preview truncated at {MAX_RENDER_CHARS.toLocaleString('en-US')} of {source.length.toLocaleString('en-US')} characters — open the note in Obsidian for the rest.
        </div>
      )}
    </div>
  );
});

function renderBlocks(source: string, ctx: Ctx): ReactNode[] {
  const truncated = source.length > MAX_RENDER_CHARS;
  const text = truncated ? source.slice(0, MAX_RENDER_CHARS) : source;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  // Frontmatter
  if (lines[0]?.trim() === '---') {
    let end = -1;
    for (let j = 1; j < lines.length; j++) {
      if (lines[j].trim() === '---') {
        end = j;
        break;
      }
    }
    if (end > 0) {
      blocks.push(<Frontmatter key={key++} lines={lines.slice(1, end)} ctx={ctx} />);
      i = end + 1;
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Code fence
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      const fence = trimmed.slice(0, 3);
      const lang = trimmed.slice(3).trim().toLowerCase();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) body.push(lines[i++]);
      i++;
      blocks.push(
        <div key={key++} className="mb-3 overflow-hidden rounded-lg border border-subtle bg-obsidian">
          {lang && <div className="border-b border-subtle px-3 py-1 font-mono text-[9px] uppercase tracking-widest text-muted">{lang}</div>}
          <pre className="hud-scroll overflow-x-auto px-3 py-2 font-mono text-[11px] leading-5 text-secondary">
            {body.map((l, j) => tintLine(l, lang, j))}
          </pre>
        </div>,
      );
      continue;
    }

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      const level = h[1].length;
      const cls =
        level === 1
          ? 'mb-3 mt-1 text-[22px] font-bold tracking-tight text-paper'
          : level === 2
            ? 'mb-2 mt-5 border-b border-subtle pb-1 text-[15px] font-semibold text-paper'
            : 'mb-1.5 mt-4 text-[13px] font-semibold uppercase tracking-wide text-secondary';
      blocks.push(
        <div key={key++} className={cls}>
          {level === 2 && <span className="mr-2 font-doto text-orange">#</span>}
          {inline(h[2], `h${key}`, ctx)}
        </div>,
      );
      i++;
      continue;
    }

    // HR
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<hr key={key++} className="my-4 border-subtle" />);
      i++;
      continue;
    }

    // HTML comment block
    if (trimmed.startsWith('<!--')) {
      const body: string[] = [];
      while (i < lines.length) {
        body.push(lines[i]);
        if (lines[i].includes('-->')) {
          i++;
          break;
        }
        i++;
      }
      blocks.push(
        <div key={key++} className="mb-2 font-mono text-[10.5px] text-muted">
          {body.join(' ')}
        </div>,
      );
      continue;
    }

    // Lists (with one level of visual indent)
    if (/^([-*+]|\d+\.)\s+/.test(trimmed)) {
      const ordered = /^\d+\./.test(trimmed);
      const items: { text: string; depth: number }[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const indent = /^\s*/.exec(lines[i])?.[0].replace(/\t/g, '  ').length ?? 0;
        items.push({ text: lines[i].trim().replace(/^([-*+]|\d+\.)\s+/, ''), depth: Math.min(3, Math.floor(indent / 2)) });
        i++;
      }
      blocks.push(
        <ul key={key++} className="mb-3 space-y-1 text-[13px] leading-relaxed text-secondary">
          {items.map((it, j) => {
            const task = /^\[( |x)\]\s+/i.exec(it.text);
            return (
              <li key={j} className="flex gap-2" style={{ paddingLeft: it.depth * 14 }}>
                <span className="mt-[1px] w-4 shrink-0 text-right font-mono text-[11px] text-orange">
                  {task ? (task[1].toLowerCase() === 'x' ? '☑' : '☐') : ordered && it.depth === 0 ? `${j + 1}.` : '•'}
                </span>
                <span className={task && task[1].toLowerCase() === 'x' ? 'text-muted line-through' : undefined}>
                  {inline(task ? it.text.slice(task[0].length) : it.text, `li${key}-${j}`, ctx)}
                </span>
              </li>
            );
          })}
        </ul>,
      );
      continue;
    }

    // Blockquote / callout
    if (trimmed.startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) body.push(lines[i++].trim().replace(/^>\s?/, ''));
      const callout = /^\[!(\w+)\][+-]?\s*(.*)$/.exec(body[0] ?? '');
      if (callout) {
        const type = callout[1].toLowerCase();
        const color = CALLOUT_COLORS[type] ?? '#FF5500';
        const rest = body.slice(1).filter((l, j, arr) => l || (j > 0 && j < arr.length - 1));
        blocks.push(
          <div key={key++} className="mb-3 rounded-lg border px-3 py-2" style={{ borderColor: `${color}55`, background: `${color}12` }}>
            <div className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color }}>
              {callout[2] ? inline(callout[2], `co${key}`, ctx) : type}
            </div>
            {rest.length > 0 && <div className="text-[13px] leading-relaxed text-secondary">{lines2(rest, `cob${key}`, ctx)}</div>}
          </div>,
        );
      } else {
        blocks.push(
          <blockquote key={key++} className="mb-3 border-l-2 border-orange/60 pl-3 font-serif text-[14px] italic text-secondary">
            {lines2(body, `bq${key}`, ctx)}
          </blockquote>,
        );
      }
      continue;
    }

    // Table
    if (trimmed.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      blocks.push(
        <div key={key++} className="hud-scroll mb-3 overflow-x-auto">
          <table className="w-full border-collapse font-mono text-[11px]">
            <tbody>
              {rows.map((r, j) => (
                <tr key={j} className={j === 0 ? 'text-paper' : 'text-secondary'}>
                  {r.map((c, k2) => (
                    <td key={k2} className="border border-subtle px-2 py-1">
                      {inline(c, `td${key}-${j}-${k2}`, ctx)}
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

    // Paragraph (soft line breaks kept, as Obsidian does by default)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|```|~~~|>|[-*+]\s|\d+\.\s|\||<!--)/.test(lines[i].trim()) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length === 0) {
      para.push(trimmed);
      i++;
    }
    blocks.push(
      <p key={key++} className="mb-3 break-words text-[13px] leading-relaxed text-secondary">
        {lines2(para, `p${key}`, ctx)}
      </p>,
    );
  }

  return blocks;
}
