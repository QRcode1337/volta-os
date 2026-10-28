import 'server-only';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// config/research.json: roots, excludes, Voltamachine / vault / graph locations, the Windsor index path.

const CONFIG_PATH = path.join(process.cwd(), 'config', 'research.json');
const HOME = os.homedir();
const ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

export const expandHome = (p: string) => (p === '~' ? HOME : p.startsWith('~/') ? path.join(HOME, p.slice(2)) : p);

export interface RootCfg {
  id: string;
  label: string;
  path: string;
  enabled: boolean;
  excludeDirs: string[];
}
export interface GraphCfg {
  id: string;
  label: string;
  dir: string;
  docNodes: 'stagea' | 'source';
}
export interface ResearchConfig {
  indexPath: string;
  maxFilesPerRoot: number;
  inventoryTtlMs: number;
  excludeDirNames: Set<string>;
  excludeDirPatterns: RegExp[];
  packageSuffixes: string[];
  roots: RootCfg[];
  stageA: {
    dir: string;
    stateFile: string;
    indexStatusFile: string;
    batchInsightsFile: string;
    synthesisDir: string;
    logsDir: string;
    mirrorPrefixes: { prefix: string; root: string }[];
  };
  vault: { name: string; path: string; synthesisDir: string; noteDirs: string[] };
  graphs: GraphCfg[];
  launchAgents: string[];
  batchIndexHold: { envVar: string; plist: string; latestLog: string };
  /** Hash of everything that changes what the walk would find; a persisted inventory built under another hash is rebuilt. */
  hash: string;
  errors: string[];
}

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const abs = (p: string) => path.resolve(expandHome(p));

let memo: { mtimeMs: number; cfg: ResearchConfig } | null = null;

export function loadConfig(): ResearchConfig {
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(CONFIG_PATH).mtimeMs;
  } catch {
    // reported below as unreadable
  }
  if (memo && memo.mtimeMs === mtimeMs) return memo.cfg;

  const errors: string[] = [];
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    errors.push(`config/research.json unreadable: ${(err as Error).message}`);
  }

  const roots: RootCfg[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(raw.roots) ? (raw.roots as unknown[]) : []) {
    const o = obj(r);
    const id = str(o.id);
    const p = str(o.path);
    if (!ID_RE.test(id) || !p) {
      errors.push(`Ignored a root with a bad id or empty path (${JSON.stringify(o.id)}).`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`Duplicate root id "${id}" ignored.`);
      continue;
    }
    seen.add(id);
    roots.push({ id, label: str(o.label, id), path: abs(p), enabled: o.enabled !== false, excludeDirs: strs(o.excludeDirs) });
  }

  const patterns: RegExp[] = [];
  for (const src of strs(raw.excludeDirPatterns)) {
    try {
      patterns.push(new RegExp(src, 'i'));
    } catch {
      errors.push(`Ignored a bad excludeDirPatterns entry: ${src}`);
    }
  }

  const sa = obj(raw.stageA);
  const vt = obj(raw.vault);
  const bh = obj(raw.batchIndexHold);
  const graphs: GraphCfg[] = [];
  for (const g of Array.isArray(raw.graphs) ? (raw.graphs as unknown[]) : []) {
    const o = obj(g);
    const id = str(o.id);
    if (!ID_RE.test(id) || !str(o.dir)) continue;
    graphs.push({ id, label: str(o.label, id), dir: abs(str(o.dir)), docNodes: o.docNodes === 'stagea' ? 'stagea' : 'source' });
  }
  const mirrors: { prefix: string; root: string }[] = [];
  for (const m of Array.isArray(sa.mirrorPrefixes) ? (sa.mirrorPrefixes as unknown[]) : []) {
    const o = obj(m);
    if (str(o.prefix) && seen.has(str(o.root))) mirrors.push({ prefix: abs(str(o.prefix)), root: str(o.root) });
  }

  const cfg: ResearchConfig = {
    indexPath: abs(str(raw.indexPath, '/Volumes/Windsor/VOLTA/research/inventory.json')),
    maxFilesPerRoot: typeof raw.maxFilesPerRoot === 'number' ? Math.max(100, Math.floor(raw.maxFilesPerRoot)) : 60_000,
    inventoryTtlMs: (typeof raw.inventoryTtlMinutes === 'number' ? Math.max(1, raw.inventoryTtlMinutes) : 30) * 60_000,
    excludeDirNames: new Set(strs(raw.excludeDirNames).map((s) => s.toLowerCase())),
    excludeDirPatterns: patterns,
    packageSuffixes: strs(raw.packageSuffixes).map((s) => s.toLowerCase()),
    roots,
    stageA: {
      dir: abs(str(sa.dir, '~/ErisMorn/voltamachine/stagea')),
      stateFile: abs(str(sa.stateFile, '~/ErisMorn/voltamachine/state.json')),
      indexStatusFile: abs(str(sa.indexStatusFile, '~/ErisMorn/voltamachine/index-status.json')),
      batchInsightsFile: abs(str(sa.batchInsightsFile, '~/ErisMorn/voltamachine/batch-insights.md')),
      synthesisDir: abs(str(sa.synthesisDir, '~/ErisMorn/voltamachine/synthesis')),
      logsDir: abs(str(sa.logsDir, '~/ErisMorn/voltamachine/logs')),
      mirrorPrefixes: mirrors,
    },
    vault: {
      name: str(vt.name, 'Voltamachine'),
      path: abs(str(vt.path, '~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Voltamachine')),
      synthesisDir: str(vt.synthesisDir, 'Synthesis'),
      noteDirs: strs(vt.noteDirs),
    },
    graphs,
    launchAgents: strs(raw.launchAgents),
    batchIndexHold: {
      envVar: str(bh.envVar, 'VM_BATCH_INDEX_ENABLED'),
      plist: abs(str(bh.plist, '~/Library/LaunchAgents/com.erismorn.voltamachine-batch-index.plist')),
      latestLog: abs(str(bh.latestLog, '~/ErisMorn/voltamachine/logs/batch-index-launchd-latest.log')),
    },
    hash: '',
    errors,
  };
  cfg.hash = createHash('sha1')
    .update(
      JSON.stringify([
        cfg.roots.map((r) => [r.id, r.path, r.enabled, r.excludeDirs]),
        [...cfg.excludeDirNames].sort(),
        cfg.excludeDirPatterns.map((p) => p.source),
        cfg.packageSuffixes,
        cfg.maxFilesPerRoot,
      ]),
    )
    .digest('hex')
    .slice(0, 12);
  memo = { mtimeMs, cfg };
  return cfg;
}

export const rootById = (cfg: ResearchConfig, id: string) => cfg.roots.find((r) => r.id === id);
