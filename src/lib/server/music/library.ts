import 'server-only';
import { HttpError } from '../http-error';
import { execFile } from 'node:child_process';
import { BIN, mapLimit, run } from '../proc';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isEvicted as isPlaceholder } from '@/lib/server/icloud';
import { brctlCommand, cleanTitle } from '@/components/music/format';
import type { EmbeddedTags, MusicLibrary, MusicRoot, MusicTrack, RootCandidate } from '@/components/music/types';
import { cached } from '../sources/cache';
import { isInside } from '../storage';
import { loadConfig, saveRoots, type MusicConfig } from './config';
import { readMeta } from './meta';

// Track index. Tracks live in iCloud-synced folders where every file may be a dataless placeholder.
// Rules that keep this safe:
//   * stat / readdir / realpath only: they never download anything.
//   * A placeholder (size > 0 && blocks === 0) is never opened, probed or streamed.
//   * Nothing here runs `brctl`; the UI only shows the command for the user to copy.

const PROBE_TIMEOUT_MS = 15_000;
const PROBE_CONCURRENCY = 3;
const WALK_BUDGET = 5000;
const INDEX_TTL_MS = 10_000;
const DISCOVER_TTL_MS = 60_000;

const AUDIO: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
};
const SKIP_DIRS = new Set(['node_modules', '.git', '.Trash', '__MACOSX']);
const SKIP_SUFFIX = ['.photoslibrary', '.app', '.bundle', '.band', '.logicx'];

export type RawTrack = Omit<MusicTrack, 'meta'>;
interface Index {
  tracks: RawTrack[];
  byId: Map<string, RawTrack>;
  roots: MusicRoot[];
}

interface Probe {
  durationSec: number | null;
  bitrateKbps: number | null;
  sampleRate: number | null;
  channels: number | null;
  codec: string | null;
  tags: EmbeddedTags;
  hasCover: boolean;
}
const NO_PROBE: Probe = { durationSec: null, bitrateKbps: null, sampleRate: null, channels: null, codec: null, tags: {}, hasCover: false };

const g = globalThis as unknown as { __voltaMusic?: { gen: number; probes: Map<string, Probe>; covers: Map<string, { mime: string; data: Buffer }> } };
const S = (g.__voltaMusic ??= { gen: 0, probes: new Map(), covers: new Map() });

/** Drop the cached index (after the roots config changes). */
export function bustIndex(): void {
  S.gen++;
}

export const trackIdFor = (rootId: string, rel: string) => `m_${createHash('sha1').update(`${rootId}/${rel}`).digest('hex').slice(0, 16)}`;
export const metaKeyFor = (t: { rootId: string; rel: string }) => `${t.rootId}/${t.rel}`;
export { isPlaceholder };

// ───────────────────────── ffprobe (local files only) ─────────────────────────

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function lowerKeys(o: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (typeof v === 'string') out[k.toLowerCase()] = v.trim();
  return out;
}

async function probeLocal(file: string, size: number, mtimeMs: number): Promise<Probe> {
  const key = `${file}|${size}|${mtimeMs}`;
  const hit = S.probes.get(key);
  if (hit) return hit;
  const r = await run(
    BIN.ffprobe,
    [
      '-v', 'error',
      '-show_entries', 'format=duration,bit_rate:format_tags:stream=index,codec_type,codec_name,sample_rate,channels,bit_rate:stream_disposition=attached_pic',
      '-of', 'json',
      '-i', file,
    ],
    { timeoutMs: PROBE_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 },
  );
  if (r.code !== 0) {
    console.warn('[music] ffprobe failed:', path.basename(file), r.error);
    return NO_PROBE; // not cached: a later refresh retries
  }
  try {
    const j = JSON.parse(r.stdout) as {
      format?: { duration?: string; bit_rate?: string; tags?: unknown };
      streams?: { codec_type?: string; codec_name?: string; sample_rate?: string; channels?: number; bit_rate?: string; disposition?: { attached_pic?: number } }[];
    };
    const streams = j.streams ?? [];
    const a = streams.find((s) => s.codec_type === 'audio');
    const t = lowerKeys(j.format?.tags);
    const br = num(j.format?.bit_rate) ?? num(a?.bit_rate);
    const dur = num(j.format?.duration);
    const p: Probe = {
      durationSec: dur !== null ? Math.round(dur * 100) / 100 : null,
      bitrateKbps: br !== null ? Math.round(br / 1000) : null,
      sampleRate: num(a?.sample_rate),
      channels: a?.channels ?? null,
      codec: a?.codec_name ?? null,
      tags: {
        title: t.title || undefined,
        artist: t.artist || t.album_artist || undefined,
        album: t.album || undefined,
        track: t.track || undefined,
        date: t.date || t.year || undefined,
        genre: t.genre || undefined,
        comment: t.comment || t.description || undefined,
      },
      hasCover: streams.some((s) => s.codec_type === 'video' && s.disposition?.attached_pic === 1),
    };
    if (S.probes.size > 2000) S.probes.clear();
    S.probes.set(key, p);
    return p;
  } catch {
    return NO_PROBE;
  }
}

// ───────────────────────── scanning ─────────────────────────

interface Cand {
  file: string;
  rel: string;
  size: number;
  blocks: number;
  mtimeMs: number;
  ext: string;
}

async function walk(dir: string, root: string, depth: number, maxDepth: number, exts: Set<string>, out: Cand[], budget: { n: number }): Promise<void> {
  if (budget.n <= 0) return;
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (budget.n-- <= 0) return;
    if (e.name.startsWith('.')) continue; // .DS_Store, AppleDouble, .icloud stubs
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth < maxDepth && !SKIP_DIRS.has(e.name) && !SKIP_SUFFIX.some((s) => e.name.endsWith(s))) await walk(full, root, depth + 1, maxDepth, exts, out, budget);
      continue;
    }
    const ext = path.extname(e.name).toLowerCase();
    if (!exts.has(ext) || !AUDIO[ext]) continue;
    try {
      const st = await fs.stat(full); // follows symlinks; never reads contents
      if (!st.isFile()) continue;
      out.push({ file: full, rel: path.relative(root, full), size: st.size, blocks: st.blocks, mtimeMs: st.mtimeMs, ext });
    } catch {
      // vanished mid-scan
    }
  }
}

async function buildIndex(): Promise<Index> {
  const cfg = loadConfig();
  const roots: MusicRoot[] = [];
  const tracks: RawTrack[] = [];
  const seenReal = new Set<string>();
  for (const root of cfg.roots) {
    const info: MusicRoot = {
      id: root.id,
      label: root.label,
      path: root.path,
      enabled: root.enabled,
      exists: false,
      trackCount: 0,
      localCount: 0,
      icloudCount: 0,
      downloadCommand: brctlCommand(root.path),
    };
    roots.push(info);
    try {
      info.exists = (await fs.stat(root.path)).isDirectory();
    } catch {
      info.exists = false;
    }
    if (!root.enabled || !info.exists) continue;
    const cands: Cand[] = [];
    await walk(root.path, root.path, 0, root.depth, cfg.extensions, cands, { n: WALK_BUDGET });
    const mine: { c: Cand; real: string }[] = [];
    for (const c of cands) {
      let real = c.file;
      try {
        real = await fs.realpath(c.file);
      } catch {
        continue;
      }
      if (seenReal.has(real)) continue; // same file reachable from an earlier root
      seenReal.add(real);
      mine.push({ c, real });
    }
    const built = await mapLimit(mine, PROBE_CONCURRENCY, async ({ c }): Promise<RawTrack> => {
      const offline = isPlaceholder(c);
      const pr = offline ? NO_PROBE : await probeLocal(c.file, c.size, c.mtimeMs);
      const fileName = path.basename(c.file);
      const tagTitle = pr.tags.title && !/^untitled$/i.test(pr.tags.title) ? pr.tags.title : null;
      return {
        id: trackIdFor(root.id, c.rel),
        rootId: root.id,
        rel: c.rel,
        path: c.file,
        folder: path.dirname(c.file),
        fileName,
        title: tagTitle ?? cleanTitle(fileName),
        format: c.ext.slice(1).toUpperCase(),
        mime: AUDIO[c.ext],
        bytes: c.size,
        mtime: new Date(c.mtimeMs).toISOString(),
        storage: offline ? 'icloud' : 'local',
        durationSec: pr.durationSec,
        bitrateKbps: pr.bitrateKbps,
        sampleRate: pr.sampleRate,
        channels: pr.channels,
        codec: pr.codec,
        tags: pr.tags,
        hasCover: pr.hasCover,
      };
    });
    for (const t of built) {
      tracks.push(t);
      info.trackCount++;
      if (t.storage === 'icloud') info.icloudCount++;
      else info.localCount++;
    }
  }
  return { tracks, byId: new Map(tracks.map((t) => [t.id, t])), roots };
}

const getIndex = (force = false) => cached<Index>(`music:index:${S.gen}`, INDEX_TTL_MS, buildIndex, { force });

// ───────────────────────── optional roots (discovery) ─────────────────────────

async function discover(cfg: MusicConfig): Promise<RootCandidate[]> {
  const found: RootCandidate[] = [];
  const configured = new Set(cfg.roots.map((r) => r.path));
  const budget = { n: 4000 };
  const visit = async (dir: string, depth: number): Promise<void> => {
    if (budget.n-- <= 0) return;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    let audio = 0;
    const subdirs: string[] = [];
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !SKIP_SUFFIX.some((s) => e.name.endsWith(s))) subdirs.push(e.name);
      } else if (cfg.extensions.has(path.extname(e.name).toLowerCase()) && AUDIO[path.extname(e.name).toLowerCase()]) audio++;
    }
    if (audio > 0 && !configured.has(dir)) {
      found.push({ path: dir, label: depth === 0 ? `${path.basename(dir)} (loose files)` : path.relative(cfg.discover.base, dir), audioFiles: audio, depth });
    }
    if (depth < cfg.discover.maxDepth) for (const d of subdirs.sort()) await visit(path.join(dir, d), depth + 1);
  };
  await visit(cfg.discover.base, 0);
  return found;
}

export async function getCandidates(): Promise<RootCandidate[]> {
  const cfg = loadConfig();
  return cached<RootCandidate[]>(`music:discover:${S.gen}`, DISCOVER_TTL_MS, () => discover(cfg));
}

/** Adds a discovered folder to config/music.json (enabled), or flips `enabled` on a configured root. */
export async function setRootEnabled(rawPath: string, enabled: boolean): Promise<void> {
  const cfg = loadConfig();
  const p = path.resolve(rawPath);
  const existing = cfg.roots.find((r) => r.path === p);
  const rows = cfg.roots.map((r) => ({ ...r }));
  if (existing) {
    rows.find((r) => r.id === existing.id)!.enabled = enabled;
  } else {
    if (!enabled) return;
    const cand = (await getCandidates()).find((c) => c.path === p);
    if (!cand) throw new HttpError('That folder is not one of the discovered music folders.', 400);
    const base = path.basename(p).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'folder';
    let id = base;
    for (let i = 2; rows.some((r) => r.id === id); i++) id = `${base}-${i}`;
    rows.push({ id, label: path.basename(p), path: p, enabled: true, depth: 0 });
  }
  saveRoots(rows);
  bustIndex();
}

// ───────────────────────── public views ─────────────────────────

export async function getLibrary(opts: { refresh?: boolean } = {}): Promise<MusicLibrary> {
  const cfg = loadConfig();
  const [idx, store, candidates] = await Promise.all([getIndex(!!opts.refresh), readMeta(), getCandidates()]);
  const tracks: MusicTrack[] = idx.tracks.map((t) => {
    const meta = store.tracks[metaKeyFor(t)] ?? {};
    return { ...t, title: meta.title || t.title, meta };
  });
  const icloud = tracks.filter((t) => t.storage === 'icloud').length;
  return {
    band: cfg.band,
    tracks,
    roots: idx.roots,
    candidates,
    meta: { path: store.path, ok: store.ok, reason: store.reason },
    counts: { total: tracks.length, local: tracks.length - icloud, icloud },
    generatedAt: new Date().toISOString(),
    configErrors: cfg.errors,
  };
}

export interface ResolvedTrack {
  track: RawTrack;
  /** realpath, verified inside an enabled root. */
  path: string;
  size: number;
  mtimeMs: number;
  mime: string;
  /** In iCloud (dataless): must not be opened. */
  offline: boolean;
}

/** id -> verified file. The path must resolve (symlinks and `..` included) inside an enabled configured root. */
export async function resolveTrack(id: string): Promise<ResolvedTrack> {
  if (typeof id !== 'string' || !/^m_[0-9a-f]{16}$/.test(id)) throw new HttpError('Bad track id.', 400);
  let idx = await getIndex();
  let track = idx.byId.get(id);
  if (!track) {
    idx = await getIndex(true);
    track = idx.byId.get(id);
  }
  if (!track) throw new HttpError('Unknown track (it may have moved; refresh the library).', 404);
  const root = loadConfig().roots.find((r) => r.id === track!.rootId && r.enabled);
  if (!root) throw new HttpError('That track belongs to a library root that is disabled.', 403);
  let real: string;
  try {
    real = await fs.realpath(track.path);
  } catch {
    throw new HttpError('File is missing.', 404);
  }
  if (!(await isInside(real, root.path))) throw new HttpError('Path is outside the configured music roots.', 403);
  const mime = AUDIO[path.extname(real).toLowerCase()];
  if (!mime) throw new HttpError('Not a servable audio type.', 415);
  const st = await fs.stat(real);
  if (!st.isFile()) throw new HttpError('Not a file.', 404);
  return { track, path: real, size: st.size, mtimeMs: st.mtimeMs, mime, offline: isPlaceholder(st) };
}

/** Throws a 409 carrying the brctl command when the track is still a placeholder. */
export function assertLocal(r: ResolvedTrack): void {
  if (r.offline) {
    throw new HttpError(`${r.track.fileName} is in iCloud and not downloaded to this Mac. Run the brctl command to fetch it.`, 409, {
      storage: 'icloud',
      command: brctlCommand(r.track.folder),
    });
  }
}

// ───────────────────────── cover art ─────────────────────────

export async function trackCover(id: string): Promise<{ mime: string; data: Buffer }> {
  const r = await resolveTrack(id);
  assertLocal(r);
  const key = `${r.path}|${r.size}|${r.mtimeMs}`;
  const hit = S.covers.get(key);
  if (hit) return hit;
  const pr = await probeLocal(r.path, r.size, r.mtimeMs);
  if (!pr.hasCover) throw new HttpError('No embedded cover art.', 404);
  // execFile, not run(): the cover comes back as binary on stdout
  const data = await new Promise<Buffer>((resolve, reject) => {
    execFile(
      BIN.ffmpeg,
      ['-v', 'error', '-nostdin', '-i', r.path, '-an', '-map', '0:v:0', '-frames:v', '1', '-c:v', 'copy', '-f', 'image2pipe', 'pipe:1'],
      { timeout: PROBE_TIMEOUT_MS, maxBuffer: 12 * 1024 * 1024, encoding: 'buffer' },
      (err, stdout) => (err || !stdout.length ? reject(new HttpError('Could not extract the cover art.', 404)) : resolve(stdout)),
    );
  });
  const mime = data[0] === 0xff && data[1] === 0xd8 ? 'image/jpeg' : data[0] === 0x89 && data[1] === 0x50 ? 'image/png' : 'application/octet-stream';
  if (S.covers.size >= 24) S.covers.delete(S.covers.keys().next().value as string);
  const out = { mime, data };
  S.covers.set(key, out);
  return out;
}

// ───────────────────────── Studio hook ─────────────────────────

/** Local (downloaded) tracks as Studio audio inputs: same idea as generationInputs() in studio/index-projects.ts. */
export async function musicInputs(limit = 200): Promise<{ id: string; name: string; media: 'audio'; size: number; created: string; prompt: string }[]> {
  const idx = await getIndex();
  return idx.tracks
    .filter((t) => t.storage === 'local')
    .slice(0, limit)
    .map((t) => ({ id: t.id, name: t.fileName, media: 'audio' as const, size: t.bytes, created: t.mtime, prompt: t.title }));
}

