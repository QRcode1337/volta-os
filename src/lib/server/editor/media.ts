import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { StudioOutput } from '@/types/studio';
import type { EditorMediaGroup, EditorMediaItem, EditorMediaKind, EditorMediaList } from '@/types/editor';
import type { GenItemRecord } from '@/types/media';
import { MediaError } from '../media/config';
import { MusicError, getLibrary, loadConfig as musicLoadConfig, resolveTrack, type RawTrack } from '../music';
import { readManifest, resolveFile } from '../media/storage';
import { getProject, loadConfig, projectExists, type Project } from '../studio/config';
import { OUTPUT_SCAN_LIMIT, probeFile, projectOutputs, resolveOutputFile } from '../studio/index-projects';
import { FEEDBACK_DIR } from './feedback';
import { StudioError, windsorMounted } from '../studio/storage';
import { isEvicted } from '@/lib/server/icloud';

// The Editor media bin: every real Studio output (per configured project, incl. the Windsor renders folder) plus the
// Generations manifest. Paths are resolved by the existing Studio / Generations registries; the browser only gets ids + URLs.

const GEN_EXT_MEDIA: Record<string, EditorMediaKind> = { video: 'video', voice: 'audio', image: 'image' };

/** `brctl download "<path>"` with the characters that are special inside double quotes escaped. */
export function brctlCommand(file: string): string {
  return `brctl download "${file.replace(/[\\"$`]/g, '\\$&')}"`;
}

const studioUrl = (id: string) => `/api/studio/file?id=${encodeURIComponent(id)}`;
const genUrl = (id: string) => `/api/media/file?id=${encodeURIComponent(id)}`;
const musicUrl = (id: string) => `/api/music/file?id=${encodeURIComponent(id)}`;

/** A VANTA VECTOR track as a bin item. iCloud placeholders stay listed (offline + brctl) but are never opened. */
function musicItem(band: string, t: RawTrack): EditorMediaItem {
  const offline = t.storage === 'icloud';
  return {
    id: t.id,
    source: 'music',
    group: 'music',
    groupName: band,
    projectId: null,
    projectKind: null,
    projectPath: null,
    name: t.fileName,
    path: t.path,
    media: 'audio',
    ext: t.fileName.split('.').pop()?.toLowerCase() ?? '',
    size: t.bytes,
    mtime: t.mtime,
    durationSec: offline ? null : t.durationSec,
    fps: null,
    width: null,
    height: null,
    hasAudio: true,
    offline,
    url: musicUrl(t.id),
    brctl: offline ? brctlCommand(t.path) : null,
    canSaveNotes: false,
  };
}

function studioItem(project: Project, o: StudioOutput, hasAudio: boolean): EditorMediaItem {
  return {
    id: o.id,
    source: 'studio',
    group: project.id,
    groupName: project.name,
    projectId: project.id,
    projectKind: project.kind,
    projectPath: project.path,
    name: o.name,
    path: o.path,
    media: o.media,
    ext: o.ext,
    size: o.size,
    mtime: o.mtime,
    durationSec: o.durationSec,
    fps: o.fps ?? null,
    width: o.width,
    height: o.height,
    hasAudio: o.media === 'audio' || hasAudio,
    offline: o.offline,
    url: studioUrl(o.id),
    brctl: o.offline ? brctlCommand(o.path) : null,
    canSaveNotes: true,
  };
}

async function genItem(rec: GenItemRecord): Promise<EditorMediaItem | null> {
  const media = GEN_EXT_MEDIA[rec.kind];
  if (!media) return null;
  let st;
  try {
    st = await fs.stat(rec.file);
  } catch {
    return null; // drive unplugged or file removed
  }
  if (!st.isFile()) return null;
  const offline = isEvicted(st);
  const probed = offline ? null : await probeFile(rec.file, st.size, st.mtimeMs);
  // ffprobe reports a 0.04s / 25 fps "video" for a still image: stills have no duration or frame rate of their own
  const pr = media === 'image' && probed ? { ...probed, durationSec: null, fps: null } : probed;
  return {
    id: `g_${rec.id}`,
    source: 'generations',
    group: 'generations',
    groupName: 'Generations',
    projectId: null,
    projectKind: null,
    projectPath: null,
    name: path.basename(rec.file),
    path: rec.file,
    media,
    ext: path.extname(rec.file).slice(1).toLowerCase(),
    size: st.size,
    mtime: new Date(st.mtimeMs).toISOString(),
    durationSec: pr?.durationSec ?? null,
    fps: pr?.fps ?? null,
    width: pr?.width ?? null,
    height: pr?.height ?? null,
    hasAudio: media === 'audio' || !!pr?.hasAudio,
    offline,
    url: genUrl(rec.id),
    brctl: offline ? brctlCommand(rec.file) : null,
    canSaveNotes: false,
  };
}

export async function listEditorMedia(opts: { refresh?: boolean } = {}): Promise<EditorMediaList> {
  const cfg = loadConfig();
  const errors = [...cfg.errors];
  const studioGroups = await Promise.all(
    cfg.projects.map(async (p): Promise<EditorMediaGroup> => {
      let items: EditorMediaItem[] = [];
      let total = 0;
      try {
        const res = await projectOutputs(p, { limit: OUTPUT_SCAN_LIMIT, refresh: opts.refresh });
        items = res.items.map((o) => studioItem(p, o, o.media === 'video' && !o.offline));
        total = res.total;
      } catch (err) {
        errors.push(`${p.name}: ${(err as Error).message}`);
      }
      return { id: p.id, name: p.name, kind: p.kind, source: 'studio', path: p.path, exists: await projectExists(p), total, items };
    }),
  );

  let genItems: EditorMediaItem[] = [];
  try {
    const rows = await readManifest();
    const recent = rows.slice(-200).reverse();
    genItems = (await Promise.all(recent.map(genItem))).filter((x): x is EditorMediaItem => !!x);
  } catch (err) {
    errors.push(`Generations manifest: ${(err as Error).message}`);
  }
  const gens: EditorMediaGroup = { id: 'generations', name: 'Generations', kind: null, source: 'generations', path: null, exists: true, total: genItems.length, items: genItems };

  let musicGroup: EditorMediaGroup | null = null;
  try {
    const lib = await getLibrary({ refresh: opts.refresh });
    if (lib.tracks.length > 0) {
      const items = lib.tracks.map((t) => musicItem(lib.band, t)).sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
      musicGroup = { id: 'music', name: lib.band, kind: null, source: 'music', path: lib.roots[0]?.path ?? null, exists: true, total: items.length, items };
    }
  } catch (err) {
    errors.push(`Music library: ${(err as Error).message}`);
  }

  const groups = [...studioGroups.filter((g) => g.items.length > 0 || g.exists), gens, ...(musicGroup ? [musicGroup] : [])].sort((a, b) => {
    const am = a.items[0]?.mtime ?? '';
    const bm = b.items[0]?.mtime ?? '';
    return am < bm ? 1 : am > bm ? -1 : 0;
  });
  return { groups, storage: { windsorMounted: await windsorMounted(), feedbackDir: FEEDBACK_DIR }, errors };
}

/** Describe ONE file by its fileKey (inbox hand-offs beyond the bin's newest-N, or deep links). */
export async function describeEditorMedia(id: string): Promise<EditorMediaItem> {
  if (/^o_[0-9a-f]{16}$/.test(id)) {
    const f = await resolveOutputFile(id);
    const project = f.projectId ? getProject(f.projectId) : null;
    if (!project) throw new StudioError('This file no longer belongs to a configured Studio project.', 404);
    const pr = f.offline ? null : await probeFile(f.path, f.size, f.mtimeMs);
    const out: StudioOutput = {
      id,
      name: f.name,
      path: f.path,
      rel: f.name,
      projectId: project.id,
      media: f.media,
      ext: path.extname(f.path).slice(1).toLowerCase(),
      size: f.size,
      mtime: new Date(f.mtimeMs).toISOString(),
      durationSec: pr?.durationSec ?? null,
      width: pr?.width ?? null,
      height: pr?.height ?? null,
      fps: pr?.fps ?? null,
      offline: f.offline,
    };
    return studioItem(project, out, !!pr?.hasAudio);
  }
  if (/^g_[a-z0-9-]{6,40}$/i.test(id)) {
    let rec: GenItemRecord;
    try {
      rec = (await resolveFile(id.slice(2))).rec;
    } catch (err) {
      if (err instanceof MediaError) throw new StudioError(err.message, err.status);
      throw err;
    }
    const item = await genItem(rec);
    if (!item) throw new StudioError('File is missing (is the Windsor drive mounted?).', 404);
    return item;
  }
  if (/^m_[0-9a-f]{16}$/.test(id)) {
    try {
      return musicItem(musicLoadConfig().band, (await resolveTrack(id)).track);
    } catch (err) {
      if (err instanceof MusicError) throw new StudioError(err.message, err.status);
      throw err;
    }
  }
  throw new StudioError('Bad file id.', 400);
}
