import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import type { AttentionItem, ServiceCheck, StorageReport, SystemsReport, SystemsSummary } from '@/types/systems';
import { cached } from '@/lib/server/sources/cache';
import { getStatus as ltmStatus } from '@/lib/server/ltm';
import { getHonchoLlmDeps } from './honcho-deps';
import { launchdList, listeners, plistFacts, processes } from './host';
import { getMemory } from './memory';
import { probeLmStudio, probeOllama } from './models';
import { HERMES_DEFAULT_PORT, healthUrl, service, withPort } from '@/lib/server/services';
import { GiB } from '@/lib/server/storage';
import { HOME, httpGet, type HttpResult } from './run';
import { ALL_AGENT_LABELS, claudeMem, dockerHoncho, getMeta, hermes, hermesState, honcho, lmStudioService, ltmDaemon, ollama, omniroute, openclaw, volta, type Ctx } from './services';
import { getVolumes, peekSizes } from './storage';

// GET /api/systems: every probe in parallel with short timeouts, cached 15 s (directory sizes separately, 10 min).

const CORE_TTL_MS = 15_000;
const CORE_MAX_STALE_MS = 25_000;
const VOLTA_PORT = Number(process.env.PORT) || 50000;
/** The user's documented disk-cleanup playbook script (dry-run unless --apply). */
const CLEANUP_SCRIPT = path.join(HOME, 'bin', 'disk-cleanup.sh');

type Core = Omit<SystemsReport, 'storage'> & { volumes: StorageReport['volumes'] };

async function loadCore(): Promise<Core> {
  const t0 = Date.now();
  // Phase 1 — everything independent.
  const [ls, ld, plists, meta, self, oc, omni, cmem, hon, docker, hst, oll, lms, llm, memory, volumes, honchoDeps] = await Promise.all([
    listeners(),
    launchdList(),
    plistFacts(ALL_AGENT_LABELS),
    getMeta(),
    httpGet(`http://127.0.0.1:${VOLTA_PORT}/api/systems/ping`, 5_000),
    httpGet(healthUrl('openclaw')),
    httpGet(healthUrl('omniroute')),
    httpGet(healthUrl('claude-mem')),
    httpGet(healthUrl('honcho')),
    dockerHoncho(),
    hermesState(),
    probeOllama(),
    probeLmStudio('lmstudio', 'LM Studio', 1234),
    probeLmStudio('llmster', 'llmster', 1234),
    getMemory(),
    getVolumes(),
    getHonchoLlmDeps(),
  ]);

  // Phase 2 — the Hermes A2A port (a listener owned by the gateway pid, else the default) + one `ps` for every PID.
  const hermesPorts = hst.pid ? [...ls.entries()].filter(([, l]) => l.pid === hst.pid).map(([p]) => p) : [];
  const hermesPort = hermesPorts.includes(HERMES_DEFAULT_PORT) || !hermesPorts.length ? HERMES_DEFAULT_PORT : Math.min(...hermesPorts);
  const pids = [...[...ls.values()].map((l) => l.pid), ...(ld ? [...ld.values()].map((e) => e.pid ?? 0) : []), hst.pid ?? 0, Number((cmem.json as { pid?: unknown } | null)?.pid) || 0];
  const [hermesHttp, procs] = await Promise.all([httpGet(`${withPort(service('hermes').baseUrl, hermesPort)}${service('hermes').healthPath}`) as Promise<HttpResult>, processes(pids)]);

  const ltm = ltmStatus(); // synchronous SQLite read (~20 ms) — after the HTTP probes so it can't skew their latency
  const ctx: Ctx = { listeners: ls, launchd: ld, plists, procs, meta, now: Date.now() };
  const llmsterSvc = lmStudioService(ctx, llm, lms, honchoDeps);
  const lmsSvc = lmStudioService(ctx, lms, llm, honchoDeps);
  const services: ServiceCheck[] = [
    openclaw(ctx, oc),
    hermes(ctx, hst, hermesHttp, hermesPort),
    omniroute(ctx, omni),
    honcho(ctx, hon, docker, [oll.runtime, llm.runtime, lms.runtime], honchoDeps),
    claudeMem(ctx, cmem),
    ltmDaemon(ctx, ltm),
    ollama(ctx, oll, honchoDeps),
    llmsterSvc,
    lmsSvc,
    volta(ctx, self, VOLTA_PORT),
  ];

  const models = [oll.runtime, llm.runtime, lms.runtime];
  const counts = { up: 0, degraded: 0, down: 0, unknown: 0 };
  for (const s of services) counts[s.status]++;

  return {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    services,
    models,
    memory,
    volumes,
    attention: attentionFor(services, volumes, memory),
    counts,
  };
}

const GiBf = (b: number | null) => (b == null ? '?' : `${(b / GiB).toFixed(1)} GiB`);

function attentionFor(services: ServiceCheck[], volumes: StorageReport['volumes'], memory: SystemsReport['memory']): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const s of services) {
    if ((s.status === 'down' && s.core) || s.status === 'degraded') {
      const blocker = s.blockedBy ? services.find((x) => x.id === s.blockedBy && x.status !== 'up') : undefined;
      const fix = blocker?.command ? { ...blocker.command, label: `${blocker.name.split(' ')[0]} ${blocker.command.label.toLowerCase()}` } : s.command;
      out.push({
        id: `svc:${s.id}`,
        severity: s.status === 'down' && s.core ? 'critical' : 'warn',
        title: `${s.name} ${s.status === 'down' ? 'down' : 'degraded'}`,
        detail: [s.summary, s.notes.find((n) => !n.startsWith('Listening on all') && !n.startsWith('Health from') && !n.startsWith('Not a LaunchAgent') && !n.startsWith('Started by'))].filter(Boolean).join(' — '),
        target: `svc-${s.id}`,
        ...(fix ? { command: fix } : {}),
      });
    }
  }
  const seen = new Set<string>();
  for (const s of services) {
    for (const a of s.launchAgents) {
      if (seen.has(a.label)) continue;
      seen.add(a.label);
      if (a.health === 'failing') {
        out.push({
          id: `agent:${a.label}`,
          severity: 'warn',
          title: `${a.label} failing`,
          detail: `LaunchAgent (${a.role}) last exited with status ${a.lastExit}.${a.logPath ? ` Log: ${a.logPath}` : ''}`,
          target: `svc-${s.id}`,
          ...(a.logPath ? { command: { label: 'Log command', command: `tail -n 40 ${a.logPath.replace(/ /g, '\\ ')}` } } : {}),
        });
      } else if (a.health === 'not-loaded' && a.role === 'service' && s.core) {
        out.push({ id: `agent:${a.label}`, severity: 'warn', title: `${a.label} not loaded`, detail: 'Plist is installed but launchd has not loaded it — it will not restart on its own.', target: `svc-${s.id}` });
      }
    }
  }
  for (const v of volumes) {
    if (v.severity === 'ok') continue;
    out.push({
      id: `vol:${v.id}`,
      severity: v.severity,
      title: v.mounted ? `${v.label}: ${GiBf(v.freeBytes)} free` : `${v.label} not mounted`,
      detail: v.mounted ? `${v.usedPct}% used — ${v.thresholds}` : v.mount,
      target: 'storage',
      ...(v.id === 'boot' && fs.existsSync(CLEANUP_SCRIPT)
        ? { command: { label: 'Cleanup dry-run command', command: '~/bin/disk-cleanup.sh', note: 'Dry run by default — review, then re-run with --apply.' } }
        : {}),
    });
  }
  if (memory.severity !== 'ok') {
    out.push({
      id: 'memory',
      severity: memory.severity,
      title: `Memory pressure ${memory.pressureLevel ?? memory.severity}`,
      detail: [memory.freePct != null ? `${memory.freePct}% available` : null, memory.swapUsedBytes != null ? `swap ${GiBf(memory.swapUsedBytes)} used` : null].filter(Boolean).join(' · '),
      target: 'memory',
    });
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));
}

const getCore = (force = false) => cached('systems:core', CORE_TTL_MS, loadCore, { maxStaleMs: CORE_MAX_STALE_MS, force });

/** `force` re-probes now (after a fix ran) instead of serving the cached cycle. */
export async function getSystemsReport(force = false): Promise<SystemsReport> {
  const [core, sizes] = await Promise.all([getCore(force), peekSizes()]);
  const { volumes, ...rest } = core;
  return { ...rest, storage: { volumes, sizes } };
}

/**
 * Light payload for SystemsBadge: shares the cached probe cycle with the full report but never touches folder sizes
 * (peekSizes would re-arm the background du) and returns only counts + attention titles (~1 KB instead of ~20 KB).
 */
export async function getSystemsSummary(): Promise<SystemsSummary> {
  const core = await getCore();
  return {
    generatedAt: core.generatedAt,
    counts: core.counts,
    services: core.services.length,
    attention: core.attention.map(({ id, severity, title }) => ({ id, severity, title })),
  };
}
