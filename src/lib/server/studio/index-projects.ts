import 'server-only';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CompositionInfo, GenerationInput, MediaClass, StudioOutput, StudioProject } from '@/types/studio';
import { readManifest, resolveFile } from '../media/storage';
import { MediaError } from '../media/config';
import {
  getProject,
  loadConfig,
  projectExists,
  projectRoots,
  resolveOutputDir,
  toPublicPreset,
  type Project,
} from './config';
import { COMPOSITIONS_CACHE, RENDERS_ROOT, STUDIO_ROOT, StudioError, isInside, projectRendersDir, windsorMounted } from './storage';

// Project index: recent outputs (with ffprobe), compositions, and the id -> path registry behind /api/studio/file.
// The browser only ever sees ids; paths are resolved here and checked against the project's roots.

const MEDIA_EXT: Record<string, MediaClass> = { '.mp4': 'video', '.mov': 'video', '.webm': 'video', '.wav': 'audio', '.mp3': 'audio' };
export const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.turbo', 'dist', 'build', '__pycache__', '.venv', '.cache', '.hyperframes', '.remotion']);
const OUTPUT_TTL_MS = 20_000;
/** Newest outputs indexed per project (the Editor media bin lists all of them). */
export const OUTPUT_SCAN_LIMIT = 100;
const WALK_BUDGET = 25_000;
const PROBE_CONCURRENCY = 4;
const FFPROBE = '/opt/homebrew/bin/ffprobe';

export interface Probe {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean;
}
const NO_PROBE: Probe = { durationSec: null, width: null, height: null, fps: null, hasAudio: false };

/** "30000/1001" -> 29.97; 0/0 and garbage -> null. */
function parseRate(r: string | undefined): number | null {
  const m = /^(\d+)\/(\d+)$/.exec(r ?? '');
  if (!m || Number(m[2]) === 0) return null;
  const v = Number(m[1]) / Number(m[2]);
  return v > 0 && v <= 1000 ? Math.round(v * 1000) / 1000 : null;
}
interface Registry {
  files: Map<string, { path: string; projectId: string }>;
  probes: Map<string, Probe>;
  outputs: Map<string, { at: number; items: StudioOutput[]; total: number }>;
  cli: Map<string, { at: string; items: CompositionInfo[] }>;
  cliLoaded: boolean;
  lastFullScan: number;
}
const g = globalThis as unknown as { __voltaStudioIdx?: Registry };
const R: Registry = (g.__voltaStudioIdx ??= {
  files: new Map(),
  probes: new Map(),
  outputs: new Map(),
  cli: new Map(),
  cliLoaded: false,
  lastFullScan: 0,
});

export const fileId = (p: string) => `o_${createHash('sha1').update(p).digest('hex').slice(0, 16)}`;

// ───────────────────────── ffprobe ─────────────────────────

export function probeFile(file: string, size: number, mtimeMs: number): Promise<Probe> {
  const key = `v2|${file}|${size}|${mtimeMs}`;
  const hit = R.probes.get(key);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    execFile(
      FFPROBE,
      ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,avg_frame_rate,r_frame_rate', '-of', 'json', '-i', file],
      { timeout: 15_000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        const empty: Probe = NO_PROBE;
        if (err) {
          console.warn('[studio] ffprobe failed:', path.basename(file), String(stderr || err.message).split('\n')[0].slice(0, 200));
          return resolve(empty);
        }
        try {
          const j = JSON.parse(stdout) as { format?: { duration?: string }; streams?: { codec_type?: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string }[] };
          const v = j.streams?.find((s) => s.codec_type === 'video' && s.width);
          const dur = Number(j.format?.duration);
          const p: Probe = {
            durationSec: Number.isFinite(dur) ? Math.round(dur * 100) / 100 : null,
            width: v?.width ?? null,
            height: v?.height ?? null,
            fps: parseRate(v?.avg_frame_rate) ?? parseRate(v?.r_frame_rate),
            hasAudio: !!j.streams?.some((s) => s.codec_type === 'audio'),
          };
          if (R.probes.size > 3000) R.probes.clear();
          R.probes.set(key, p);
          resolve(p);
        } catch {
          resolve(empty);
        }
      },
    );
  });
}

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

// ───────────────────────── outputs ─────────────────────────

interface Cand {
  file: string;
  root: string;
  size: number;
  mtimeMs: number;
  ext: string;
  offline: boolean;
}

async function walk(dir: string, root: string, depth: number, maxDepth: number, out: Cand[], budget: { n: number }): Promise<void> {
  if (budget.n <= 0) return;
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (budget.n-- <= 0) return;
    if (e.name.startsWith('.') && e.isDirectory()) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth < maxDepth && !SKIP_DIRS.has(e.name)) await walk(full, root, depth + 1, maxDepth, out, budget);
    } else if (e.isFile()) {
      if (e.name.startsWith('.')) continue; // AppleDouble ._ files on the exFAT drive, .DS_Store
      const ext = path.extname(e.name).toLowerCase();
      if (!MEDIA_EXT[ext]) continue;
      try {
        const st = await fs.stat(full);
        out.push({ file: full, root, size: st.size, mtimeMs: st.mtimeMs, ext, offline: st.size > 0 && st.blocks === 0 });
      } catch {
        // vanished mid-scan
      }
    }
  }
}

/** Folders (and walk depth) scanned for a project's outputs. */
function scanTargets(p: Project): { dir: string; depth: number }[] {
  const t: { dir: string; depth: number }[] = [];
  for (const d of p.outputDirs) t.push({ dir: d, depth: 6 });
  for (const preset of p.presets) {
    const od = resolveOutputDir(p, preset);
    if (od) t.push({ dir: od, depth: 2 });
  }
  t.push({ dir: projectRendersDir(p.id), depth: 1 });
  if (!p.outputDirs.length && p.path !== STUDIO_ROOT) t.push({ dir: p.path, depth: 2 });
  // drop folders nested inside another scanned folder
  const kept: { dir: string; depth: number }[] = [];
  for (const a of [...t].sort((x, y) => x.dir.length - y.dir.length)) {
    if (!kept.some((k) => a.dir === k.dir || a.dir.startsWith(k.dir + path.sep))) kept.push(a);
  }
  return kept;
}

export async function projectOutputs(project: Project, opts: { limit?: number; refresh?: boolean } = {}): Promise<{ items: StudioOutput[]; total: number }> {
  const limit = opts.limit ?? 40;
  const hit = R.outputs.get(project.id);
  if (hit && !opts.refresh && Date.now() - hit.at < OUTPUT_TTL_MS && hit.items.length >= Math.min(limit, hit.total)) {
    return { items: hit.items.slice(0, limit), total: hit.total };
  }
  const cands: Cand[] = [];
  const budget = { n: WALK_BUDGET };
  for (const t of scanTargets(project)) await walk(t.dir, t.dir, 0, t.depth, cands, budget);
  const unique = new Map<string, Cand>();
  for (const c of cands) unique.set(c.file, c);
  const sorted = [...unique.values()].sort((a, b) => b.mtimeMs - a.mtimeMs);
  const top = sorted.slice(0, Math.max(limit, 40));
  const items = await mapLimit(top, PROBE_CONCURRENCY, async (c): Promise<StudioOutput> => {
    const id = fileId(c.file);
    R.files.set(id, { path: c.file, projectId: project.id });
    const pr = c.offline ? NO_PROBE : await probeFile(c.file, c.size, c.mtimeMs);
    return {
      id,
      name: path.basename(c.file),
      path: c.file,
      rel: path.relative(c.root, c.file),
      projectId: project.id,
      media: MEDIA_EXT[c.ext],
      ext: c.ext.slice(1),
      size: c.size,
      mtime: new Date(c.mtimeMs).toISOString(),
      durationSec: pr.durationSec,
      width: pr.width,
      height: pr.height,
      fps: pr.fps,
      offline: c.offline,
    };
  });
  R.outputs.set(project.id, { at: Date.now(), items, total: sorted.length });
  return { items: items.slice(0, limit), total: sorted.length };
}

/** Newest media file under the project's output folders modified at/after `sinceMs` (used for jobs without an {out}). */
export async function newestOutputSince(project: Project, sinceMs: number): Promise<StudioOutput | null> {
  const { items } = await projectOutputs(project, { limit: 5, refresh: true });
  return items.find((o) => Date.parse(o.mtime) >= sinceMs - 1000) ?? null;
}

/** Register a file a job just produced (so /api/studio/file can serve it) and describe it. */
export async function registerOutput(project: Project, file: string): Promise<StudioOutput | null> {
  const ext = path.extname(file).toLowerCase();
  if (!MEDIA_EXT[ext]) return null;
  try {
    const st = await fs.stat(file);
    const id = fileId(file);
    R.files.set(id, { path: file, projectId: project.id });
    R.outputs.delete(project.id);
    const pr = await probeFile(file, st.size, st.mtimeMs);
    return {
      id,
      name: path.basename(file),
      path: file,
      rel: path.basename(file),
      projectId: project.id,
      media: MEDIA_EXT[ext],
      ext: ext.slice(1),
      size: st.size,
      mtime: st.mtime.toISOString(),
      durationSec: pr.durationSec,
      width: pr.width,
      height: pr.height,
      fps: pr.fps,
      offline: false,
    };
  } catch {
    return null;
  }
}

async function scanAllThrottled(): Promise<void> {
  if (Date.now() - R.lastFullScan < 3000) return;
  R.lastFullScan = Date.now();
  for (const p of loadConfig().projects) await projectOutputs(p, { limit: OUTPUT_SCAN_LIMIT, refresh: true });
}

function allowedRoots(project: Project): string[] {
  const roots = [...projectRoots(project), projectRendersDir(project.id), RENDERS_ROOT];
  for (const preset of project.presets) {
    const od = resolveOutputDir(project, preset);
    if (od) roots.push(od);
  }
  return roots;
}

export interface ResolvedFile {
  id: string;
  path: string;
  size: number;
  mtimeMs: number;
  media: MediaClass;
  mime: string;
  name: string;
  projectId: string | null;
  offline: boolean;
}

/** id -> verified file. The path must resolve (symlinks and `..` included) inside a known project's folders or the Windsor studio root. */
export async function resolveOutputFile(id: string): Promise<ResolvedFile> {
  if (!/^o_[0-9a-f]{16}$/.test(id)) throw new StudioError('Bad file id.', 400);
  let ent = R.files.get(id);
  if (!ent) {
    await scanAllThrottled();
    ent = R.files.get(id);
  }
  if (!ent) throw new StudioError('Unknown file (it may have moved; refresh the project).', 404);
  const project = getProject(ent.projectId);
  if (!project) throw new StudioError('Project is no longer in the config.', 404);
  let real: string;
  try {
    real = await fs.realpath(ent.path);
  } catch {
    throw new StudioError('File is missing (is the drive mounted?).', 404);
  }
  let ok = await isInside(real, STUDIO_ROOT);
  for (const root of allowedRoots(project)) {
    if (ok) break;
    ok = await isInside(real, root);
  }
  if (!ok) throw new StudioError('Path is outside the known project folders.', 403);
  const ext = path.extname(real).toLowerCase();
  if (!MEDIA_EXT[ext]) throw new StudioError('Not a servable media type.', 415);
  const st = await fs.stat(real);
  if (!st.isFile()) throw new StudioError('Not a file.', 404);
  return {
    id,
    path: real,
    size: st.size,
    mtimeMs: st.mtimeMs,
    media: MEDIA_EXT[ext],
    mime: MIME[ext],
    name: path.basename(real),
    projectId: project.id,
    offline: st.size > 0 && st.blocks === 0,
  };
}

// ───────────────────────── Generations manifest as input source ─────────────────────────

export async function generationInputs(limit = 60): Promise<GenerationInput[]> {
  const rows = await readManifest();
  const out: GenerationInput[] = [];
  for (let i = rows.length - 1; i >= 0 && out.length < limit; i--) {
    const r = rows[i];
    if (r.kind !== 'video' && r.kind !== 'voice') continue;
    out.push({
      id: `g_${r.id}`,
      name: path.basename(r.file),
      media: r.kind === 'video' ? 'video' : 'audio',
      size: r.bytes,
      created: r.created,
      prompt: r.prompt,
    });
  }
  return out;
}

/** File arg value (an `o_` or `g_` id) -> verified path. The client never supplies paths. */
export async function resolveInput(id: string, kinds: MediaClass[]): Promise<{ path: string; media: MediaClass; name: string; probe: Probe }> {
  if (typeof id !== 'string') throw new StudioError('File id must be a string.', 400);
  let file: string;
  let media: MediaClass;
  let name: string;
  let size: number;
  let mtimeMs: number;
  if (id.startsWith('g_')) {
    try {
      const { rec, file: f, size: s } = await resolveFile(id.slice(2));
      if (rec.kind !== 'video' && rec.kind !== 'voice') throw new StudioError('Only Generations video and voice items can be used here.', 400);
      file = f;
      media = rec.kind === 'video' ? 'video' : 'audio';
      name = path.basename(f);
      size = s;
      mtimeMs = (await fs.stat(f)).mtimeMs;
    } catch (err) {
      if (err instanceof MediaError) throw new StudioError(err.message, err.status);
      throw err;
    }
  } else {
    const r = await resolveOutputFile(id);
    file = r.path;
    media = r.media;
    name = r.name;
    size = r.size;
    mtimeMs = r.mtimeMs;
    if (r.offline) throw new StudioError(`${r.name} is an iCloud placeholder (not downloaded to this Mac). Open it in Finder to download it first.`, 409);
  }
  if (!kinds.includes(media)) throw new StudioError(`${name} is ${media}, but this input needs ${kinds.join(' or ')}.`, 400);
  return { path: file, media, name, probe: await probeFile(file, size, mtimeMs) };
}

// ───────────────────────── compositions ─────────────────────────

const num = (s: string | undefined) => (s !== undefined && /^\d+(\.\d+)?$/.test(s) ? Number(s) : undefined);

async function readIf(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

/** Cheap static discovery: <Composition id=...> in Remotion root files, data-composition-id in HyperFrames HTML. */
export async function staticCompositions(p: Project): Promise<CompositionInfo[]> {
  const out = new Map<string, CompositionInfo>();
  if (p.kind === 'remotion') {
    for (const rel of p.rootFiles) {
      const text = await readIf(path.join(p.path, rel));
      if (!text) continue;
      for (const m of text.matchAll(/<(?:Composition|Still)\b/g)) {
        const chunk = text.slice(m.index, m.index + 1800).split(/\/>/)[0];
        const id = /\bid=(?:"|'|\{["'])([A-Za-z0-9_-]+)/.exec(chunk)?.[1];
        if (!id || out.has(id)) continue;
        const fps = num(/\bfps=\{?(\d+)/.exec(chunk)?.[1]);
        const frames = num(/\bdurationInFrames=\{?(\d+)/.exec(chunk)?.[1]);
        out.set(id, {
          id,
          width: num(/\bwidth=\{?(\d+)/.exec(chunk)?.[1]),
          height: num(/\bheight=\{?(\d+)/.exec(chunk)?.[1]),
          fps,
          durationFrames: frames,
          durationSec: fps && frames ? Math.round((frames / fps) * 100) / 100 : undefined,
          source: 'static',
        });
      }
    }
  } else if (p.kind === 'hyperframes') {
    const files = ['index.html'];
    try {
      for (const f of await fs.readdir(path.join(p.path, 'compositions'))) if (f.endsWith('.html')) files.push(path.join('compositions', f));
    } catch {
      // no compositions/ folder
    }
    for (const rel of files) {
      const text = await readIf(path.join(p.path, rel));
      if (!text) continue;
      for (const m of text.matchAll(/<[^>]*\bdata-composition-id="([^"]+)"[^>]*>/g)) {
        if (out.has(m[1])) continue;
        out.set(m[1], {
          id: m[1],
          width: num(/\bdata-width="(\d+)"/.exec(m[0])?.[1]),
          height: num(/\bdata-height="(\d+)"/.exec(m[0])?.[1]),
          durationSec: num(/\bdata-duration="([\d.]+)"/.exec(m[0])?.[1]),
          source: 'static',
        });
      }
    }
  }
  return [...out.values()];
}

async function loadCliCache(): Promise<void> {
  if (R.cliLoaded) return;
  R.cliLoaded = true;
  if (!(await windsorMounted())) return;
  const text = await readIf(COMPOSITIONS_CACHE);
  if (!text) return;
  try {
    const j = JSON.parse(text) as Record<string, { at: string; items: CompositionInfo[] }>;
    for (const [k, v] of Object.entries(j)) if (v && Array.isArray(v.items)) R.cli.set(k, v);
  } catch {
    // corrupt cache: ignore
  }
}

export async function saveCliCompositions(projectId: string, items: CompositionInfo[]): Promise<void> {
  await loadCliCache();
  R.cli.set(projectId, { at: new Date().toISOString(), items });
  if (!(await windsorMounted())) return;
  try {
    await fs.mkdir(STUDIO_ROOT, { recursive: true });
    await fs.writeFile(COMPOSITIONS_CACHE, JSON.stringify(Object.fromEntries(R.cli)), 'utf8');
  } catch {
    // memory cache still works
  }
}

/** Parse `remotion compositions` stdout (tolerant: id, fps, WxH, frames, optional "(N sec)"). */
export function parseRemotionCompositions(stdout: string): CompositionInfo[] {
  const items: CompositionInfo[] = [];
  // eslint-disable-next-line no-control-regex
  const clean = stdout.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
  for (const line of clean.split('\n')) {
    const dims = /(\d{2,5})\s*x\s*(\d{2,5})/.exec(line);
    const id = /^\s*([A-Za-z0-9_-]+)\s/.exec(line)?.[1];
    if (!dims || !id || /^composition$/i.test(id)) continue;
    const before = line.slice(0, dims.index);
    const after = line.slice((dims.index ?? 0) + dims[0].length);
    const fps = num(/\b(\d{1,3})\b\s*$/.exec(before.replace(id, ''))?.[1]) ?? num(/(\d{1,3})\s*fps/i.exec(line)?.[1]);
    const frames = num(/\b(\d{1,7})\b/.exec(after)?.[1]);
    const sec = num(/\(([\d.]+)\s*sec/i.exec(line)?.[1]);
    items.push({
      id,
      width: Number(dims[1]),
      height: Number(dims[2]),
      fps,
      durationFrames: frames,
      durationSec: sec ?? (fps && frames ? Math.round((frames / fps) * 100) / 100 : undefined),
      source: 'cli',
    });
  }
  return items;
}

// ───────────────────────── project list ─────────────────────────

export async function listProjects(): Promise<{ projects: StudioProject[]; errors: string[] }> {
  const cfg = loadConfig();
  await loadCliCache();
  const projects = await Promise.all(
    cfg.projects.map(async (p): Promise<StudioProject> => {
      const [exists, stat, presets] = await Promise.all([
        projectExists(p),
        staticCompositions(p),
        Promise.all(p.presets.map((pr) => toPublicPreset(p, pr))),
      ]);
      const cli = R.cli.get(p.id);
      const merged = new Map<string, CompositionInfo>(stat.map((c) => [c.id, c]));
      for (const c of cli?.items ?? []) merged.set(c.id, { ...merged.get(c.id), ...c });
      const docs: { name: string; path: string }[] = [];
      for (const d of p.docs) {
        const full = path.resolve(p.path, d);
        if (full.startsWith(p.path + path.sep) && (await readIf(full)) !== null) docs.push({ name: d, path: full });
      }
      return {
        id: p.id,
        name: p.name,
        kind: p.kind,
        path: p.path,
        exists,
        notes: p.notes,
        docs,
        presets,
        compositions: [...merged.values()],
        compositionsCliAt: cli?.at ?? null,
        canListCompositions: !!p.compositionsArgv,
      };
    }),
  );
  return { projects, errors: cfg.errors };
}

export async function knownCompositionIds(p: Project): Promise<string[]> {
  await loadCliCache();
  const ids = new Set((await staticCompositions(p)).map((c) => c.id));
  for (const c of R.cli.get(p.id)?.items ?? []) ids.add(c.id);
  return [...ids];
}
