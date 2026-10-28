import 'server-only';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isEvicted as isPlaceholder } from '@/lib/server/icloud';
import type { FileKind, InventoryState } from '@/components/research/types';
import { loadConfig, type ResearchConfig, type RootCfg } from './config';

// The file inventory: a stat-only walk (readdir + lstat) of the configured roots.
//   * Nothing here opens a file, so nothing is ever downloaded from iCloud. A placeholder (size > 0 && blocks === 0)
//     is only ever counted.
//   * Built lazily in the background on first use, held in memory, and persisted as JSON to Windsor (the boot disk is
//     tight), so a server restart loads the file instead of walking again. A stale one is refreshed in the background.

const WINDSOR = '/Volumes/Windsor';
const STAT_CONCURRENCY = 24;
const PERSIST_VERSION = 1;
const MIN_REBUILD_GAP_MS = 15_000;

export interface InvEntry {
  id: string;
  root: string;
  rel: string;
  name: string;
  folder: string;
  sub: string;
  ext: string;
  kind: FileKind;
  size: number;
  mtime: number;
  /** 'i' = iCloud placeholder (dataless), 'l' = local. */
  st: 'l' | 'i';
}
export interface InvRoot {
  id: string;
  label: string;
  path: string;
  exists: boolean;
  enabled: boolean;
  files: number;
  local: number;
  icloud: number;
  bytes: number;
  excluded: string[];
  truncated: boolean;
}
export interface Inventory {
  version: number;
  builtAt: number;
  durationMs: number;
  hash: string;
  roots: InvRoot[];
  entries: InvEntry[];
}

interface State {
  inv: Inventory | null;
  gen: number;
  fromDisk: boolean;
  building: Promise<Inventory> | null;
  startedAt: number;
  progress: { root: string; files: number } | null;
  error: string | null;
  persisted: boolean;
  persistError: string | null;
}
const g = globalThis as unknown as { __voltaResearchInv?: State };
const S = (g.__voltaResearchInv ??= { inv: null, gen: 0, fromDisk: false, building: null, startedAt: 0, progress: null, error: null, persisted: false, persistError: null });

/** Bumps whenever the in-memory inventory is replaced; derived caches key on it. */
export const inventoryGen = () => S.gen;

const EXT_KIND: Record<string, FileKind> = {};
const addKind = (kind: FileKind, exts: string) => exts.split(' ').forEach((e) => (EXT_KIND[`.${e}`] = kind));
addKind('pdf', 'pdf');
addKind('doc', 'doc docx rtf odt pages wpd rtfd');
addKind('text', 'txt md markdown mermaid log tex rst org');
addKind('sheet', 'csv tsv xls xlsx numbers ods');
addKind('image', 'png jpg jpeg gif webp heic heif tif tiff bmp svg avif');
addKind('audio', 'mp3 wav m4a flac aac ogg opus aiff aif');
addKind('video', 'mp4 mov mkv webm avi m4v');
addKind('archive', 'zip rar 7z tar gz tgz bz2 xz dmg iso');
addKind('book', 'epub mobi azw azw3 djvu');
addKind('code', 'json yml yaml py js ts tsx jsx html css xml ipynb sh toml sql');
const PACKAGE_DOCS = new Set(['.pages', '.numbers', '.key', '.rtfd']);

export const kindOf = (ext: string): FileKind => EXT_KIND[ext] ?? 'other';
export const entryId = (root: string, rel: string) => createHash('sha1').update(`${root}/${rel}`).digest('hex').slice(0, 12);
export { isPlaceholder };

/**
 * True only when a real volume is mounted at `mountPoint`: a leftover empty folder under /Volumes (left behind after
 * an unclean eject) shares /Volumes' device id, so a plain exists() check would wrongly report it as mounted.
 */
export async function volumeMounted(mountPoint: string): Promise<boolean> {
  try {
    const [m, v] = await Promise.all([fs.stat(mountPoint), fs.stat('/Volumes')]);
    return m.isDirectory() && m.dev !== v.dev;
  } catch {
    return false;
  }
}
const windsorMounted = () => volumeMounted(WINDSOR);
const needsWindsor = (file: string) => file === WINDSOR || file.startsWith(`${WINDSOR}/`);

async function mapLimit<T, U>(items: T[], limit: number, fn: (t: T) => Promise<U>): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

function dirExcluded(name: string, cfg: ResearchConfig, root: RootCfg): boolean {
  const n = name.toLowerCase();
  if (cfg.excludeDirNames.has(n)) return true;
  if (root.excludeDirs.some((d) => d.toLowerCase() === n)) return true;
  if (cfg.packageSuffixes.some((s) => n.endsWith(s))) return true;
  return cfg.excludeDirPatterns.some((re) => re.test(name));
}

async function walkRoot(cfg: ResearchConfig, root: RootCfg, out: InvEntry[], info: InvRoot): Promise<void> {
  const budget = { n: cfg.maxFilesPerRoot };
  const visit = async (dir: string, relDir: string): Promise<void> => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    const files: { name: string; dirPkg: boolean }[] = [];
    const subdirs: string[] = [];
    for (const e of entries) {
      if (e.name.startsWith('.')) continue; // .DS_Store, AppleDouble, .icloud stubs
      if (e.isSymbolicLink()) continue; // never follow out of the root
      if (e.isDirectory()) {
        const ext = path.extname(e.name).toLowerCase();
        if (PACKAGE_DOCS.has(ext)) files.push({ name: e.name, dirPkg: true });
        else if (dirExcluded(e.name, cfg, root)) {
          if (info.excluded.length < 60) info.excluded.push(relDir ? `${relDir}/${e.name}` : e.name);
        } else subdirs.push(e.name);
      } else if (e.isFile()) files.push({ name: e.name, dirPkg: false });
    }
    const stats = await mapLimit(files, STAT_CONCURRENCY, async (f) => {
      try {
        return await fs.lstat(path.join(dir, f.name));
      } catch {
        return null; // vanished mid-walk
      }
    });
    for (let i = 0; i < files.length; i++) {
      const st = stats[i];
      if (!st) continue;
      if (budget.n-- <= 0) {
        info.truncated = true;
        return;
      }
      const name = files[i].name;
      const rel = relDir ? `${relDir}/${name}` : name;
      const segs = rel.split('/');
      const ext = path.extname(name).toLowerCase();
      const placeholder = isPlaceholder(st);
      out.push({
        id: entryId(root.id, rel),
        root: root.id,
        rel,
        name,
        folder: segs.length > 1 ? segs[0] : '(root)',
        sub: segs.length > 2 ? segs[1] : '',
        ext: ext.replace(/^\./, ''),
        kind: files[i].dirPkg ? 'doc' : kindOf(ext),
        size: st.size,
        mtime: Math.round(st.mtimeMs),
        st: placeholder ? 'i' : 'l',
      });
      info.files++;
      info.bytes += st.size;
      if (placeholder) info.icloud++;
      else info.local++;
    }
    S.progress = { root: root.id, files: (S.progress?.files ?? 0) + files.length };
    for (const d of subdirs) {
      if (info.truncated) return;
      await visit(path.join(dir, d), relDir ? `${relDir}/${d}` : d);
    }
  };
  await visit(root.path, '');
}

async function buildInventory(): Promise<Inventory> {
  const cfg = loadConfig();
  const t0 = Date.now();
  // roots are independent folders, so they are walked side by side; results are joined in config order
  const parts = await Promise.all(
    cfg.roots.map(async (root) => {
      const info: InvRoot = { id: root.id, label: root.label, path: root.path, exists: false, enabled: root.enabled, files: 0, local: 0, icloud: 0, bytes: 0, excluded: [], truncated: false };
      const out: InvEntry[] = [];
      try {
        info.exists = (await fs.stat(root.path)).isDirectory();
      } catch {
        info.exists = false;
      }
      if (root.enabled && info.exists) await walkRoot(cfg, root, out, info);
      return { info, out };
    }),
  );
  return {
    version: PERSIST_VERSION,
    builtAt: Date.now(),
    durationMs: Date.now() - t0,
    hash: cfg.hash,
    roots: parts.map((p) => p.info),
    entries: parts.flatMap((p) => p.out),
  };
}

async function persist(inv: Inventory): Promise<void> {
  const cfg = loadConfig();
  const file = cfg.indexPath;
  try {
    if (needsWindsor(file) && !(await windsorMounted())) throw new Error(`${WINDSOR} is not mounted, so the index was kept in memory only.`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(inv), 'utf8');
    await fs.rename(tmp, file);
    S.persisted = true;
    S.persistError = null;
  } catch (err) {
    S.persisted = false;
    S.persistError = (err as Error).message;
    console.warn('[research] could not persist the inventory:', S.persistError);
  }
}

async function readPersisted(): Promise<Inventory | null> {
  const cfg = loadConfig();
  try {
    if (needsWindsor(cfg.indexPath) && !(await windsorMounted())) return null;
    const j = JSON.parse(await fs.readFile(cfg.indexPath, 'utf8')) as Inventory;
    if (j?.version !== PERSIST_VERSION || j.hash !== cfg.hash || !Array.isArray(j.entries) || !Array.isArray(j.roots)) return null;
    return j;
  } catch {
    return null;
  }
}

function startBuild(): Promise<Inventory> {
  if (S.building) return S.building;
  S.startedAt = Date.now();
  S.progress = { root: '', files: 0 };
  const p = buildInventory()
    .then(async (inv) => {
      S.inv = inv;
      S.gen++;
      S.fromDisk = false;
      S.error = null;
      await persist(inv);
      return inv;
    })
    .catch((err: unknown) => {
      S.error = (err as Error).message || 'inventory build failed';
      console.error('[research] inventory build failed', err);
      throw err;
    })
    .finally(() => {
      S.building = null;
      S.progress = null;
    });
  S.building = p;
  p.catch(() => {}); // surfaced through S.error; callers that await still see the rejection
  return p;
}

export interface GetOpts {
  /** Wait for the first build when nothing is available yet (ms; default 20 s). 0 = never wait. */
  waitMs?: number;
  /** Start a rebuild now (rate limited) and wait for it. */
  refresh?: boolean;
}

/**
 * The inventory, or null while the very first build is still running past `waitMs`.
 * Memory first, then the Windsor file; a stale one is refreshed in the background.
 */
export async function getInventory(opts: GetOpts = {}): Promise<Inventory | null> {
  const cfg = loadConfig();
  if (opts.refresh) {
    if (S.building) return S.building;
    if (Date.now() - S.startedAt >= MIN_REBUILD_GAP_MS) return startBuild();
    if (S.inv) return S.inv;
  }
  if (!S.inv && !S.building) {
    const disk = await readPersisted();
    if (disk && !S.inv) {
      S.inv = disk;
      S.gen++;
      S.fromDisk = true;
      S.persisted = true;
    }
  }
  if (S.inv) {
    if (S.inv.hash !== cfg.hash || Date.now() - S.inv.builtAt > cfg.inventoryTtlMs) {
      if (!S.building && Date.now() - S.startedAt >= MIN_REBUILD_GAP_MS) startBuild();
    }
    return S.inv;
  }
  const building = startBuild();
  const waitMs = opts.waitMs ?? 20_000;
  if (waitMs <= 0) return null;
  return Promise.race([building, new Promise<null>((r) => setTimeout(() => r(null), waitMs))]).catch(() => null);
}

export function inventoryState(): InventoryState {
  const cfg = loadConfig();
  return {
    ready: !!S.inv,
    building: !!S.building,
    builtAt: S.inv ? new Date(S.inv.builtAt).toISOString() : null,
    durationMs: S.inv ? S.inv.durationMs : null,
    files: S.inv ? S.inv.entries.length : (S.progress?.files ?? 0),
    fromDisk: S.fromDisk,
    persisted: S.persisted,
    persistPath: cfg.indexPath,
    persistError: S.persistError,
    error: S.error,
  };
}
