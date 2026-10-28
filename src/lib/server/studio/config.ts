import 'server-only';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isWindsorMounted } from '../storage';
import { memoByFiles } from '../sources/cache';
import { STUDIO_ROOT } from './storage';
import type { ArgSpecPublic, MediaClass, PresetPublic, StudioKind, StudioProject } from '@/types/studio';
import { isEvictedFileSync } from '@/lib/server/icloud';

// Loads config/studio-projects.json. The ONLY commands Studio will ever run are the argv arrays defined there.

const CONFIG_PATH = path.join(process.cwd(), 'config', 'studio-projects.json');
export const KINDS: StudioKind[] = ['remotion', 'hyperframes', 'ffmpeg', 'pipeline'];
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,48}$/;
const HOME = os.homedir();

/** Bare executables a preset may start. Anything else must be ./node_modules/.bin/<tool> inside the project. */
const ALLOWED_BINS = new Set(['ffmpeg', 'node', 'npx', 'npm', 'python3', 'bash']);
const BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', path.join(HOME, '.local', 'bin'), '/usr/bin', '/bin'];
/** PATH handed to every job (the LaunchAgent's own PATH is minimal). */
export const JOB_PATH = BIN_DIRS.join(':');

export type ArgSpec =
  | { type: 'file'; label: string; kinds: MediaClass[] }
  | { type: 'files'; label: string; kinds: MediaClass[]; min: number; max: number }
  | { type: 'number' | 'int'; label: string; min: number; max: number; default?: number }
  | { type: 'enum'; label: string; values: Record<string, string | string[]>; default?: string }
  | { type: 'composition'; label: string };

export type ArgvElem = string | { each: string; flag: string };
export type ProgressKind = 'remotion' | 'ffmpeg' | 'generic';
export type DurationFrom = { arg: string } | { sum: string } | { file: string };

export interface Preset {
  id: string;
  label: string;
  description: string;
  confirm: string | null;
  argv: ArgvElem[];
  args: Record<string, ArgSpec>;
  derive: Record<string, { fn: 'concatFilter'; from: string }>;
  output: { ext: string; dir: string | null } | null;
  progress: ProgressKind;
  durationFrom: DurationFrom | null;
}

export interface Project {
  id: string;
  name: string;
  kind: StudioKind;
  /** Absolute project directory. */
  path: string;
  notes: string;
  docs: string[];
  rootFiles: string[];
  outputDirs: string[];
  presets: Preset[];
  compositionsArgv: string[] | null;
}

export interface StudioConfig {
  projects: Project[];
  errors: string[];
}

const expandHome = (p: string) => (p === '~' ? HOME : p.startsWith('~/') ? path.join(HOME, p.slice(2)) : p);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function parseArgSpec(name: string, raw: unknown): ArgSpec {
  if (!isObj(raw)) throw new Error(`arg ${name}: not an object`);
  const label = str(raw.label, name);
  const kinds = (Array.isArray(raw.kinds) ? raw.kinds : ['video']).filter((k): k is MediaClass => k === 'video' || k === 'audio');
  switch (raw.type) {
    case 'file':
      return { type: 'file', label, kinds: kinds.length ? kinds : ['video'] };
    case 'files': {
      const min = Math.max(1, Number(raw.min) || 1);
      const max = Math.min(24, Math.max(min, Number(raw.max) || 12));
      return { type: 'files', label, kinds: kinds.length ? kinds : ['video'], min, max };
    }
    case 'number':
    case 'int': {
      const min = Number(raw.min);
      const max = Number(raw.max);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) throw new Error(`arg ${name}: needs 0 <= min <= max`);
      const d = raw.default === undefined ? undefined : Number(raw.default);
      return { type: raw.type, label, min, max, default: d !== undefined && Number.isFinite(d) ? d : undefined };
    }
    case 'enum': {
      const values: Record<string, string | string[]> = {};
      if (Array.isArray(raw.values)) for (const v of raw.values) values[String(v)] = String(v);
      else if (isObj(raw.values)) {
        for (const [k, v] of Object.entries(raw.values)) {
          if (typeof v === 'string') values[k] = v;
          else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) values[k] = v as string[];
          else throw new Error(`arg ${name}: enum value ${k} must be a string or string[]`);
        }
      }
      if (!Object.keys(values).length) throw new Error(`arg ${name}: enum has no values`);
      const def = typeof raw.default === 'string' && raw.default in values ? raw.default : undefined;
      return { type: 'enum', label, values, default: def };
    }
    case 'composition':
      return { type: 'composition', label };
    default:
      throw new Error(`arg ${name}: unknown type ${String(raw.type)}`);
  }
}

function parsePreset(projectId: string, raw: unknown): Preset {
  if (!isObj(raw)) throw new Error('preset is not an object');
  const id = str(raw.id);
  if (!ID_RE.test(id)) throw new Error(`bad preset id "${id}"`);
  if (!Array.isArray(raw.argv) || raw.argv.length === 0) throw new Error(`${id}: argv must be a non-empty array`);
  const argv: ArgvElem[] = raw.argv.map((e) => {
    if (typeof e === 'string') return e;
    if (isObj(e) && typeof e.each === 'string' && typeof e.flag === 'string') return { each: e.each, flag: e.flag };
    throw new Error(`${id}: argv elements must be strings or {each, flag}`);
  });
  if (typeof argv[0] !== 'string') throw new Error(`${id}: argv[0] must be a string`);
  const args: Record<string, ArgSpec> = {};
  if (isObj(raw.args)) for (const [k, v] of Object.entries(raw.args)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(k)) throw new Error(`${id}: bad arg name ${k}`);
    args[k] = parseArgSpec(k, v);
  }
  const derive: Preset['derive'] = {};
  if (isObj(raw.derive)) for (const [k, v] of Object.entries(raw.derive)) {
    if (!isObj(v) || v.fn !== 'concatFilter' || typeof v.from !== 'string' || args[v.from]?.type !== 'files') throw new Error(`${id}: bad derive ${k}`);
    derive[k] = { fn: 'concatFilter', from: v.from };
  }
  let output: Preset['output'] = null;
  if (isObj(raw.output)) {
    const ext = str(raw.output.ext, 'mp4').toLowerCase();
    if (!/^[a-z0-9]{2,5}$/.test(ext)) throw new Error(`${id}: bad output.ext`);
    output = { ext, dir: typeof raw.output.dir === 'string' && raw.output.dir ? raw.output.dir : null };
  }
  // Every placeholder must resolve to something we define.
  const known = new Set([...Object.keys(args), ...Object.keys(derive), 'projectDir', ...(output ? ['out'] : [])]);
  for (const e of argv) {
    if (typeof e === 'string') {
      for (const m of e.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)) if (!known.has(m[1])) throw new Error(`${id}: unknown placeholder {${m[1]}}`);
    } else if (args[e.each]?.type !== 'files') throw new Error(`${id}: {each:"${e.each}"} needs a files arg`);
  }
  const progress: ProgressKind = raw.progress === 'remotion' || raw.progress === 'ffmpeg' ? raw.progress : 'generic';
  let durationFrom: DurationFrom | null = null;
  if (isObj(raw.durationFrom)) {
    const d = raw.durationFrom;
    if (typeof d.arg === 'string' && args[d.arg]) durationFrom = { arg: d.arg };
    else if (typeof d.sum === 'string' && args[d.sum]?.type === 'files') durationFrom = { sum: d.sum };
    else if (typeof d.file === 'string' && args[d.file]?.type === 'file') durationFrom = { file: d.file };
  }
  return {
    id,
    label: str(raw.label, id),
    description: str(raw.description),
    confirm: typeof raw.confirm === 'string' && raw.confirm ? raw.confirm : null,
    argv,
    args,
    derive,
    output,
    progress,
    durationFrom,
  };
}

function parseProject(raw: unknown): Project {
  if (!isObj(raw)) throw new Error('project is not an object');
  const id = str(raw.id);
  if (!ID_RE.test(id)) throw new Error(`bad project id "${id}"`);
  const kind = raw.kind as StudioKind;
  if (!KINDS.includes(kind)) throw new Error(`${id}: kind must be one of ${KINDS.join(', ')}`);
  const projectPath = path.resolve(expandHome(str(raw.path)));
  if (!str(raw.path)) throw new Error(`${id}: path is required`);
  const outputDirs = (Array.isArray(raw.outputDirs) ? raw.outputDirs : [])
    .filter((d): d is string => typeof d === 'string' && d.length > 0)
    .map((d) => path.resolve(path.isAbsolute(expandHome(d)) ? expandHome(d) : path.join(projectPath, d)));
  const presets: Preset[] = [];
  for (const p of Array.isArray(raw.presets) ? raw.presets : []) presets.push(parsePreset(id, p));
  const ids = new Set<string>();
  for (const p of presets) {
    if (ids.has(p.id)) throw new Error(`${id}: duplicate preset ${p.id}`);
    ids.add(p.id);
  }
  return {
    id,
    name: str(raw.name, id),
    kind,
    path: projectPath,
    notes: str(raw.notes),
    docs: (Array.isArray(raw.docs) ? raw.docs : []).filter((d): d is string => typeof d === 'string'),
    rootFiles: (Array.isArray(raw.rootFiles) ? raw.rootFiles : []).filter((d): d is string => typeof d === 'string'),
    outputDirs,
    presets,
    compositionsArgv: Array.isArray(raw.compositionsArgv) && raw.compositionsArgv.every((x) => typeof x === 'string') ? (raw.compositionsArgv as string[]) : null,
  };
}

/** Re-reads the file when it changes (edit the JSON, refresh the app). Bad entries are reported, not fatal. */
export function loadConfig(): StudioConfig {
  return memoByFiles('studio-config', [CONFIG_PATH], parseConfig);
}

function parseConfig(): StudioConfig {
  if (!fs.existsSync(CONFIG_PATH)) return { projects: [], errors: [`Missing ${CONFIG_PATH}`] };
  const value: StudioConfig = { projects: [], errors: [] };
  try {
    const json = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as { projects?: unknown[] };
    const seen = new Set<string>();
    for (const raw of json.projects ?? []) {
      try {
        const p = parseProject(raw);
        if (seen.has(p.id)) throw new Error(`duplicate project id ${p.id}`);
        seen.add(p.id);
        value.projects.push(p);
      } catch (err) {
        value.errors.push((err as Error).message);
      }
    }
  } catch (err) {
    value.errors.push(`studio-projects.json: ${(err as Error).message}`);
  }
  return value;
}

export function getProject(id: string): Project | null {
  return loadConfig().projects.find((p) => p.id === id) ?? null;
}

export function getPreset(project: Project, id: string): Preset | null {
  return project.presets.find((p) => p.id === id) ?? null;
}

/** Folders a project's files may be served from: the project, its configured output dirs. (The Windsor renders root is checked separately.) */
export function projectRoots(p: Project): string[] {
  return [p.path, ...p.outputDirs];
}

/** iCloud-evicted file: has a size but no blocks on disk. Reading it from this server fails with EDEADLK. */
export const isDataless = isEvictedFileSync;

/**
 * Cheap iCloud check on the files a preset certainly reads: the executable, package.json and any argv entry that is a
 * project file (src/index.ts, render.sh, ...). Null when all are on disk.
 */
export function datalessReason(project: Project, preset: Preset, bin: string): string | null {
  const files = [bin, path.join(project.path, 'package.json')];
  for (const el of preset.argv.slice(1)) {
    if (typeof el !== 'string' || el.startsWith('-') || el.includes('{')) continue;
    const abs = path.resolve(project.path, el);
    if (abs.startsWith(project.path + path.sep) && fs.existsSync(abs)) files.push(abs);
  }
  const bad = files.find(isDataless);
  if (!bad) return null;
  return `${path.basename(bad)} is an iCloud placeholder (evicted from this Mac) and the Studio server cannot download it. Open ${project.path} in Finder, or run brctl download on it, then reload.`;
}

/** Resolve argv[0] to an absolute executable, or null if it is not allowed / not installed. */
export function resolveExecutable(name: string, project: Project): string | null {
  if (name.startsWith('./node_modules/.bin/')) {
    const abs = path.resolve(project.path, name);
    if (!abs.startsWith(path.join(project.path, 'node_modules', '.bin') + path.sep)) return null;
    return fs.existsSync(abs) ? abs : null;
  }
  if (!ALLOWED_BINS.has(name)) return null;
  for (const dir of BIN_DIRS) {
    const c = path.join(dir, name);
    try {
      fs.accessSync(c, fs.constants.X_OK);
      return c;
    } catch {
      // keep looking
    }
  }
  return null;
}

export function resolveOutputDir(project: Project, preset: Preset): string | null {
  if (!preset.output?.dir) return null;
  const d = expandHome(preset.output.dir);
  return path.resolve(path.isAbsolute(d) ? d : path.join(project.path, d));
}

/** Preset visible to the browser (no raw argv), with readiness. */
export async function toPublicPreset(project: Project, preset: Preset): Promise<PresetPublic> {
  let reason: string | null = null;
  const bin = resolveExecutable(preset.argv[0] as string, project);
  if (!bin) {
    reason = (preset.argv[0] as string).startsWith('./node_modules/')
      ? `${preset.argv[0]} is not installed in this project (run npm install there).`
      : `${preset.argv[0]} is not an allowed or installed executable.`;
  }
  if (!reason && bin) reason = datalessReason(project, preset, bin);
  const customDir = resolveOutputDir(project, preset);
  if (!reason && !(await projectExists(project))) {
    reason = project.path.startsWith(STUDIO_ROOT) ? 'Windsor is not mounted.' : `Project folder is missing: ${project.path}`;
  }
  const args: Record<string, ArgSpecPublic> = {};
  for (const [k, a] of Object.entries(preset.args)) {
    if (a.type === 'enum') args[k] = { type: 'enum', label: a.label, options: Object.keys(a.values), default: a.default };
    else if (a.type === 'composition') args[k] = { type: 'composition', label: a.label };
    else args[k] = a as ArgSpecPublic;
  }
  return {
    id: preset.id,
    label: preset.label,
    description: preset.description,
    command: preset.argv.map((e) => (typeof e === 'string' ? e : `${e.flag} {${e.each}}…`)).join(' '),
    args,
    confirm: preset.confirm,
    progress: preset.progress,
    usesWindsor: !!preset.output && !customDir,
    outputDir: customDir,
    ready: !reason,
    notReadyReason: reason,
  };
}

export async function projectExists(p: Project): Promise<boolean> {
  // The studio folder is created on the first run; it counts as present whenever Windsor is mounted.
  if (p.path.startsWith(STUDIO_ROOT)) return isWindsorMounted();
  try {
    return (await fsp.stat(p.path)).isDirectory();
  } catch {
    return false;
  }
}

export type { StudioProject };
