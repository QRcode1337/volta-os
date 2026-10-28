import 'server-only';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AgentStatus, RootCoverage, StatusResponse } from '@/components/research/types';
import { cached } from '../sources/cache';
import { loadConfig } from './config';
import { getGraph } from './graphs';
import { inventoryState, isPlaceholder, volumeMounted } from './inventory';
import { getLibrary } from './library';
import { getVault } from './vault';

const run = promisify(execFile);
const AGENT_TTL_MS = 20_000;

const readJson = async <T,>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
};
const exists = async (p: string) => !!(await fs.stat(p).catch(() => null));

async function agentStatus(label: string): Promise<AgentStatus> {
  const plistPath = path.join(process.env.HOME ?? '', 'Library/LaunchAgents', `${label}.plist`);
  const out: AgentStatus = { label, plist: await exists(plistPath), loaded: false, state: null, runs: null, lastExit: null, schedule: 'unknown' };
  let plist: Record<string, unknown> = {};
  try {
    const { stdout } = await run('plutil', ['-convert', 'json', '-o', '-', plistPath], { timeout: 4000 });
    plist = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    // unreadable plist: schedule stays unknown
  }
  const watch = Array.isArray(plist.WatchPaths) ? (plist.WatchPaths as string[]) : [];
  out.schedule = watch.length
    ? `watches ${watch.map((w) => path.basename(w)).join(', ')}/${typeof plist.ThrottleInterval === 'number' ? ` (throttle ${plist.ThrottleInterval}s)` : ''}`
    : typeof plist.StartInterval === 'number'
      ? `every ${Math.round(plist.StartInterval / 60)} min`
      : plist.StartCalendarInterval
        ? 'calendar schedule'
        : plist.KeepAlive
          ? 'keep-alive'
          : plist.RunAtLoad
            ? 'at load only'
            : 'on demand (no schedule in the plist)';
  try {
    const uid = process.getuid?.() ?? 501;
    const { stdout } = await run('launchctl', ['print', `gui/${uid}/${label}`], { timeout: 4000 });
    out.loaded = true;
    out.state = /^\s*state = (.+)$/m.exec(stdout)?.[1]?.trim() ?? null;
    const runs = /^\s*runs = (\d+)/m.exec(stdout)?.[1];
    out.runs = runs !== undefined ? Number(runs) : null;
    out.lastExit = /^\s*last exit code = (.+)$/m.exec(stdout)?.[1]?.trim() ?? null;
  } catch {
    out.loaded = false;
  }
  return out;
}

async function holdStatus(): Promise<StatusResponse['indexer']['hold']> {
  const cfg = loadConfig();
  const { envVar, plist, latestLog } = cfg.batchIndexHold;
  let enabled = false;
  try {
    const { stdout } = await run('plutil', ['-convert', 'json', '-o', '-', plist], { timeout: 4000 });
    const env = (JSON.parse(stdout) as { EnvironmentVariables?: Record<string, string> }).EnvironmentVariables ?? {};
    enabled = env[envVar] === '1';
  } catch {
    enabled = false;
  }
  let reason: string | null = null;
  let at: string | null = null;
  try {
    const last = (await fs.readFile(latestLog, 'utf8')).trim().split('\n').filter(Boolean).pop() ?? '';
    const m = /^\[([^\]]+)\]\s*(.*)$/.exec(last);
    at = m?.[1] ?? null;
    reason = (m?.[2] ?? last).replace(/^launchd batch HOLD N=\d+ reason:\s*/, '') || null;
  } catch {
    // no log
  }
  return { active: !enabled, reason: enabled ? null : (reason ?? `${envVar} is not set to 1 in the plist`), envVar, at };
}

async function lastBatch(file: string): Promise<StatusResponse['indexer']['lastBatch']> {
  try {
    const md = await fs.readFile(file, 'utf8');
    const heads = [...md.matchAll(/^## Batch (\d+) [—-] (.+)$/gm)];
    const last = heads[heads.length - 1];
    if (!last) return { n: null, at: null, processed: null, header: null };
    const after = md.slice((last.index ?? 0) + last[0].length, (last.index ?? 0) + last[0].length + 400);
    const processed = /\*\*Processed:\*\*\s*(\d+)/.exec(after)?.[1];
    return { n: Number(last[1]), at: last[2].trim(), processed: processed !== undefined ? Number(processed) : null, header: last[0].replace(/^## /, '') };
  } catch {
    return { n: null, at: null, processed: null, header: null };
  }
}

const agents = () => cached<AgentStatus[]>('research:agents', AGENT_TTL_MS, () => Promise.all(loadConfig().launchAgents.map(agentStatus)));

export async function getStatus(opts: { refresh?: boolean } = {}): Promise<StatusResponse> {
  const cfg = loadConfig();
  const lib = await getLibrary({ refresh: opts.refresh, waitMs: opts.refresh ? 25_000 : 2000 });
  const warnings: string[] = [...cfg.errors];

  const indexStatus = await readJson<{ timestamp?: string; perRoot?: { path: string; trackedCount: number; indexedTrackedCount: number }[] }>(cfg.stageA.indexStatusFile);
  const state = await readJson<{ total_processed?: number; batch_count?: number; stageb_failed?: unknown[] }>(cfg.stageA.stateFile);

  const roots: RootCoverage[] = cfg.roots.map((r) => {
    const info = lib?.inv.roots.find((x) => x.id === r.id);
    const rows = lib ? lib.rows.filter((x) => x.root === r.id && x.storage !== 'external') : [];
    const tr = indexStatus?.perRoot?.find((p) => p.path === r.path);
    return {
      id: r.id,
      label: r.label,
      path: r.path,
      exists: info?.exists ?? false,
      enabled: r.enabled,
      files: info?.files ?? 0,
      local: info?.local ?? 0,
      icloud: info?.icloud ?? 0,
      bytes: info?.bytes ?? 0,
      indexed: rows.filter((x) => x.sid).length,
      excluded: info?.excluded ?? [],
      truncated: info?.truncated ?? false,
      tracked: tr ? { tracked: tr.trackedCount, indexed: tr.indexedTrackedCount } : null,
    };
  });
  for (const r of roots) {
    if (lib && r.enabled && !r.exists) warnings.push(`Root "${r.label}" does not exist: ${r.path}`);
    if (r.truncated) warnings.push(`Root "${r.label}" hit the ${cfg.maxFilesPerRoot}-file cap, so the inventory is partial.`);
  }

  const recs = lib?.stageA.recs ?? [];
  const stageA: StatusResponse['stageA'] = {
    records: recs.length,
    matchedByPath: lib?.match.path ?? 0,
    matchedByName: lib?.match.name ?? 0,
    unmatched: lib?.match.none ?? 0,
    stageBFull: lib?.stageA.stageBFull ?? 0,
    stageBStubs: lib?.stageA.stageBStubs ?? 0,
    escalate: recs.filter((x) => x.action === 'escalate').length,
    contradictions: recs.filter((x) => x.hasContradiction).length,
    errors: (lib?.stageA.errors ?? []).slice(0, 5),
  };
  if (stageA.unmatched) warnings.push(`${stageA.unmatched} Stage A records point at files that are not under ~/Documents (they are listed as "external").`);
  if (stageA.errors.length) warnings.push(`${stageA.errors.length}+ Stage A records could not be parsed.`);

  const [agentList, hold, batch, voltamachina, windsor] = await Promise.all([
    agents(),
    holdStatus(),
    lastBatch(cfg.stageA.batchInsightsFile),
    volumeMounted('/Volumes/Voltamachina'),
    volumeMounted('/Volumes/Windsor'),
  ]);
  if (!voltamachina) warnings.push('/Volumes/Voltamachina is not mounted: Stage A source paths and mirror copies cannot be checked.');
  if (!windsor) warnings.push('/Volumes/Windsor is not mounted: the inventory is held in memory only.');

  const v = await getVault();
  const vault: StatusResponse['vault'] = {
    path: cfg.vault.path,
    exists: v.exists,
    syntheses: v.notes.filter((n) => n.rel.startsWith(`${cfg.vault.synthesisDir}/`)).length,
    notesLocal: v.local,
    notesIcloud: v.icloud,
    stripped: v.stripped,
  };

  const graphs: StatusResponse['graphs'] = await Promise.all(
    cfg.graphs.map(async (gc) => {
      const file = path.join(gc.dir, 'graph.json');
      const st = await fs.stat(file).catch(() => null);
      const base = { id: gc.id, label: gc.label, path: file, local: !!st && !isPlaceholder(st), nodes: null as number | null, edges: null as number | null, communities: null as number | null, mtime: st ? st.mtime.toISOString() : null };
      if (!st) return { ...base, error: 'graph.json not found' };
      if (isPlaceholder(st)) return { ...base, error: 'iCloud placeholder: not opened' };
      try {
        const g = await getGraph(gc.id);
        return { ...base, nodes: g.nodes.length, edges: g.links.length, communities: g.members.size, error: null };
      } catch (err) {
        return { ...base, error: (err as Error).message };
      }
    }),
  );

  const catalogPath = path.join(cfg.roots.find((r) => r.id === 'science')?.path ?? '', 'catalog.csv');
  const cst = await fs.stat(catalogPath).catch(() => null);
  const catalog: StatusResponse['catalog'] = {
    path: catalogPath,
    local: cst ? !isPlaceholder(cst) : null,
    note: !cst ? 'No catalog.csv found.' : isPlaceholder(cst) ? 'catalog.csv is an iCloud placeholder, so it was not read. The folder walk covers the same files.' : 'catalog.csv is local; phase 1 does not parse it.',
  };

  return {
    generatedAt: new Date().toISOString(),
    inventory: inventoryState(),
    roots,
    stageA,
    indexer: {
      agents: agentList,
      hold,
      lastBatch: batch,
      processedDocs: state?.total_processed ?? null,
      stageBFailed: Array.isArray(state?.stageb_failed) ? state.stageb_failed.length : null,
      indexStatusAt: indexStatus?.timestamp ?? null,
      voltamachinaMounted: voltamachina,
    },
    vault,
    graphs,
    catalog,
    phase2: { built: false, note: 'Phase 2 (embeddings and semantic search) is not built yet. Search today is filename, title, tag and summary matching, with an optional JEV re-rank of the top 30.' },
    warnings,
  };
}
