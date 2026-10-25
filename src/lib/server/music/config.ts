import 'server-only';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MusicError } from './errors';

// config/music.json: library roots, discovery settings, extensions and the Windsor meta path.

const CONFIG_PATH = path.join(process.cwd(), 'config', 'music.json');
const HOME = os.homedir();
const ID_RE = /^[a-z0-9][a-z0-9-]{0,48}$/;
const DEFAULT_EXTS = ['.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg', '.opus', '.aiff', '.aif'];

export const expandHome = (p: string) => (p === '~' ? HOME : p.startsWith('~/') ? path.join(HOME, p.slice(2)) : p);
export const collapseHome = (p: string) => (p === HOME ? '~' : p.startsWith(HOME + path.sep) ? `~/${p.slice(HOME.length + 1)}` : p);

export interface RootCfg {
  id: string;
  label: string;
  /** Absolute, ~ expanded. */
  path: string;
  enabled: boolean;
  /** Folder levels scanned below the root (0 = only the folder itself). */
  depth: number;
}

export interface MusicConfig {
  band: string;
  roots: RootCfg[];
  discover: { base: string; maxDepth: number };
  extensions: Set<string>;
  metaPath: string;
  /** Problems found while reading the file (shown in the UI, never fatal). */
  errors: string[];
}

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

export function loadConfig(): MusicConfig {
  const errors: string[] = [];
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    errors.push(`config/music.json unreadable: ${(err as Error).message}`);
  }
  const roots: RootCfg[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(raw.roots) ? (raw.roots as Record<string, unknown>[]) : []) {
    const id = str(r?.id);
    const p = str(r?.path);
    if (!ID_RE.test(id) || !p) {
      errors.push(`Ignored a root with a bad id or empty path (${JSON.stringify(r?.id)}).`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`Duplicate root id "${id}" ignored.`);
      continue;
    }
    seen.add(id);
    const depth = typeof r.depth === 'number' && Number.isInteger(r.depth) ? Math.min(3, Math.max(0, r.depth)) : 1;
    roots.push({ id, label: str(r.label, id), path: path.resolve(expandHome(p)), enabled: r.enabled !== false, depth });
  }
  const disc = (raw.discover ?? {}) as Record<string, unknown>;
  const exts = Array.isArray(raw.extensions) ? (raw.extensions as unknown[]).filter((e): e is string => typeof e === 'string' && /^\.[a-z0-9]{2,5}$/i.test(e)) : DEFAULT_EXTS;
  return {
    band: str(raw.band, 'VANTA VECTOR'),
    roots,
    discover: {
      base: path.resolve(expandHome(str(disc.base, '~/Documents/Audio'))),
      maxDepth: typeof disc.maxDepth === 'number' ? Math.min(4, Math.max(0, Math.floor(disc.maxDepth))) : 3,
    },
    extensions: new Set((exts.length ? exts : DEFAULT_EXTS).map((e) => e.toLowerCase())),
    metaPath: path.resolve(expandHome(str(raw.metaPath, '/Volumes/Windsor/VOLTA/music/meta.json'))),
    errors,
  };
}

/** Rewrites only `roots` in config/music.json (everything else, including _doc, is preserved). */
export function saveRoots(roots: { id: string; label: string; path: string; enabled: boolean; depth: number }[]): void {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    throw new MusicError(`config/music.json is unreadable, so it was not changed: ${(err as Error).message}`, 500);
  }
  raw.roots = roots.map((r) => ({ id: r.id, label: r.label, path: collapseHome(r.path), enabled: r.enabled, depth: r.depth }));
  const tmp = `${CONFIG_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, CONFIG_PATH);
}
