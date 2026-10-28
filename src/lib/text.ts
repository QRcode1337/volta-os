// Pure text helpers shared by client and server code: note frontmatter, markdown → plain text, Obsidian links.
// No Node, server-only or '@/…' imports, so client components and framework-free modules can import this file.
// Regex-level on purpose: no markdown/YAML library.

// ───────────────────────── frontmatter ─────────────────────────

export interface FrontmatterField {
  /** The key as written (case kept). */
  key: string;
  /** Scalar value, trimmed, matching quotes removed; a `|`/`>` block scalar is joined; '' for a key followed by `- item` lines. */
  value: string;
  /** List values: `[a, b]` inline or `- item` lines below the key; null for a plain scalar. */
  items: string[] | null;
}

export interface Frontmatter {
  /** True when the text starts with a `---` … `---` block. */
  has: boolean;
  /** The raw text between the fences ('' when there is none). */
  block: string;
  /** Top-level fields in order (indented/nested keys are not fields). */
  fields: FrontmatterField[];
  /** Everything after the closing fence line (the whole text when there is no frontmatter). */
  body: string;
  /** Scalar value of a key, matched case-insensitively; the last occurrence wins. */
  get(key: string): string | undefined;
  /** List value of a key (case-insensitive): its items, else its non-empty scalar as one item, else []. */
  list(key: string): string[];
}

// Opening fence, optional block, closing fence on a line of its own. Accepts CRLF and a leading BOM.
const FM_RE = /^﻿?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;
// Top-level `key: value`; keys may hold letters, digits, `_`, `-` and `.`.
const KEY_RE = /^([A-Za-z0-9_][\w.-]*)[ \t]*:(?:[ \t]*(.*))?$/;
const ITEM_RE = /^[ \t]*-(?:[ \t]+(.*))?$/;
const BLOCK_SCALAR_RE = /^([|>])[+-]?\d*$/;

function unquote(v: string): string {
  const s = v.trim();
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) return s.slice(1, -1);
  return s;
}

function inlineList(v: string): string[] {
  return v
    .slice(1, -1)
    .split(',')
    .map(unquote)
    .filter(Boolean);
}

/** Parses a `---` YAML-ish frontmatter block: scalars, quoted strings, `[a, b]` and `- item` lists, `|`/`>` block scalars. */
export function parseFrontmatter(src: string): Frontmatter {
  const m = FM_RE.exec(src);
  const block = m?.[1] ?? '';
  const fields: FrontmatterField[] = [];
  if (m) {
    const lines = block.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const kv = KEY_RE.exec(lines[i]);
      if (!kv) continue;
      const raw = (kv[2] ?? '').trim();
      const field: FrontmatterField = { key: kv[1], value: '', items: null };
      const scalar = BLOCK_SCALAR_RE.exec(raw);
      if (scalar) {
        const parts: string[] = [];
        while (i + 1 < lines.length && (/^[ \t]/.test(lines[i + 1]) || !lines[i + 1].trim())) parts.push(lines[++i].trim());
        field.value = (scalar[1] === '|' ? parts.join('\n') : parts.filter(Boolean).join(' ')).trim();
      } else if (!raw) {
        const items: string[] = [];
        while (i + 1 < lines.length) {
          const next = lines[i + 1];
          const item = ITEM_RE.exec(next);
          if (item) items.push(unquote(item[1] ?? ''));
          else if (next.trim()) break;
          i++;
        }
        const kept = items.filter(Boolean);
        if (kept.length) field.items = kept;
      } else if (raw.startsWith('[') && raw.endsWith(']')) {
        field.value = raw;
        field.items = inlineList(raw);
      } else {
        field.value = unquote(raw);
      }
      fields.push(field);
    }
  }
  const find = (key: string): FrontmatterField | undefined => {
    const k = key.toLowerCase();
    for (let i = fields.length - 1; i >= 0; i--) if (fields[i].key.toLowerCase() === k) return fields[i];
    return undefined;
  };
  return {
    has: !!m,
    block,
    fields,
    body: m ? src.slice(m[0].length) : src,
    get: (key) => find(key)?.value,
    list: (key) => {
      const f = find(key);
      if (!f) return [];
      return f.items ?? (f.value ? [f.value] : []);
    },
  };
}

// ───────────────────────── markdown → plain text ─────────────────────────

export interface StripMarkdownOptions {
  /** Collapse every whitespace run, newlines included, to one space (excerpts, snippets). Default: keep line breaks. */
  oneLine?: boolean;
}

/**
 * Markdown (incl. Obsidian and Notion dialects) → readable text: drops comments, `[SRC…]` tags, code fences, rules,
 * table separators, heading/quote markers and images; keeps link/wikilink labels and emphasised words; `*`/`+`
 * bullets become `- `. Length caps belong to the caller.
 */
export function stripMarkdown(md: string, opts: StripMarkdownOptions = {}): string {
  const t = md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\[SRC:?[^\]]*\]/gi, '')
    .replace(/^[ \t]*(?:```|~~~).*$/gm, '')
    .replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, '')
    .replace(/^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$/gm, '')
    .replace(/^[ \t]*\|(.*)$/gm, (_, row: string) =>
      row
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
        .join(' '),
    )
    .replace(/^[ \t]*(?:>[ \t]?)+/gm, '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^([ \t]*)[*+•][ \t]+/gm, '$1- ')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, label?: string) => label ?? target)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^_\w])_(?!\s)([^_]+?)_(?!\w)/g, '$1$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/==(.*?)==/g, '$1')
    .replace(/\*{2,}|`+/g, '');
  return opts.oneLine
    ? t.replace(/\s+/g, ' ').trim()
    : t
        .replace(/[ \t]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .trim();
}

// ───────────────────────── Obsidian ─────────────────────────

/** `obsidian://open` link for a vault (id or name) and, optionally, a vault-relative note path (`.md` dropped). */
export function obsidianUrl(vault: string, file?: string): string {
  const base = `obsidian://open?vault=${encodeURIComponent(vault)}`;
  return file ? `${base}&file=${encodeURIComponent(file.replace(/\.md$/i, ''))}` : base;
}
