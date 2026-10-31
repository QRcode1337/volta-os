import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { complete } from '../llm';
import { mapLimit, run } from '../proc';
import { redactSecrets } from '../redact';
import { writeAtomic } from '@/lib/server/storage';
import { loadConfig } from './config';
import type { Library, LibRow } from './library';

// Full text for Phase 2: the first pages of each Voltamachina mirror PDF are read with pdftotext (the mirror is a plain
// drive, so iCloud never downloads anything) and the OmniRoute vm-stage-a combo (no Claude) condenses them into a short abstract. Abstracts are
// cached on Windsor next to the index, keyed by row id + PDF size/mtime, so a rebuild only pays for new or changed PDFs.

const PAGES = 4;
const RAW_CHARS = 6000;
const ABSTRACT_CHARS = 700;
const CONC = 8;
const PDF_TIMEOUT_MS = 30_000;
const LLM_TIMEOUT_MS = 90_000;
const SAVE_EVERY = 25;
const TASK = 'vm-stage-a';
const PDFTOTEXT = '/opt/homebrew/bin/pdftotext';

interface Entry {
  sig: string;
  abstract: string;
}
export type FulltextCache = Record<string, Entry>;

const cacheFile = () => path.join(loadConfig().phase2.dir, 'fulltext.json');

export async function loadFulltext(): Promise<FulltextCache> {
  try {
    return JSON.parse(await fs.readFile(cacheFile(), 'utf8')) as FulltextCache;
  } catch {
    return {};
  }
}

const sigOf = async (p: string) => {
  const st = await fs.stat(p);
  return `${st.size}:${Math.round(st.mtimeMs)}`;
};

async function pdfHead(file: string): Promise<string> {
  const r = await run(PDFTOTEXT, ['-l', String(PAGES), '-nopgbrk', '-enc', 'UTF-8', file, '-'], { timeoutMs: PDF_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
  if (r.error) throw new Error(r.error);
  return r.stdout.replace(/\s+/g, ' ').trim().slice(0, RAW_CHARS);
}

async function abstractOf(title: string, raw: string): Promise<string> {
  const prompt =
    `Condense this extract from the document "${title}" into at most ${ABSTRACT_CHARS} characters of plain prose for a semantic search index: ` +
    `the subject, the main claims or findings, methods, and key named entities. No preamble, no markdown.\n\n${raw}`;
  const res = await complete({ task: TASK, maxTokens: 400, temperature: 0.2, timeoutMs: LLM_TIMEOUT_MS, messages: [{ role: 'user', content: prompt }] });
  const stdout = res.text.replace(/<think>[\s\S]*?<\/think>/g, '');
  return redactSecrets(stdout.replace(/\s+/g, ' ').trim()).slice(0, ABSTRACT_CHARS);
}

/**
 * Fills the cache for every row whose mirror PDF exists. `limit` caps new abstracts this run (0 = all).
 * One bad PDF is skipped and counted, never fatal.
 */
export async function buildFulltext(lib: Library, onProgress: (done: number, total: number) => void, limit = 0): Promise<{ cache: FulltextCache; added: number; failed: number }> {
  const cache = await loadFulltext();
  const prefixByRoot = new Map(loadConfig().stageA.mirrorPrefixes.map((m) => [m.root, m.prefix]));
  // The Stage A source PDF when there is one, else the same relative path under the root's Voltamachina mirror.
  const pdfOf = async (r: LibRow): Promise<string | null> => {
    if (r.mirror?.exists && /\.pdf$/i.test(r.mirror.path)) return r.mirror.path;
    const prefix = prefixByRoot.get(r.root);
    if (!prefix || r.kind !== 'pdf') return null;
    const cand = path.join(prefix, r.rel);
    try {
      await fs.access(cand);
      return cand;
    } catch {
      return null;
    }
  };
  const todo: { r: LibRow; file: string; sig: string }[] = [];
  await mapLimit(lib.rows, 16, async (r) => {
    const file = await pdfOf(r);
    if (!file) return;
    try {
      const sig = await sigOf(file);
      if (cache[r.id]?.sig !== sig) todo.push({ r, file, sig });
    } catch {
      // unreadable mirror file: skip
    }
  });
  const work = limit > 0 ? todo.slice(0, limit) : todo;
  let done = 0;
  let added = 0;
  let failed = 0;
  onProgress(0, work.length);
  await mapLimit(work, CONC, async ({ r, file, sig }) => {
    try {
      const raw = await pdfHead(file);
      if (raw.length >= 200) {
        cache[r.id] = { sig, abstract: await abstractOf(r.title, raw) };
        added++;
      } else {
        cache[r.id] = { sig, abstract: '' }; // scanned or empty PDF: remember so it is not retried
      }
    } catch {
      failed++;
    }
    done++;
    onProgress(done, work.length);
    if (done % SAVE_EVERY === 0) await writeAtomic(cacheFile(), JSON.stringify(cache));
  });
  await writeAtomic(cacheFile(), JSON.stringify(cache));
  return { cache, added, failed };
}

const slug = (t: string) =>
  t
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 70) || 'untitled';
const yaml = (v: string) => JSON.stringify(v);

/**
 * One Obsidian note per abstract in the local Pieces-Vault (the vault must stay off iCloud). Idempotent: a note whose
 * text is unchanged is not rewritten. Returns how many files were written.
 */
export async function writeVaultNotes(lib: Library, cache: FulltextCache): Promise<number> {
  const dir = loadConfig().phase2.notesDir;
  if (!dir) return 0;
  if (dir.includes('Mobile Documents')) throw new Error('notesDir must be on a local or external disk, not iCloud.');
  let written = 0;
  const index: string[] = [];
  const byRoot = new Map<string, string[]>();
  await mapLimit(lib.rows, 16, async (r) => {
    const abs = cache[r.id]?.abstract;
    if (!abs) return;
    const folder = slug(r.rootLabel);
    const name = `${slug(r.title)}-${r.id.slice(0, 6)}`;
    const body = [
      '---',
      `title: ${yaml(r.title)}`,
      'type: pdf-abstract',
      `source_root: ${yaml(r.rootLabel)}`,
      `source_path: ${yaml(r.rel)}`,
      `volta_id: ${r.id}`,
      r.tags.length ? `tags: [${r.tags.map((t) => yaml(t)).join(', ')}]` : 'tags: []',
      'generated_by: VOLTA Research Phase 2 (OmniRoute vm-stage-a)',
      '---',
      `# ${r.title}`,
      '',
      abs,
      '',
      `Source: \`${r.rootLabel} / ${r.rel}\``,
      '',
    ].join('\n');
    const file = path.join(dir, folder, `${name}.md`);
    try {
      if ((await fs.readFile(file, 'utf8').catch(() => '')) !== body) {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, body, { mode: 0o600 });
        written++;
      }
    } catch {
      // one unwritable note is skipped
    }
    (byRoot.get(r.rootLabel) ?? byRoot.set(r.rootLabel, []).get(r.rootLabel)!).push(`- [[${folder}/${name}|${r.title.replace(/[|\]\[]/g, ' ')}]]`);
  });
  for (const [label, lines] of [...byRoot].sort()) index.push(`## ${label} (${lines.length})`, ...lines.sort(), '');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, '_index.md'), `# PDF abstracts (VOLTA Research)\n\nGenerated ${new Date().toISOString().slice(0, 10)}. One note per PDF from the Voltamachina mirror.\n\n${index.join('\n')}\n`, { mode: 0o600 });
  return written;
}
