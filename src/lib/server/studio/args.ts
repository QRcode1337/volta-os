import 'server-only';
import path from 'node:path';
import os from 'node:os';
import { redactSecrets } from '../redact';
import type { ArgSpec, Preset, Project } from './config';
import { resolveExecutable, resolveOutputDir } from './config';
import { knownCompositionIds, resolveInput } from './index-projects';
import { StudioError, projectRendersDir } from './storage';

// Turns { projectId, presetId, args } into a final argv. The browser sends only validated values (numbers, enum keys,
// composition ids, file ids); everything else in the argv is literal text from config/studio-projects.json.

type Probe = Awaited<ReturnType<typeof resolveInput>>['probe'];

export interface BuiltJob {
  exe: string;
  argv: string[];
  cwd: string;
  outPath: string | null;
  usesWindsor: boolean;
  display: Record<string, string>;
  command: string;
  expectedSec: number | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
function stamp(d = new Date()): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
const fmtNum = (n: number) => String(Math.round(n * 1000) / 1000);
const short = (s: string) => (s.startsWith(os.homedir()) ? `~${s.slice(os.homedir().length)}` : s);

function concatFilter(items: { probe: Probe; name: string }[]): string {
  const first = items[0].probe;
  const even = (n: number) => n - (n % 2);
  const W = even(first.width ?? 1920) || 1920;
  const H = even(first.height ?? 1080) || 1080;
  const parts: string[] = [];
  items.forEach((it, i) => {
    parts.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`);
    if (it.probe.hasAudio) {
      parts.push(`[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
    } else {
      if (!it.probe.durationSec) throw new StudioError(`${it.name} has no audio and its duration could not be read, so silence cannot be padded in.`, 400);
      parts.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${it.probe.durationSec},asetpts=PTS-STARTPTS[a${i}]`);
    }
  });
  parts.push(`${items.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${items.length}:v=1:a=1[v][a]`);
  return parts.join(';');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export async function buildJob(project: Project, preset: Preset, rawArgs: unknown): Promise<BuiltJob> {
  const raw = rawArgs === undefined || rawArgs === null ? {} : rawArgs;
  if (!isPlainObject(raw)) throw new StudioError('args must be an object.', 400);
  for (const k of Object.keys(raw)) if (!(k in preset.args)) throw new StudioError(`Unknown argument "${k}" for ${preset.id}.`, 400);

  const exe = resolveExecutable(preset.argv[0] as string, project);
  if (!exe) throw new StudioError(`${preset.argv[0]} is not an allowed or installed executable for this project.`, 400);

  const values = new Map<string, string | string[]>(); // substituted into argv
  const files = new Map<string, { path: string; name: string; probe: Probe }[]>();
  const display: Record<string, string> = {};

  for (const [name, spec] of Object.entries(preset.args) as [string, ArgSpec][]) {
    let v = raw[name];
    if (v === undefined || v === null || v === '') {
      if ('default' in spec && spec.default !== undefined) v = spec.default;
      else throw new StudioError(`"${spec.label}" is required.`, 400);
    }
    switch (spec.type) {
      case 'number':
      case 'int': {
        const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : NaN;
        if (!Number.isFinite(n)) throw new StudioError(`"${spec.label}" must be a number.`, 400);
        if (spec.type === 'int' && !Number.isInteger(n)) throw new StudioError(`"${spec.label}" must be a whole number.`, 400);
        if (n < spec.min || n > spec.max) throw new StudioError(`"${spec.label}" must be between ${spec.min} and ${spec.max}.`, 400);
        values.set(name, fmtNum(n));
        display[spec.label] = fmtNum(n);
        break;
      }
      case 'enum': {
        if (typeof v !== 'string' || !Object.prototype.hasOwnProperty.call(spec.values, v)) {
          throw new StudioError(`"${spec.label}" must be one of: ${Object.keys(spec.values).join(', ')}.`, 400);
        }
        values.set(name, spec.values[v]);
        display[spec.label] = v;
        break;
      }
      case 'composition': {
        if (typeof v !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/.test(v)) throw new StudioError(`"${spec.label}" is not a valid composition id.`, 400);
        const known = await knownCompositionIds(project);
        if (known.length && !known.includes(v)) throw new StudioError(`Unknown composition "${v}". Known: ${known.join(', ')}.`, 400);
        values.set(name, v);
        display[spec.label] = v;
        break;
      }
      case 'file': {
        const r = await resolveInput(v as string, spec.kinds);
        files.set(name, [r]);
        values.set(name, r.path);
        display[spec.label] = r.name;
        break;
      }
      case 'files': {
        if (!Array.isArray(v) || v.length < spec.min || v.length > spec.max) {
          throw new StudioError(`"${spec.label}" needs ${spec.min} to ${spec.max} files.`, 400);
        }
        const rs = [];
        for (const id of v) rs.push(await resolveInput(id as string, spec.kinds));
        files.set(name, rs);
        display[spec.label] = rs.map((r) => r.name).join(' + ');
        break;
      }
    }
  }

  for (const [name, d] of Object.entries(preset.derive)) {
    const src = files.get(d.from) ?? [];
    values.set(name, concatFilter(src));
  }

  // Output path
  let outPath: string | null = null;
  let usesWindsor = false;
  if (preset.output) {
    const custom = resolveOutputDir(project, preset);
    const dir = custom ?? projectRendersDir(project.id);
    usesWindsor = !custom;
    outPath = path.join(dir, `${project.id}__${preset.id}__${stamp()}.${preset.output.ext}`);
  }

  // argv
  const argv: string[] = [];
  const sub = (s: string): string =>
    s.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (_m, key: string) => {
      if (key === 'out') return outPath ?? '';
      if (key === 'projectDir') return project.path;
      const v = values.get(key);
      if (typeof v !== 'string') throw new StudioError(`Placeholder {${key}} cannot be used inside a larger argument.`, 500);
      return v;
    });
  for (let i = 1; i < preset.argv.length; i++) {
    const el = preset.argv[i];
    if (typeof el !== 'string') {
      for (const f of files.get(el.each) ?? []) argv.push(el.flag, f.path);
      continue;
    }
    const exact = /^\{([a-zA-Z][a-zA-Z0-9_]*)\}$/.exec(el);
    const v = exact ? values.get(exact[1]) : undefined;
    if (Array.isArray(v)) argv.push(...v);
    else argv.push(sub(el));
  }
  // A user-derived value must never be able to turn into an option: file paths are absolute, numbers are
  // non-negative and composition ids start with a letter, digit or underscore, so nothing begins with "-".
  for (const [name, spec] of Object.entries(preset.args)) {
    if (spec.type === 'composition' || spec.type === 'number' || spec.type === 'int') {
      const v = values.get(name);
      if (typeof v === 'string' && v.startsWith('-')) throw new StudioError('Refusing an argument that looks like an option.', 400);
    }
  }

  // Progress denominator
  let expectedSec: number | null = null;
  const df = preset.durationFrom;
  if (df) {
    if ('arg' in df) expectedSec = Number(values.get(df.arg)) || null;
    else if ('sum' in df) expectedSec = (files.get(df.sum) ?? []).reduce((a, f) => a + (f.probe.durationSec ?? 0), 0) || null;
    else expectedSec = files.get(df.file)?.[0]?.probe.durationSec ?? null;
  }

  const command = redactSecrets([path.basename(exe), ...argv].map((a) => (/[\s"'$;|&]/.test(a) || a === '' ? JSON.stringify(short(a)) : short(a))).join(' '));
  return { exe, argv, cwd: project.path, outPath, usesWindsor, display, command, expectedSec };
}
