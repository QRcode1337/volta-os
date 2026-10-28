// Pure Markdown helpers shared by the Notion-backed apps (client and server safe; no DOM, no React).
// The Notion client emits a small, predictable Markdown dialect (see lib/server/notion/markdown.ts); these helpers
// read it back: tables for the ledger, headings for outline sections (plain text: stripMarkdown in lib/text.ts).
import type { NotionSection } from '@/types/notion';
import { stripMarkdown } from '@/lib/text';

export interface MdTable {
  headers: string[];
  rows: string[][];
}

const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, '|').trim());

/** Every pipe table in `md`, in order. */
export function parseTables(md: string): MdTable[] {
  const lines = md.split('\n');
  const out: MdTable[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^\s*\|.*\|\s*$/.test(lines[i]) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const headers = splitRow(lines[i]);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) rows.push(splitRow(lines[j++]));
      out.push({ headers, rows });
      i = j - 1;
    }
  }
  return out;
}

export interface OutlineOption {
  value: string; // "Draft VO by beat" or "Draft VO by beat › 3. The ~J logs"
  label: string;
  depth: 0 | 1;
}

const H3 = /^### +(.+)$/gm;

/** Choices for "which part of the outline is this file about": every chapter, plus the ### beats inside it. */
export function outlineOptions(sections: NotionSection[]): OutlineOption[] {
  const out: OutlineOption[] = [];
  for (const s of sections) {
    out.push({ value: s.title, label: s.title, depth: 0 });
    for (const m of s.markdown.matchAll(H3)) {
      const t = stripMarkdown(m[1]);
      out.push({ value: `${s.title} › ${t}`, label: t, depth: 1 });
    }
  }
  return out;
}

/** Markdown of the chosen chapter or beat (null when it is not found). */
export function outlineText(sections: NotionSection[], value: string): string | null {
  const [chapter, beat] = value.split(' › ');
  const s = sections.find((x) => x.title === chapter);
  if (!s) return null;
  if (!beat) return s.markdown;
  const lines = s.markdown.split('\n');
  const start = lines.findIndex((l) => /^### /.test(l) && stripMarkdown(l.replace(/^### +/, '')) === beat);
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^### /.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim();
}

/** Best-guess chapter for a file name ("ep3_cold_open_v2.mp4" -> "Cold open"). Null when nothing matches. */
export function guessOutlineValue(fileName: string, sections: NotionSection[]): string | null {
  const n = fileName.toLowerCase().replace(/[_\-.]+/g, ' ');
  const find = (re: RegExp) => sections.find((s) => re.test(s.title.toLowerCase()))?.title ?? null;
  if (/\bcold\b/.test(n)) return find(/cold open/);
  if (/\b(ending|outro)\b/.test(n)) return find(/^ending/);
  if (/\bpackag|thumb/.test(n)) return find(/packaging/);
  const beat = n.match(/\bbeat\s*(\d+)\b/);
  if (beat) {
    const vo = sections.find((s) => /draft vo/i.test(s.title));
    if (vo) {
      const hit = [...vo.markdown.matchAll(H3)].map((m) => stripMarkdown(m[1])).find((t) => t.startsWith(`${beat[1]}.`));
      if (hit) return `${vo.title} › ${hit}`;
    }
  }
  return null;
}
