import 'server-only';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { BrainGraph, BrainGraphNode, RecentNote } from '@/types/sources';
import { obsidianUrl } from '@/lib/text';
import { registeredVaults, vaultSnapshot, type VaultSnapshot } from '../vaults';
import type { VaultFile } from '../vault-walk';
import { isEvicted } from '@/lib/server/icloud';
import { mapLimit } from '@/lib/server/proc';
import { cached } from './cache';

// Notes across the user's registered Obsidian vaults: recent edits + a wikilink graph. Read-only.

interface NoteFile extends VaultFile {
  vaultId: string;
  vault: string;
}

const MAX_READ_BYTES = 2 * 1024 * 1024;
const PREVIEW_BYTES = 512 * 1024; // drawer preview of notes over MAX_READ_BYTES
const MAX_NOTE_ID_CHARS = 1024;

/** Flattened note list per snapshot (same array for the same snapshot). */
const flat = new WeakMap<VaultSnapshot, NoteFile[]>();
function notesOf(snap: VaultSnapshot): NoteFile[] {
  let list = flat.get(snap);
  if (!list) {
    list = snap.vaults.flatMap(({ vault, files }) => files.map((f) => ({ ...f, vaultId: vault.id, vault: vault.name })));
    flat.set(snap, list);
  }
  return list;
}

/** Every note in every registered vault — the same walk /api/vaults counts (see vaults.ts vaultSnapshot). */
async function allNotes(): Promise<NoteFile[]> {
  return notesOf(await vaultSnapshot());
}

const titleOf = (rel: string) => path.basename(rel, '.md');
const folderOf = (rel: string) => (rel.includes('/') ? rel.split('/')[0] : '(root)');

export async function getRecentNotes(limit = 36): Promise<RecentNote[]> {
  const notes = await allNotes();
  return [...notes]
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map((n) => ({
      title: titleOf(n.rel),
      vault: n.vault,
      vaultId: n.vaultId,
      relPath: n.rel,
      folder: folderOf(n.rel),
      mtime: new Date(n.mtimeMs).toISOString(),
      obsidianUrl: obsidianUrl(n.vaultId, n.rel),
    }));
}

const WIKILINK = /\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const READ_CONCURRENCY = 8;

/** Parsed outgoing wikilinks per note (lower-cased basenames), reused while (mtime, size) are unchanged. */
type LinkEntry = { mtimeMs: number; size: number; links: string[] };
const linkCache = ((globalThis as unknown as { __voltaNoteLinks?: Map<string, LinkEntry> }).__voltaNoteLinks ??= new Map());

const linkReads = new Map<string, Promise<string[] | null>>(); // concurrent graph builds share one read per file

function linksOf(n: NoteFile): Promise<string[] | null> {
  const hit = linkCache.get(n.abs);
  if (hit && hit.mtimeMs === n.mtimeMs && hit.size === n.size) return Promise.resolve(hit.links);
  const key = `${n.abs}\u0000${n.mtimeMs}\u0000${n.size}`;
  let p = linkReads.get(key);
  if (!p) {
    p = fsp
      .readFile(n.abs, 'utf8')
      .then((src) => {
        const links = [...new Set(Array.from(src.matchAll(WIKILINK), (m) => path.basename(m[1].trim()).toLowerCase()))];
        linkCache.set(n.abs, { mtimeMs: n.mtimeMs, size: n.size, links });
        return links;
      })
      .catch(() => null)
      .finally(() => linkReads.delete(key));
    linkReads.set(key, p);
  }
  return p;
}

/**
 * Wikilink graph across all vaults, capped to `maxNodes` (highest degree first, then most recent). Built from the
 * same snapshot as /api/vaults, so totalNotes and the per-vault counts always match it. Keyed by the snapshot's
 * signature, so it is rebuilt only after a vault change, and that rebuild only re-reads the notes whose (mtime, size)
 * changed (linkCache), so it costs about one stat walk.
 */
export async function getBrainGraph(maxNodes = 700): Promise<BrainGraph> {
  const snap = await vaultSnapshot();
  return cached(`brain-graph:${maxNodes}`, Infinity, () => buildGraph(snap, maxNodes), { sig: snap.signature });
}

async function buildGraph(snap: VaultSnapshot, maxNodes: number): Promise<BrainGraph> {
  const notes = notesOf(snap);
  // Same order as /api/vaults (most recently edited first).
  const vaults = snap.vaults
    .map(({ vault, files }) => ({ id: vault.id, name: vault.name, notes: files.length, latest: files.reduce((m, f) => Math.max(m, f.mtimeMs), 0) }))
    .sort((a, b) => b.latest - a.latest)
    .map(({ id, name, notes }) => ({ id, name, notes }));
  const id = (n: NoteFile) => `${n.vaultId}:${n.rel}`;
  // Obsidian resolves [[Name]] by basename within the vault.
  const byName = new Map<string, string>();
  for (const n of notes) byName.set(`${n.vaultId}|${titleOf(n.rel).toLowerCase()}`, id(n));
  const edgeSet = new Set<string>();
  const degree = new Map<string, number>();
  let skipped = 0;
  const readable = (n: NoteFile) => !n.dataless && n.size <= MAX_READ_BYTES;
  const linkLists = await mapLimit(notes, READ_CONCURRENCY, (n) => (readable(n) ? linksOf(n) : Promise.resolve(null)));
  const live = new Set(notes.map((n) => n.abs));
  for (const k of linkCache.keys()) if (!live.has(k)) linkCache.delete(k);
  for (const [i, n] of notes.entries()) {
    if (!readable(n)) {
      skipped++;
      continue; // still a node, just no outgoing links
    }
    const links = linkLists[i];
    if (!links) continue; // unreadable right now
    for (const name of links) {
      const target = byName.get(`${n.vaultId}|${name}`);
      const from = id(n);
      if (!target || target === from) continue;
      const key = from < target ? `${from}\u0000${target}` : `${target}\u0000${from}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      degree.set(from, (degree.get(from) ?? 0) + 1);
      degree.set(target, (degree.get(target) ?? 0) + 1);
    }
  }
  const ranked = [...notes].sort((a, b) => (degree.get(id(b)) ?? 0) - (degree.get(id(a)) ?? 0) || b.mtimeMs - a.mtimeMs);
  const keep = new Set(ranked.slice(0, maxNodes).map(id));
  const nodes: BrainGraphNode[] = ranked
    .filter((n) => keep.has(id(n)))
    .map((n) => ({
      id: id(n),
      label: titleOf(n.rel),
      vault: n.vault,
      folder: folderOf(n.rel),
      relPath: n.rel,
      degree: degree.get(id(n)) ?? 0,
      mtime: new Date(n.mtimeMs).toISOString(),
      obsidianUrl: obsidianUrl(n.vaultId, n.rel),
    }));
  const edges = [...edgeSet]
    .map((k) => k.split('\u0000'))
    .filter(([a, b]) => keep.has(a) && keep.has(b))
    .map(([source, target]) => ({ source, target }));
  const folders = new Map<string, number>();
  for (const n of notes) {
    const k = `${n.vault}\u0000${folderOf(n.rel)}`;
    folders.set(k, (folders.get(k) ?? 0) + 1);
  }
  return {
    nodes,
    edges,
    totalNotes: notes.length,
    totalLinks: edgeSet.size,
    vaults,
    folders: [...folders.entries()]
      .map(([k, count]) => {
        const [vault, folder] = k.split('\u0000');
        return { vault, folder, count };
      })
      .sort((a, b) => b.count - a.count),
    skippedFiles: skipped,
    generatedAt: new Date().toISOString(),
  };
}

/** Read one note (for the Second Brain markdown drawer). `nodeId` = `${vaultId}:${relPath}`. */
export async function readNote(nodeId: string): Promise<{ content: string; path: string } | null> {
  if (nodeId.length > MAX_NOTE_ID_CHARS) return null;
  const i = nodeId.indexOf(':');
  if (i < 0) return null;
  const vaultId = nodeId.slice(0, i);
  const rel = nodeId.slice(i + 1);
  const vault = (await registeredVaults()).find((v) => v.id === vaultId);
  if (!vault || !rel.endsWith('.md')) return null;
  const abs = path.resolve(vault.path, rel);
  if (!abs.startsWith(path.resolve(vault.path) + path.sep)) return null;
  try {
    const st = await fsp.stat(abs);
    if (isEvicted(st)) {
      return { content: `> This note is stored in iCloud only (not downloaded to this Mac).\n> Open it in Obsidian to download it.`, path: abs };
    }
    if (st.size > MAX_READ_BYTES) {
      const fh = await fsp.open(abs, 'r');
      try {
        const buf = Buffer.alloc(PREVIEW_BYTES);
        const { bytesRead } = await fh.read(buf, 0, PREVIEW_BYTES, 0);
        const mb = (st.size / 1024 / 1024).toFixed(1);
        return {
          content: `> This note is ${mb} MB — showing the first ${PREVIEW_BYTES / 1024} KB. Open it in Obsidian for the rest.\n\n${buf.toString('utf8', 0, bytesRead)}`,
          path: abs,
        };
      } finally {
        await fh.close();
      }
    }
    return { content: await fsp.readFile(abs, 'utf8'), path: abs };
  } catch {
    return null;
  }
}
