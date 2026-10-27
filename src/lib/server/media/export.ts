import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { GenItemRecord, MediaKind } from '@/types/media';
import { EXPORT_ROOT, GEN_ROOT, MIN_FREE_BYTES, MediaError } from './config';
import { localDate, readManifest, requireStorage } from './storage';

// "Export": copy generated files into a brand-new folder under EXPORT_ROOT, with an index.csv describing them.
// Copies only (the generations and manifest are untouched). Spends nothing. Paths come from the manifest, never the client.

export type ExportFilter = 'all' | MediaKind;
export interface ExportResult {
  dir: string;
  name: string;
  count: number;
  bytes: number;
  skipped: string[];
}

const MAX_NAME = 60;
const stamp = (d = new Date()) => `${localDate(d)}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;

/** Folder name the user typed → safe single path segment (letters, digits, space, - _ .), or a dated default. */
export function exportFolderName(raw: unknown): string {
  const cleaned = typeof raw === 'string' ? raw.replace(/[^\w .-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, MAX_NAME).trim() : '';
  return cleaned || `export-${stamp()}`;
}

const csv = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const slug = (s: string) => s.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

/** Ordered output file name: 001_video_s1-T0_grok-imagine-video-1.5-lite.mp4 */
function outName(i: number, r: GenItemRecord): string {
  const ext = path.extname(r.file).toLowerCase() || '.bin';
  const sid = typeof r.params?.shotId === 'string' ? `_${slug(r.params.shotId.split('-')[0])}${typeof r.params.tier === 'number' ? `-T${r.params.tier}` : ''}` : '';
  return `${String(i + 1).padStart(3, '0')}_${r.kind}${sid}_${slug(r.model)}${ext}`;
}

export async function exportItems(p: { filter: unknown; name: unknown; ids?: unknown }): Promise<ExportResult> {
  const storage = await requireStorage();
  const filter: ExportFilter = p.filter === 'image' || p.filter === 'video' || p.filter === 'voice' ? p.filter : 'all';
  const ids = Array.isArray(p.ids) ? new Set(p.ids.filter((x): x is string => typeof x === 'string')) : null;

  // Newest first in the gallery; export oldest first so numbering follows creation (= shot order within a batch).
  const all = (await readManifest()).filter((r) => (filter === 'all' || r.kind === filter) && (!ids || ids.has(r.id)));
  const recs = [...all].sort((a, b) => a.created.localeCompare(b.created));
  if (!recs.length) throw new MediaError('Nothing to export in this filter.', 400);

  const genRoot = await fs.realpath(GEN_ROOT);
  const sources: { rec: GenItemRecord; file: string; size: number }[] = [];
  const skipped: string[] = [];
  for (const rec of recs) {
    try {
      const real = await fs.realpath(rec.file);
      if (!real.startsWith(genRoot + path.sep)) throw new Error('outside the generations folder');
      const st = await fs.stat(real);
      if (!st.isFile()) throw new Error('not a file');
      sources.push({ rec, file: real, size: st.size });
    } catch (err) {
      skipped.push(`${rec.id}: ${(err as Error).message.includes('ENOENT') ? 'file missing' : (err as Error).message}`);
    }
  }
  if (!sources.length) throw new MediaError(`None of the ${recs.length} file(s) could be found on Windsor.`, 404);

  const bytes = sources.reduce((a, s) => a + s.size, 0);
  if (storage.freeBytes - bytes < MIN_FREE_BYTES) {
    throw new MediaError(`Exporting ${(bytes / 1024 ** 2).toFixed(0)} MB would leave Windsor under ${MIN_FREE_BYTES / 1024 ** 3} GiB free.`, 507);
  }

  // A new folder every time: never merge into (or overwrite) an earlier export.
  await fs.mkdir(EXPORT_ROOT, { recursive: true });
  const base = exportFolderName(p.name);
  let name = base;
  let dir = path.join(EXPORT_ROOT, name);
  for (let n = 2; ; n++) {
    try {
      await fs.mkdir(dir);
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST' || n > 99) throw err;
      name = `${base}-${n}`;
      dir = path.join(EXPORT_ROOT, name);
    }
  }

  const rows = [['file', 'kind', 'provider', 'model', 'shot', 'tier', 'resolution', 'duration_s', 'est_usd', 'created', 'source', 'prompt'].join(',')];
  try {
    for (const [i, s] of sources.entries()) {
      const out = outName(i, s.rec);
      await fs.copyFile(s.file, path.join(dir, out), fs.constants.COPYFILE_EXCL);
      const pr = s.rec.params ?? {};
      rows.push(
        [out, s.rec.kind, s.rec.provider, s.rec.model, pr.shotId, pr.tier, pr.resolution, pr.duration, s.rec.estUsd.toFixed(4), s.rec.created, s.file, s.rec.prompt].map(csv).join(','),
      );
    }
    await fs.writeFile(path.join(dir, 'index.csv'), `${rows.join('\n')}\n`, { flag: 'wx' });
  } catch (err) {
    await fs.rm(dir, { recursive: true, force: true }); // all or nothing: no half-filled export folders
    throw err;
  }
  return { dir, name, count: sources.length, bytes, skipped };
}

/** Resolve a folder the export created (by name) for "Open in Finder"; refuses anything outside EXPORT_ROOT. */
export async function resolveExportDir(name: unknown): Promise<string> {
  if (typeof name !== 'string' || !name || name !== exportFolderName(name) || name.includes('/')) throw new MediaError('Bad export folder.', 400);
  const [root, real] = await Promise.all([fs.realpath(EXPORT_ROOT), fs.realpath(path.join(EXPORT_ROOT, name)).catch(() => '')]);
  if (!real || !real.startsWith(root + path.sep)) throw new MediaError('Export folder not found.', 404);
  return real;
}
