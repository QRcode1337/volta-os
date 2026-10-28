import 'server-only';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { PathSize, Severity, StorageSizes, VolumeUsage } from '@/types/systems';
import { cached } from '@/lib/server/sources/cache';
import { LTM_DB_PATH, LTM_FRAMES_DIR } from '@/lib/server/ltm';
import { GiB, WINDSOR_ROOT, tilde, volumeMounted } from '@/lib/server/storage';
import { BIN, HOME, run } from './run';

// Volumes (df -k, every probe cycle — ~8 ms) and the sizes of the big directories (du -sk, nice'd, sequential,
// cached 10 min and refreshed in the background — never on the request path).

interface VolumeDef {
  id: string;
  label: string;
  mount: string;
  /** Free-space thresholds in bytes (boot SSD) or used-percent thresholds (external drives). */
  rule: { kind: 'free'; warn: number; critical: number } | { kind: 'pct'; warn: number; critical: number };
  note?: string;
}

const VOLUMES: VolumeDef[] = [
  {
    id: 'boot',
    label: 'Boot SSD',
    mount: '/',
    rule: { kind: 'free', warn: 15 * GiB, critical: 8 * GiB },
    note: 'APFS container — used = capacity − free, across all volumes',
  },
  { id: 'windsor', label: 'Windsor', mount: WINDSOR_ROOT, rule: { kind: 'pct', warn: 90, critical: 97 }, note: 'LTM database, frames and Ollama models' },
  { id: 'voltamachina', label: 'Voltamachina', mount: '/Volumes/Voltamachina', rule: { kind: 'pct', warn: 90, critical: 97 }, note: 'cache offload drive' },
];

const fmtGiB = (b: number) => `${Math.round(b / GiB)} GiB`;

function thresholdText(r: VolumeDef['rule']): string {
  return r.kind === 'free' ? `warn < ${fmtGiB(r.warn)} free · critical < ${fmtGiB(r.critical)}` : `warn ≥ ${r.warn}% used · critical ≥ ${r.critical}% (VOLTA default)`;
}

async function volume(def: VolumeDef): Promise<VolumeUsage> {
  const base = { id: def.id, label: def.label, mount: def.mount, thresholds: thresholdText(def.rule), note: def.note ?? null };
  const empty = { ...base, mounted: false, totalBytes: null, freeBytes: null, usedBytes: null, usedPct: null };
  if (def.mount !== '/' && !(await volumeMounted(def.mount))) return { ...empty, severity: def.id === 'boot' ? 'critical' : 'warn', note: 'not mounted' };
  const r = await run(BIN.df, ['-k', def.mount], 3_000);
  const line = r.stdout.trim().split('\n')[1] ?? '';
  // Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted on (mount may contain spaces)
  const m = line.match(/^\S+\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+%\s+(?:\d+\s+\d+\s+\d+%\s+)?(.+)$/);
  if (!m) return { ...empty, mounted: true, severity: 'warn', note: r.error ?? 'df gave no data' };
  if (m[4].trim() !== def.mount) return { ...empty, severity: 'warn', note: 'not mounted' }; // df fell back to the parent fs
  const total = Number(m[1]) * 1024;
  const free = Number(m[3]) * 1024;
  const used = Math.max(0, total - free);
  const usedPct = total ? Math.round((used / total) * 1000) / 10 : 0;
  let severity: Severity = 'ok';
  if (def.rule.kind === 'free') severity = free < def.rule.critical ? 'critical' : free < def.rule.warn ? 'warn' : 'ok';
  else severity = usedPct >= def.rule.critical ? 'critical' : usedPct >= def.rule.warn ? 'warn' : 'ok';
  return { ...base, mounted: true, totalBytes: total, freeBytes: free, usedBytes: used, usedPct, severity };
}

export function getVolumes(): Promise<VolumeUsage[]> {
  return Promise.all(VOLUMES.map(volume));
}

// ── Directory sizes ──

const PROJECT_DIR = process.cwd();
const LTM_DIR = path.dirname(LTM_DB_PATH);
const DOCKER_RAW = path.join(HOME, 'Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw');
/** ltm_prune.py's quarantine may be purged from this date (user's rule). */
const PRUNED_PURGE_AFTER = '2026-10-31';

interface SizeDef {
  id: string;
  label: string;
  path: string;
  volume: string;
  mode: 'du' | 'file' | 'sparse';
  note?: string;
  purgeAfter?: string;
}

const SIZES: SizeDef[] = [
  { id: 'ltm-db', label: 'LTM database', path: LTM_DB_PATH, volume: 'windsor', mode: 'file', note: 'incl. -wal / -shm' },
  { id: 'ltm-frames', label: 'LTM frames', path: LTM_FRAMES_DIR, volume: 'windsor', mode: 'du' },
  {
    id: 'ltm-pruned',
    label: 'LTM pruned (quarantine)',
    path: path.join(LTM_DIR, 'ltm_pruned'),
    volume: 'windsor',
    mode: 'du',
    note: 'kept by ltm-prune; purge allowed from Oct 31 2026',
    purgeAfter: PRUNED_PURGE_AFTER,
  },
  { id: 'pieces-vault', label: 'Pieces-Vault', path: path.join(HOME, 'Pieces-Vault'), volume: 'boot', mode: 'du' },
  { id: 'claude-projects', label: 'Claude Code transcripts', path: path.join(HOME, '.claude/projects'), volume: 'boot', mode: 'du' },
  { id: 'claude-mem', label: 'claude-mem data', path: path.join(HOME, '.claude-mem'), volume: 'boot', mode: 'du' },
  { id: 'volta-node-modules', label: 'VOLTA node_modules', path: path.join(PROJECT_DIR, 'node_modules'), volume: 'boot', mode: 'du' },
  { id: 'volta-next', label: 'VOLTA .next (dev build cache)', path: path.join(PROJECT_DIR, '.next'), volume: 'boot', mode: 'du' },
  {
    id: 'docker-raw',
    label: 'Docker Desktop disk image',
    path: DOCKER_RAW,
    volume: 'boot',
    mode: 'sparse',
    note: 'sparse file — allocated size shown, logical maximum in brackets',
  },
];

const SIZES_TTL_MS = 10 * 60_000;
const SIZES_MAX_STALE_MS = 6 * 60 * 60_000;
const DU_TIMEOUT_MS = 120_000;

async function measure(def: SizeDef): Promise<PathSize> {
  const base: PathSize = {
    id: def.id,
    label: def.label,
    path: tilde(def.path),
    bytes: null,
    apparentBytes: null,
    volume: def.volume,
    note: def.note ?? null,
    partial: false,
    error: null,
    ...(def.purgeAfter ? { purgeAfter: def.purgeAfter } : {}),
  };
  if (!fs.existsSync(def.path)) {
    const vol = VOLUMES.find((v) => v.id === def.volume);
    return { ...base, error: vol && vol.id !== 'boot' && !(await volumeMounted(vol.mount)) ? 'volume not mounted' : 'not found' };
  }
  if (def.mode === 'file') {
    let bytes = 0;
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        const st = await fsp.stat(def.path + suffix);
        bytes += st.blocks * 512;
      } catch {
        // no wal/shm
      }
    }
    return { ...base, bytes };
  }
  if (def.mode === 'sparse') {
    const st = await fsp.stat(def.path);
    return { ...base, bytes: st.blocks * 512, apparentBytes: st.size };
  }
  const r = await run(BIN.nice, ['-n', '15', BIN.du, '-sk', def.path], DU_TIMEOUT_MS, 1024 * 1024);
  const kb = Number(r.stdout.trim().split(/\s+/)[0]);
  if (!Number.isFinite(kb) || !r.stdout.trim()) return { ...base, error: r.error ?? 'du failed' };
  return { ...base, bytes: kb * 1024, partial: r.code !== 0, error: r.code !== 0 ? 'some entries unreadable — lower bound' : null };
}

interface SizesValue {
  items: PathSize[];
  computedAt: string;
  durationMs: number;
}

/** Sequential (one du at a time, low CPU priority): ~8 s for everything on this Mac. */
async function loadSizes(): Promise<SizesValue> {
  const t0 = Date.now();
  const items: PathSize[] = [];
  for (const def of SIZES) {
    try {
      items.push(await measure(def));
    } catch (err) {
      items.push({ id: def.id, label: def.label, path: tilde(def.path), bytes: null, apparentBytes: null, volume: def.volume, note: def.note ?? null, partial: false, error: (err as Error).message });
    }
  }
  return { items, computedAt: new Date().toISOString(), durationMs: Date.now() - t0 };
}

/**
 * Sizes without waiting: the cached value when there is one (a stale one triggers a background refresh),
 * otherwise `pending` while the first measurement runs.
 */
export async function peekSizes(waitMs = 250): Promise<StorageSizes> {
  const p = cached('systems:sizes', SIZES_TTL_MS, loadSizes, { maxStaleMs: SIZES_MAX_STALE_MS });
  const ttlMinutes = SIZES_TTL_MS / 60_000;
  try {
    const v = await Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), waitMs))]);
    p.catch(() => {}); // a late failure is logged by cache.ts
    if (!v) return { status: 'pending', computedAt: null, durationMs: null, ttlMinutes, items: [], error: null };
    return { status: 'ready', computedAt: v.computedAt, durationMs: v.durationMs, ttlMinutes, items: v.items, error: null };
  } catch (err) {
    return { status: 'error', computedAt: null, durationMs: null, ttlMinutes, items: [], error: (err as Error).message };
  }
}
