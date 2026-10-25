import 'server-only';
import type { NotionPageRef } from '@/types/notion';
import { pageUrl, stripDashes, type RawBlock, type RichText } from './client';

// Notion block tree → Markdown. Covers headings (incl. toggle headings), paragraphs, bulleted/numbered/to-do lists,
// toggles, callouts, quotes, code, dividers, tables, columns, synced blocks, child pages, page/date/user mentions,
// links and bookmarks. Files, images, PDFs, audio and video are reduced to their names (signed URLs expire in an hour
// and must not be persisted). Output is plain Markdown that the Scripts/Recos renderer understands.

export interface BlockNode extends RawBlock {
  kids: BlockNode[];
}

export interface ConvertResult {
  markdown: string;
  children: NotionPageRef[];
}

const FILE_TYPES = new Set(['image', 'file', 'pdf', 'video', 'audio']);

function rtText(items: RichText[] | undefined, children: NotionPageRef[]): string {
  if (!items?.length) return '';
  return items
    .map((t) => {
      let s = t.plain_text ?? '';
      if (t.type === 'equation') return `\`${t.equation?.expression ?? s}\``;
      if (t.type === 'mention' && t.mention) {
        const m = t.mention;
        if (m.page) {
          const id = stripDashes(m.page.id);
          const title = s.trim() || 'Untitled';
          if (!children.some((c) => c.id === id)) children.push({ id, title, url: pageUrl(id) });
          return `[${title}](${pageUrl(id)})`;
        }
        if (m.database) return `[${s.trim() || 'Database'}](${pageUrl(m.database.id)})`;
        if (m.user) return `@${(m.user.name ?? s).replace(/^@/, '')}`;
        if (m.date) return m.date.end ? `${m.date.start} → ${m.date.end}` : m.date.start;
        const href = m.link_mention?.href ?? m.link_preview?.url ?? t.href;
        return href ? `[${m.link_mention?.title ?? (s || href)}](${href})` : s;
      }
      if (!s) return '';
      const a = t.annotations ?? {};
      if (a.code) s = `\`${s}\``;
      if (a.bold) s = `**${s}**`;
      if (a.italic) s = `*${s}*`;
      if (a.strikethrough) s = `~~${s}~~`;
      const href = t.href ?? t.text?.link?.url;
      if (href) s = `[${s}](${href})`;
      return s;
    })
    .join('');
}

function prop(b: RawBlock): Record<string, unknown> {
  return (b[b.type] as Record<string, unknown>) ?? {};
}

function fileName(b: RawBlock): string {
  const p = prop(b);
  const caption = rtText(p.caption as RichText[] | undefined, []);
  const f = (p.file ?? p.external) as { url?: string } | undefined;
  const raw = f?.url ? decodeURIComponent(f.url.split('?')[0].split('/').pop() ?? '') : '';
  const name = (p.name as string | undefined) || raw || 'file';
  return caption ? `${name} — ${caption}` : name;
}

function indent(text: string, pad: string): string {
  return text
    .split('\n')
    .map((l) => (l ? pad + l : l))
    .join('\n');
}

function convertBlocks(nodes: BlockNode[], children: NotionPageRef[], depth: number): string {
  const out: string[] = [];
  let numbered = 0;
  for (const n of nodes) {
    if (n.type !== 'numbered_list_item') numbered = 0;
    const md = convertOne(n, children, depth, () => ++numbered);
    if (md !== null) out.push(md);
  }
  // Consecutive list items stay tight (single newline); everything else is a paragraph apart.
  let res = '';
  for (let i = 0; i < out.length; i++) {
    const isList = /^\s*([-*]|\d+\.)\s/.test(out[i]);
    const prevList = i > 0 && /^\s*([-*]|\d+\.)\s/.test(out[i - 1]);
    res += i === 0 ? out[i] : isList && prevList ? `\n${out[i]}` : `\n\n${out[i]}`;
  }
  return res;
}

function kidsMd(n: BlockNode, children: NotionPageRef[], depth: number): string {
  return n.kids.length ? convertBlocks(n.kids, children, depth + 1) : '';
}

function convertOne(n: BlockNode, children: NotionPageRef[], depth: number, nextNumber: () => number): string | null {
  const p = prop(n);
  const text = () => rtText(p.rich_text as RichText[] | undefined, children);
  switch (n.type) {
    case 'paragraph': {
      const t = text();
      const k = kidsMd(n, children, depth);
      return [t, k].filter(Boolean).join('\n\n') || null;
    }
    case 'heading_1':
    case 'heading_2':
    case 'heading_3': {
      const level = Number(n.type.slice(-1));
      const head = `${'#'.repeat(level)} ${text().trim()}`;
      const k = kidsMd(n, children, depth);
      return k ? `${head}\n\n${k}` : head;
    }
    case 'bulleted_list_item':
    case 'numbered_list_item':
    case 'to_do': {
      const marker = n.type === 'bulleted_list_item' ? '-' : n.type === 'numbered_list_item' ? `${nextNumber()}.` : `- [${p.checked ? 'x' : ' '}]`;
      const k = kidsMd(n, children, depth);
      const line = `${marker} ${text()}`;
      return k ? `${line}\n${indent(k, '  ')}` : line;
    }
    case 'toggle': {
      const k = kidsMd(n, children, depth);
      const head = `▸ **${text().trim() || 'Toggle'}**`;
      return k ? `${head}\n\n${k}` : head;
    }
    case 'callout': {
      const icon = (p.icon as { emoji?: string } | null)?.emoji;
      const k = kidsMd(n, children, depth);
      const body = [icon ? `${icon} ${text()}` : text(), k].filter(Boolean).join('\n\n');
      return indent(body, '> ').replace(/^(?!> )/gm, '> ');
    }
    case 'quote': {
      const k = kidsMd(n, children, depth);
      return indent([text(), k].filter(Boolean).join('\n\n'), '> ').replace(/^(?!> )/gm, '> ');
    }
    case 'code': {
      const lang = String(p.language ?? '').replace('plain text', '');
      const code = ((p.rich_text as RichText[]) ?? []).map((t) => t.plain_text).join('');
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }
    case 'equation':
      return `\`${String(p.expression ?? '')}\``;
    case 'divider':
      return '---';
    case 'child_page': {
      const title = String(p.title ?? '').trim() || 'Untitled';
      const id = stripDashes(n.id);
      if (!children.some((c) => c.id === id)) children.push({ id, title, url: pageUrl(id) });
      return `📄 [${title}](${pageUrl(id)})`;
    }
    case 'child_database': {
      const title = String(p.title ?? '').trim() || 'Database';
      return `🗂 [${title}](${pageUrl(n.id)})`;
    }
    case 'link_to_page': {
      const id = (p.page_id ?? p.database_id) as string | undefined;
      return id ? `📄 [Linked page](${pageUrl(id)})` : null;
    }
    case 'bookmark':
    case 'embed':
    case 'link_preview': {
      const url = String(p.url ?? '');
      const cap = rtText(p.caption as RichText[] | undefined, children);
      return url ? `🔗 [${cap || url}](${url})` : null;
    }
    case 'table': {
      const rows = n.kids.filter((r) => r.type === 'table_row');
      if (!rows.length) return null;
      const cells = rows.map((r) => ((prop(r).cells as RichText[][]) ?? []).map((c) => rtText(c, children).replace(/\|/g, '\\|').replace(/\n/g, ' ')));
      const width = Math.max(...cells.map((r) => r.length));
      const pad = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
      const hasHeader = p.has_column_header !== false;
      const head = hasHeader ? cells[0] : Array.from({ length: width }, () => '');
      const body = hasHeader ? cells.slice(1) : cells;
      return [pad(head), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...body.map(pad)].join('\n');
    }
    case 'column_list':
    case 'column':
    case 'synced_block':
    case 'template':
      return kidsMd(n, children, depth - 1) || null;
    case 'table_of_contents':
    case 'breadcrumb':
    case 'unsupported':
      return null;
    default:
      if (FILE_TYPES.has(n.type)) return `📎 ${fileName(n)}`;
      return null;
  }
}

export function blocksToMarkdown(nodes: BlockNode[]): ConvertResult {
  const children: NotionPageRef[] = [];
  const markdown = convertBlocks(nodes, children, 0).replace(/\n{3,}/g, '\n\n').trim();
  return { markdown, children };
}

/** Plain text of a block's own rich text (headings, paragraphs); used when classifying index entries. */
export function blockPlainText(b: RawBlock): string {
  const p = prop(b);
  return (((p.rich_text as RichText[]) ?? []).map((t) => t.plain_text).join('') || String(p.title ?? '')).trim();
}

/** Page mentions and notion.so links inside a block's rich text (used for index entries that are links, not child pages). */
export function blockPageMentions(b: RawBlock): NotionPageRef[] {
  const found: NotionPageRef[] = [];
  const items = (prop(b).rich_text as RichText[]) ?? [];
  for (const t of items) {
    if (t.type === 'mention' && t.mention?.page) {
      const id = stripDashes(t.mention.page.id);
      found.push({ id, title: t.plain_text.trim() || 'Untitled', url: pageUrl(id) });
    } else if (t.href) {
      const m = t.href.match(/notion\.so\/(?:[^/?#]*-)?([0-9a-f]{32})/i);
      if (m) found.push({ id: m[1].toLowerCase(), title: t.plain_text.trim() || 'Untitled', url: pageUrl(m[1]) });
    }
  }
  return found;
}
