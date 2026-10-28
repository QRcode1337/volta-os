import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SynthesisDetail, SynthesisItem, VaultMention } from '@/components/research/types';
import { obsidianUrl, parseFrontmatter, stripMarkdown } from '@/lib/text';
import { cached } from '../sources/cache';
import { mapLimit } from '../proc';
import { walkVault, type VaultFile } from '../vault-walk';
import { loadConfig } from './config';

// The Voltamachine Obsidian vault (Synthesis/, 00-Meta, 01-Quantum, 03-Esoterica, 04-UAP) and ~/ErisMorn/voltamachine/synthesis.
// Local notes only: an iCloud placeholder (size > 0 && blocks === 0) is counted and never opened.
// Leaked model reasoning ("Thinking... ...done thinking.") is stripped from everything shown.

const TTL_MS = 60_000;
const MAX_NOTE_BYTES = 600_000;

export interface Note {
  key: string;
  source: 'vault' | 'erismorn';
  /** Path below the vault (or synthesis) root, with extension. */
  rel: string;
  file: string;
  stem: string;
  title: string;
  folder: string;
  date: string | null;
  kind: 'batch' | 'topic';
  tags: string[];
  papers: number | null;
  words: number;
  excerpt: string;
  strippedThinking: boolean;
  /** Cleaned markdown (unmasked; the research routes mask whole responses). */
  text: string;
  /** Lower-case, punctuation-free text padded with spaces, for mention search. */
  norm: string;
  abs: string;
}
export interface VaultData {
  notes: Note[];
  byKey: Map<string, Note>;
  local: number;
  icloud: number;
  stripped: number;
  exists: boolean;
  loadedAt: number;
}

export const norm = (t: string) => ` ${t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

/** Terminal control codes captured with the model output: "cursor left N, erase" removes the N characters before it (a word the terminal re-wrapped). */
export function stripAnsi(t: string): string {
  if (!t.includes('\x1b')) return t;
  let out = '';
  let last = 0;
  const re = /\x1b\[(\d*)D\x1b\[K(\r?\n)?|\x1b\[[0-9;?]*[A-Za-z]/g;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    out += t.slice(last, m.index);
    if (m[1] !== undefined) out = out.slice(0, Math.max(0, out.length - (Number(m[1]) || 1)));
    last = re.lastIndex;
  }
  return out + t.slice(last);
}

/** Removes leaked reasoning: "Thinking... ... ...done thinking." (or, unterminated, up to the next heading), and <think> blocks. */
export function stripThinking(md: string): { text: string; stripped: boolean } {
  let text = md;
  let stripped = false;
  if (/<think>[\s\S]*?<\/think>/i.test(text)) {
    text = text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '');
    stripped = true;
  }
  for (let guard = 0; guard < 4; guard++) {
    const m = /^[ \t>*_#-]*Thinking\.{3}[ \t]*$/m.exec(text);
    if (!m) break;
    const start = m.index;
    const done = /^[ \t]*\.{3}done thinking\.?[ \t]*$/im.exec(text.slice(start));
    let end: number;
    if (done) end = start + done.index + done[0].length;
    else {
      const heading = /^#{1,6} /m.exec(text.slice(start + m[0].length));
      end = heading ? start + m[0].length + heading.index : text.length;
    }
    text = `${text.slice(0, start)}${text.slice(end).replace(/^\s*\n/, '')}`;
    stripped = true;
  }
  return { text, stripped };
}

const plain = (md: string) => stripMarkdown(md, { oneLine: true });

function excerptOf(body: string): string {
  const exec = /^#{1,3} +Executive Summary\s*\n+([\s\S]*?)(?=\n#{1,3} |$)/im.exec(body);
  const pool = (exec ? exec[1] : body).split(/\n{2,}/);
  for (const para of pool) {
    const t = plain(para);
    if (t.length < 70 || /^(papers indexed|date|source|status|tags?)\b/i.test(t) || /^[|:-]+/.test(para.trim())) continue;
    if (/^#{1,6} /.test(para.trim()) && para.trim().split('\n').length === 1) continue;
    return t.length > 280 ? `${t.slice(0, 277).trimEnd()}...` : t;
  }
  return '';
}

function parseNote(source: Note['source'], rel: string, abs: string, raw: string, mtimeMs: number): Note {
  const { text: cleaned, stripped } = stripThinking(stripAnsi(raw));
  const fm = parseFrontmatter(cleaned);
  const { body } = fm;
  const file = path.basename(rel);
  const stem = file.replace(/\.md$/i, '');
  const h1 = /^#\s+(.+)$/m.exec(body)?.[1];
  const date = fm.get('date') || /^(\d{4}-\d{2}-\d{2})/.exec(stem)?.[1] || new Date(mtimeMs).toISOString().slice(0, 10);
  const papers = Number(fm.get('papers_reviewed') ?? /\*\*Papers indexed:\*\*\s*(\d+)/.exec(body)?.[1]);
  const tags = fm
    .list('tags')
    .flatMap((t) => t.replace(/[[\]]/g, '').split(/[,\s]+/))
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 12);
  const title = plain(fm.get('topic') || h1 || stem.replace(/[-_]+/g, ' '));
  return {
    key: `${source}:${rel}`,
    source,
    rel,
    file,
    stem,
    title: title || stem,
    folder: rel.includes('/') ? rel.split('/')[0] : '',
    date: /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : null,
    kind: /-batch(-\d+)?$/i.test(stem) ? 'batch' : 'topic',
    tags,
    papers: Number.isFinite(papers) ? papers : null,
    words: body.split(/\s+/).filter(Boolean).length,
    excerpt: excerptOf(body),
    strippedThinking: stripped,
    text: cleaned,
    norm: norm(`${title} ${body}`),
    abs,
  };
}

/** Notes up to two folder levels below `dir` (dot-prefixed names and symlinks skipped), with their stat. */
async function listMd(dir: string): Promise<VaultFile[]> {
  const out: VaultFile[] = [];
  await walkVault(dir, { onFile: (f) => out.push(f), maxDepth: 2, symlinks: 'skip' });
  return out;
}

async function load(): Promise<VaultData> {
  const cfg = loadConfig();
  const files: (VaultFile & { source: Note['source'] })[] = [];
  let exists = false;
  try {
    exists = (await fs.stat(cfg.vault.path)).isDirectory();
  } catch {
    exists = false;
  }
  if (exists) {
    for (const d of [cfg.vault.synthesisDir, ...cfg.vault.noteDirs]) {
      for (const f of await listMd(path.join(cfg.vault.path, d))) files.push({ ...f, source: 'vault', rel: d ? `${d}/${f.rel}` : f.rel });
    }
  }
  for (const f of await listMd(cfg.stageA.synthesisDir)) files.push({ ...f, source: 'erismorn' });

  const notes: Note[] = [];
  let local = 0;
  let icloud = 0;
  let stripped = 0;
  await mapLimit(files, 12, async (f) => {
    if (f.dataless) {
      icloud++;
      return; // never opened
    }
    if (f.size > MAX_NOTE_BYTES) return;
    try {
      const raw = await fs.readFile(f.abs, 'utf8');
      const note = parseNote(f.source, f.rel, f.abs, raw, f.mtimeMs);
      local++;
      if (note.strippedThinking) stripped++;
      notes.push(note);
    } catch {
      // unreadable note: skipped
    }
  });
  notes.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.rel.localeCompare(b.rel));
  return { notes, byKey: new Map(notes.map((n) => [n.key, n])), local, icloud, stripped, exists, loadedAt: Date.now() };
}

export const getVault = (force = false) => cached<VaultData>('research:vault', TTL_MS, load, { force });

/** Obsidian link for a vault note (by vault name); null for ErisMorn synthesis files. */
export function noteObsidianUrl(note: Pick<Note, 'rel' | 'source'>): string | null {
  return note.source === 'vault' ? obsidianUrl(loadConfig().vault.name, note.rel) : null;
}

/** Notes that mention a title or file stem. Needles shorter than 14 / 10 characters are ignored (too many false hits). */
export function mentionsOf(vault: VaultData, needles: { title?: string; stem?: string }): Note[] {
  const ns: string[] = [];
  const t = needles.title ? norm(needles.title) : '';
  if (t.trim().length >= 14) ns.push(t);
  const st = needles.stem ? norm(needles.stem) : '';
  if (st.trim().length >= 10 && st !== t) ns.push(st);
  if (!ns.length) return [];
  return vault.notes.filter((n) => ns.some((x) => n.norm.includes(x)));
}

export function snippetFor(note: Note, needles: { title?: string; stem?: string }): string {
  const lower = note.text.toLowerCase();
  for (const needle of [needles.title, needles.stem]) {
    if (!needle) continue;
    const i = lower.indexOf(needle.toLowerCase());
    if (i >= 0) {
      const a = Math.max(0, i - 90);
      const b = Math.min(note.text.length, i + needle.length + 160);
      return `${a > 0 ? '...' : ''}${plain(note.text.slice(a, b))}${b < note.text.length ? '...' : ''}`;
    }
  }
  return note.excerpt;
}

export function toMention(note: Note, needles: { title?: string; stem?: string }): VaultMention {
  return { rel: note.rel, title: note.title, folder: note.folder || note.source, obsidian: noteObsidianUrl(note) ?? '', snippet: snippetFor(note, needles) };
}

// ───────────────────────── syntheses ─────────────────────────

const idOf = (n: Note) => (n.source === 'vault' ? `v:${n.stem}` : `e:${n.stem}`);

function isSynthesis(n: Note): boolean {
  const cfg = loadConfig();
  return n.source === 'erismorn' || n.rel.startsWith(`${cfg.vault.synthesisDir}/`);
}

export async function listSyntheses(): Promise<SynthesisItem[]> {
  const v = await getVault();
  return v.notes.filter(isSynthesis).map((n) => ({
    id: idOf(n),
    source: n.source,
    file: n.file,
    title: n.title,
    date: n.date,
    kind: n.kind,
    tags: n.tags,
    papersReviewed: n.papers,
    words: n.words,
    excerpt: n.excerpt,
    strippedThinking: n.strippedThinking,
  }));
}

export async function getSynthesis(id: string): Promise<SynthesisDetail | null> {
  if (!/^[ve]:[^/\\]{1,200}$/.test(id)) return null;
  const v = await getVault();
  const n = v.notes.filter(isSynthesis).find((x) => idOf(x) === id);
  if (!n) return null;
  const { body: raw } = parseFrontmatter(n.text);
  // the reader shows the title above the text, so a leading "# <same title>" would repeat it
  const lead = /^\s*#\s+(.+)\n+/.exec(raw);
  const body = lead && plain(lead[1]) === n.title ? raw.slice(lead[0].length) : raw;
  return {
    id,
    source: n.source,
    file: n.file,
    title: n.title,
    date: n.date,
    kind: n.kind,
    tags: n.tags,
    papersReviewed: n.papers,
    words: n.words,
    excerpt: n.excerpt,
    strippedThinking: n.strippedThinking,
    markdown: body.trim(),
    path: n.abs,
    obsidian: noteObsidianUrl(n),
  };
}
