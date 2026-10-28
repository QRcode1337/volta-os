import 'server-only';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { mapLimit } from '../proc';
import { obsidianUrl, parseFrontmatter } from '@/lib/text';
import { vaultSnapshot } from '../vaults';
import { makeSnippet, makeTitle, type ParsedQuery } from './text';
import type { SearchHit } from './types';

// In-memory full-text index of the Obsidian vaults for VOLTA Search. Read-only.
// - Built lazily on the first search (or when the palette opens), never per query.
// - Each note's text is stored once, lower-cased and whitespace-collapsed, as a UTF-8 Buffer (off the JS heap,
//   ~1 byte/char) and searched with Buffer#indexOf. A refresh re-stats the vaults and re-reads only notes whose
//   (mtime, size) changed.
// - Walks nothing itself: the file list is the shared vaultSnapshot() (lib/server/vaults.ts), so totals and skip
//   rules agree with /api/vaults. iCloud-evicted placeholders (reading one forces a download) and files over 2 MB
//   are not read; they still match by title/path.
// - Dropped after IDLE_DROP_MS without a search to give the memory back; rebuilt on the next search.

const MAX_READ_BYTES = 2 * 1024 * 1024;
const MAX_INDEX_CHARS = 512 * 1024; // per note; longer notes are indexed up to here
const REFRESH_MS = 2 * 60_000;
const IDLE_DROP_MS = 20 * 60_000;
const READ_CONCURRENCY = 8;

type SkipReason = 'icloud' | 'large' | 'unreadable';

interface IndexedNote {
  vaultId: string;
  vault: string;
  abs: string;
  rel: string;
  titleLower: string;
  relLower: string;
  mtimeMs: number;
  size: number;
  text: Buffer | null;
  skipped: SkipReason | null;
}

interface NotesIndex {
  notes: IndexedNote[];
  builtAt: number;
  buildMs: number;
  indexedBytes: number;
  skipped: Record<SkipReason, number>;
}

interface State {
  index?: NotesIndex;
  building?: Promise<NotesIndex>;
  progress: { done: number; total: number };
  lastUsed: number;
  timer?: ReturnType<typeof setInterval>;
}

const g = globalThis as unknown as { __voltaSearchNotes?: State };
const state: State = (g.__voltaSearchNotes ??= { progress: { done: 0, total: 0 }, lastUsed: 0 });

const normalize = (src: string) => src.replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_INDEX_CHARS);

async function build(prev: NotesIndex | undefined): Promise<NotesIndex> {
  const t0 = Date.now();
  // The shared vault walk (cached, same skip rules and totals as /api/vaults): no second readdir+stat pass.
  const snap = await vaultSnapshot();
  const files = snap.vaults.flatMap(({ vault: v, files: fs }) => fs.map((f) => ({ ...f, vaultId: v.id, vault: v.name })));
  const reuse = new Map(prev?.notes.map((n) => [n.abs, n]));
  state.progress = { done: 0, total: files.length };
  const notes = await mapLimit(files, READ_CONCURRENCY, async (f): Promise<IndexedNote> => {
    const base = {
      vaultId: f.vaultId,
      vault: f.vault,
      abs: f.abs,
      rel: f.rel,
      titleLower: path.basename(f.rel, '.md').toLowerCase(),
      relLower: f.rel.toLowerCase(),
      mtimeMs: f.mtimeMs,
      size: f.size,
    };
    try {
      const old = reuse.get(f.abs);
      if (old && old.mtimeMs === f.mtimeMs && old.size === f.size && old.skipped !== 'unreadable') return { ...base, text: old.text, skipped: old.skipped };
      if (f.dataless) return { ...base, text: null, skipped: 'icloud' };
      if (f.size > MAX_READ_BYTES) return { ...base, text: null, skipped: 'large' };
      try {
        return { ...base, text: Buffer.from(normalize(await fsp.readFile(f.abs, 'utf8')), 'utf8'), skipped: null };
      } catch {
        return { ...base, text: null, skipped: 'unreadable' };
      }
    } finally {
      state.progress.done++;
    }
  });
  const skipped: Record<SkipReason, number> = { icloud: 0, large: 0, unreadable: 0 };
  let indexedBytes = 0;
  for (const n of notes) {
    if (n.skipped) skipped[n.skipped]++;
    else indexedBytes += n.text?.length ?? 0;
  }
  return { notes, builtAt: Date.now(), buildMs: Date.now() - t0, indexedBytes, skipped };
}

function startBuild(): Promise<NotesIndex> {
  if (state.building) return state.building;
  const p = build(state.index)
    .then((idx) => {
      state.index = idx;
      return idx;
    })
    .finally(() => {
      if (state.building === p) state.building = undefined;
    });
  state.building = p;
  return p;
}

function ensureIdleTimer() {
  if (state.timer) return;
  state.timer = setInterval(() => {
    if (state.building || Date.now() - state.lastUsed < IDLE_DROP_MS) return;
    state.index = undefined; // free the buffers; the next search rebuilds
    clearInterval(state.timer);
    state.timer = undefined;
  }, 5 * 60_000);
  state.timer.unref?.();
}

/** The current index; refreshes in the background when older than REFRESH_MS. Waits only when none exists. */
export function getNotesIndex(): Promise<NotesIndex> {
  state.lastUsed = Date.now();
  ensureIdleTimer();
  const idx = state.index;
  if (idx) {
    if (Date.now() - idx.builtAt > REFRESH_MS) startBuild().catch((err) => console.error('[volta search] notes index refresh failed', err));
    return Promise.resolve(idx);
  }
  return startBuild();
}

/** For timeout notes: "indexing 1,234 / 5,943 notes". */
export function notesIndexProgress(): { building: boolean; done: number; total: number } {
  return { building: !!state.building, ...state.progress };
}

const fmt = (n: number) => n.toLocaleString('en-US');

function countIn(buf: Buffer, needle: Buffer, cap: number): number {
  let n = 0;
  let i = buf.indexOf(needle);
  while (i >= 0 && n < cap) {
    n++;
    i = buf.indexOf(needle, i + needle.length);
  }
  return n;
}

/** The note body (frontmatter removed) when the match is in the body, so snippets show prose, not tag lists. */
function bodyFirst(src: string, pq: ParsedQuery): string {
  const { has, body } = parseFrontmatter(src);
  if (!has) return src;
  if (pq.phraseRe?.test(body)) return body;
  if (pq.termRe) {
    pq.termRe.lastIndex = 0;
    const found = pq.termRe.test(body);
    pq.termRe.lastIndex = 0;
    if (found) return body;
  }
  return src;
}

export interface NotesSearchResult {
  hits: SearchHit[];
  total: number;
  note: string;
}

/**
 * Notes where every term occurs in the title, path or text. Ranked: phrase in title ≫ term in title ≫ phrase in
 * text ≫ term frequency, plus a small boost for notes edited in the last 30 days.
 */
export async function searchNotes(pq: ParsedQuery, limit: number): Promise<NotesSearchResult> {
  const idx = await getNotesIndex();
  if (!pq.terms.length) return { hits: [], total: 0, note: '' };
  const termBufs = pq.terms.map((t) => Buffer.from(t, 'utf8'));
  const phraseBuf = Buffer.from(pq.phrase, 'utf8');
  const multi = pq.terms.length > 1;
  const now = Date.now();
  const scored: { n: IndexedNote; score: number }[] = [];
  for (const n of idx.notes) {
    let score = 0;
    let ok = true;
    for (let i = 0; i < pq.terms.length; i++) {
      const t = pq.terms[i];
      if (n.titleLower.includes(t)) score += 20;
      else if (n.relLower.includes(t)) score += 6;
      else if (n.text && n.text.indexOf(termBufs[i]) >= 0) score += 2 + countIn(n.text, termBufs[i], 5);
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (n.titleLower === pq.phrase) score += 120;
    else if (n.titleLower.startsWith(pq.phrase)) score += 70;
    else if (n.titleLower.includes(pq.phrase)) score += 45;
    if (multi && n.text && n.text.indexOf(phraseBuf) >= 0) score += 15;
    const ageDays = (now - n.mtimeMs) / 86_400_000;
    if (ageDays < 30) score += 6 * (1 - ageDays / 30);
    scored.push({ n, score });
  }
  scored.sort((a, b) => b.score - a.score || b.n.mtimeMs - a.n.mtimeMs);

  const hits = await Promise.all(
    scored.slice(0, limit).map(async ({ n }): Promise<SearchHit> => {
      const title = makeTitle(path.basename(n.rel, '.md'), pq);
      let snippet = { text: '', highlights: [] as [number, number][] };
      if (n.skipped === 'icloud') snippet = { text: 'Stored in iCloud only (not downloaded to this Mac) — matched by title/path.', highlights: [] };
      else if (n.skipped === 'large') snippet = { text: `Over 2 MB (${(n.size / 1048576).toFixed(1)} MB) — matched by title/path; text not indexed.`, highlights: [] };
      else {
        try {
          snippet = makeSnippet(bodyFirst(await fsp.readFile(n.abs, 'utf8'), pq), pq);
        } catch {
          snippet = { text: '', highlights: [] };
        }
      }
      const nodeId = `${n.vaultId}:${n.rel}`;
      const folder = n.rel.includes('/') ? n.rel.slice(0, n.rel.lastIndexOf('/')) : '(root)';
      return {
        id: nodeId,
        source: 'notes',
        title: title.text,
        titleHighlights: title.highlights,
        snippet: snippet.text,
        highlights: snippet.highlights,
        when: new Date(n.mtimeMs).toISOString(),
        href: `/second-brain?view=map&node=${encodeURIComponent(nodeId)}`,
        external: false,
        secondary: { href: obsidianUrl(n.vaultId, n.rel), label: 'Open in Obsidian', external: true },
        meta: [n.vault, folder],
      };
    }),
  );

  const s = idx.skipped;
  const skippedNote = [s.icloud && `${fmt(s.icloud)} iCloud-only`, s.large && `${fmt(s.large)} over 2 MB`, s.unreadable && `${fmt(s.unreadable)} unreadable`]
    .filter(Boolean)
    .join(', ');
  const ageS = Math.round((Date.now() - idx.builtAt) / 1000);
  return {
    hits,
    total: scored.length,
    note: `${fmt(idx.notes.length)} notes indexed (${(idx.indexedBytes / 1048576).toFixed(1)} MB, refreshed ${ageS < 60 ? `${ageS}s` : `${Math.round(ageS / 60)}m`} ago)${skippedNote ? ` · title-only: ${skippedNote}` : ''}`,
  };
}
