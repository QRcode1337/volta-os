import 'server-only';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { ContainerInfo, LaunchAgentState, ModelRuntime, ServiceCheck, ServiceProcess } from '@/types/systems';
import type { LtmStatus } from '@/types/ltm';
import { cached } from '@/lib/server/sources/cache';
import { HONCHO_START_COMMAND, HONCHO_URL } from '@/lib/server/honcho';
import { LTM_LIVE_MINUTES } from '@/types/sources';
import { agentState, bindOf, type AgentOpts, type LaunchdEntry, type Listener, type PlistMap } from './host';
import type { HonchoLlmDeps, HonchoLlmTarget } from './honcho-deps';
import type { RuntimeProbe } from './models';
import { redactSecrets } from '../redact';
import { BIN, GiB, HOME, arr, num, obj, run, str, tilde, type HttpResult } from './run';

// One builder per service. Inputs are gathered once per probe cycle (index.ts); builders only interpret them.
// Probed JSON is never passed through — only the named fields below (health payloads can carry paths/auth info).

const KICK = (label: string, restart = true) => `launchctl kickstart${restart ? ' -k' : ''} gui/$(id -u)/${label}`;

/** Every LaunchAgent label a card shows (plist facts are read for these, cached 5 min). */
export const AGENT_LABELS = {
  volta: [['com.epsilon.volta-os', 'service']],
  openclaw: [
    ['ai.openclaw.gateway', 'service'],
    ['com.local.openclaw-health', 'health check'],
    ['com.local.openclaw-manual-backup', 'backup'],
  ],
  omniroute: [
    ['com.omniroute.autostart', 'service'],
    ['ai.omniroute.scheduled-restart', 'scheduled restart'],
    ['ai.omniroute.breaker-decay', 'breaker decay'],
  ],
  hermes: [
    ['ai.hermes.gateway', 'service'],
    ['com.patrick.hermes-revert', 'scheduled revert'],
  ],
  ollama: [
    ['com.ollama.ollama', 'Ollama app (login item)', { appManaged: true }],
    ['ollama.environment', 'sets OLLAMA_MODELS'],
  ],
  llmster: [['com.epsilon.llmster-autostart', 'autostart at login']],
  docker: [['application.com.docker.docker.*', 'engine (app-managed job)', { name: 'Docker Desktop' }]],
  ltm: [
    ['com.unvolta.ltm-daemon', 'capture daemon'],
    ['com.unvolta.ltm-ingest', 'ingest → Pieces-Vault'],
    ['com.unvolta.ltm-prune', 'prune'],
  ],
} as const satisfies Record<string, readonly (readonly [string, string] | readonly [string, string, AgentOpts])[]>;

export const ALL_AGENT_LABELS: string[] = Object.values(AGENT_LABELS).flatMap((list) => list.map(([l]) => l));

// ── Static-ish facts (5 min) ──

interface Meta {
  voltaVersion: string | null;
  nextVersion: string | null;
  claudeMemWorker: string | null;
  bun: string;
}

async function readVersion(file: string): Promise<string | null> {
  try {
    const v = (JSON.parse(await fsp.readFile(file, 'utf8')) as { version?: unknown }).version;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

const semverKey = (v: string) => v.split(/[.-]/).map((p) => (/^\d+$/.test(p) ? p.padStart(6, '0') : p)).join('.');

async function loadMeta(): Promise<Meta> {
  const cwd = process.cwd();
  const pluginDir = path.join(HOME, '.claude/plugins/cache/thedotmack/claude-mem');
  let claudeMemWorker: string | null = null;
  try {
    const versions = (await fsp.readdir(pluginDir)).filter((v) => /^\d/.test(v)).sort((a, b) => semverKey(b).localeCompare(semverKey(a)));
    for (const v of versions) {
      const f = path.join(pluginDir, v, 'scripts', 'worker-service.cjs');
      if (fs.existsSync(f)) {
        claudeMemWorker = f;
        break;
      }
    }
  } catch {
    // plugin not installed
  }
  const bunPath = path.join(HOME, '.bun/bin/bun');
  return {
    voltaVersion: await readVersion(path.join(cwd, 'package.json')),
    nextVersion: await readVersion(path.join(cwd, 'node_modules/next/package.json')),
    claudeMemWorker,
    bun: fs.existsSync(bunPath) ? tilde(bunPath) : 'bun',
  };
}

export const getMeta = () => cached('systems:meta', 5 * 60_000, loadMeta);

// ── Docker (Honcho containers) ──

export interface DockerResult {
  /** up = CLI answered · down = engine not running · error = CLI failed or hung for another reason (state unknown). */
  daemon: 'up' | 'down' | 'error' | 'no-cli';
  containers: ContainerInfo[];
  error: string | null;
}

export async function dockerHoncho(): Promise<DockerResult> {
  if (BIN.docker === 'docker' && !process.env.PATH?.split(':').some((d) => fs.existsSync(path.join(d, 'docker')))) {
    return { daemon: 'no-cli', containers: [], error: 'docker CLI not found' };
  }
  const fmt = '{{.Names}}\t{{.State}}\t{{.Status}}\t{{.Image}}\t{{.Label "com.docker.compose.service"}}';
  const r = await run(BIN.docker, ['ps', '-a', '--filter', 'label=com.docker.compose.project=honcho', '--format', fmt], 5_000);
  if (r.code !== 0) {
    // A timeout (code null) or any other CLI failure says nothing about the engine — report it, never assume "up".
    const daemonDown = r.code !== null && /cannot connect|docker daemon|docker\.sock|is the docker daemon running/i.test(r.stderr + (r.error ?? ''));
    const error = (r.error ?? (r.code === null ? 'docker did not start' : `docker exited ${r.code}`)).split(HOME).join('~');
    return { daemon: daemonDown ? 'down' : 'error', containers: [], error };
  }
  const containers = r.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, state, status, image, service] = line.split('\t');
      const health: ContainerInfo['health'] = /\(healthy\)/.test(status) ? 'healthy' : /unhealthy/.test(status) ? 'unhealthy' : /health: starting/.test(status) ? 'starting' : null;
      return { name, state, status, image, service: service || name, health };
    })
    .sort((a, b) => a.service.localeCompare(b.service));
  return { daemon: 'up', containers, error: null };
}

// ── Hermes gateway state file ──

export interface HermesState {
  pid: number | null;
  state: string | null;
  version: string | null;
  profiles: number;
  activeAgents: number | null;
  sessionStore: string | null;
  updatedAt: string | null;
  platforms: { id: string; state: string; needsAttention: boolean; errorCode: string | null; updatedAt: string | null }[];
  error: string | null;
}

const HERMES_STATE = path.join(HOME, '.hermes', 'gateway_state.json');

/** ~/.hermes/gateway_state.json — only the named, non-secret fields (argv/paths are dropped). */
export async function hermesState(): Promise<HermesState> {
  const empty: HermesState = { pid: null, state: null, version: null, profiles: 0, activeAgents: null, sessionStore: null, updatedAt: null, platforms: [], error: null };
  try {
    const raw = obj(JSON.parse(await fsp.readFile(HERMES_STATE, 'utf8')));
    const platforms = Object.entries(obj(raw.platforms)).map(([id, v]) => {
      const p = obj(v);
      return { id, state: str(p.state) ?? 'unknown', needsAttention: p.needs_attention === true, errorCode: str(p.error_code), updatedAt: str(p.updated_at) };
    });
    return {
      pid: num(raw.pid),
      state: str(raw.gateway_state),
      version: str(raw.code_version),
      profiles: arr(raw.served_profiles).length,
      activeAgents: num(raw.active_agents),
      sessionStore: str(obj(raw.session_store).status),
      updatedAt: str(raw.updated_at),
      platforms,
      error: null,
    };
  } catch (err) {
    return { ...empty, error: (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'gateway_state.json not found' : 'gateway_state.json unreadable' };
  }
}

// ── Builders ──

export interface Ctx {
  listeners: Map<number, Listener>;
  launchd: Map<string, LaunchdEntry> | null;
  plists: PlistMap;
  procs: Map<number, ServiceProcess>;
  meta: Meta;
  now: number;
}

type AgentKey = keyof typeof AGENT_LABELS;

function agents(ctx: Ctx, key: AgentKey): LaunchAgentState[] {
  return (AGENT_LABELS[key] as readonly (readonly [string, string, AgentOpts?])[]).map(([label, role, opts]) => agentState(label, role, ctx.launchd, ctx.plists, opts));
}

const procFor = (ctx: Ctx, pid: number | null | undefined) => (pid ? (ctx.procs.get(pid) ?? null) : null);

function base(id: string, name: string, kind: string, core: boolean): ServiceCheck {
  return {
    id,
    name,
    kind,
    status: 'unknown',
    summary: '',
    endpoint: null,
    port: null,
    latencyMs: null,
    version: null,
    versionSource: null,
    process: null,
    bind: null,
    launchAgents: [],
    facts: [],
    command: null,
    notes: [],
    core,
  };
}

/** Common HTTP-service fields: endpoint, latency, owning process, bind class. */
function http(s: ServiceCheck, ctx: Ctx, port: number, pathName: string, r: HttpResult) {
  const l = ctx.listeners.get(port);
  s.port = port;
  s.endpoint = `127.0.0.1:${port}${pathName}`;
  s.latencyMs = r.latencyMs;
  s.process = procFor(ctx, l?.pid);
  s.bind = bindOf(l);
  if (s.bind === 'all-interfaces') s.notes.push(`Listening on all interfaces (*:${port}) — reachable from the LAN / tailnet, not just this Mac.`);
}

const agentPid = (list: LaunchAgentState[], role = 'service') => list.find((a) => a.role === role)?.pid ?? null;

function deadOrStuck(s: ServiceCheck, r: HttpResult, alivePid: number | null) {
  if (alivePid) {
    s.status = 'degraded';
    s.summary = `process ${alivePid} alive, port not answering (${r.error})`;
  } else {
    s.status = 'down';
    s.summary = r.error ?? 'not answering';
  }
}

export function volta(ctx: Ctx, r: HttpResult, port: number): ServiceCheck {
  const s = base('volta', 'VOLTA OS', 'dashboard', true);
  s.launchAgents = agents(ctx, 'volta');
  http(s, ctx, port, '/api/systems/ping', r);
  s.status = r.ok ? 'up' : 'degraded';
  s.summary = r.ok ? 'serving' : `self-probe failed (${r.error}) — this page is being served, so the server is up`;
  s.version = ctx.meta.voltaVersion;
  s.versionSource = 'package.json';
  if (ctx.meta.nextVersion) s.facts.push({ label: 'Next.js', value: ctx.meta.nextVersion });
  s.facts.push({ label: 'mode', value: process.env.NODE_ENV === 'production' ? 'production (next start)' : 'dev server (next dev --turbopack)', tone: process.env.NODE_ENV === 'production' ? undefined : 'muted' });
  s.command = {
    label: 'Restart command',
    command: KICK('com.epsilon.volta-os'),
    note: `Runs \`next dev\` from ${tilde(process.cwd())} on 127.0.0.1:${port} (KeepAlive). To run it by hand instead, stop the agent first, then: cd ${tilde(process.cwd())} && npm run dev`,
  };
  return s;
}

export function openclaw(ctx: Ctx, r: HttpResult): ServiceCheck {
  const s = base('openclaw', 'OpenClaw gateway', 'agent gateway', true);
  s.launchAgents = agents(ctx, 'openclaw');
  http(s, ctx, 18789, '/health', r);
  const j = obj(r.json);
  if (r.ok && j.ok === true) {
    s.status = 'up';
    s.summary = str(j.status) ?? 'ok';
  } else if (r.reachable) {
    s.status = 'degraded';
    s.summary = `answered ${r.status}${str(j.status) ? ` · ${str(j.status)}` : ''}`;
  } else deadOrStuck(s, r, agentPid(s.launchAgents));
  const v = ctx.plists.get('ai.openclaw.gateway')?.packages.openclaw;
  if (v) {
    s.version = v;
    s.versionSource = 'package.json (LaunchAgent install)';
  }
  if (!s.process) s.process = procFor(ctx, agentPid(s.launchAgents));
  s.command = {
    label: 'Restart command',
    command: 'openclaw gateway restart',
    note: `If it refuses (state lock) or the process is alive with nothing on :18789, kill it, then ${KICK('ai.openclaw.gateway')}`,
  };
  return s;
}

export function omniroute(ctx: Ctx, r: HttpResult): ServiceCheck {
  const s = base('omniroute', 'OmniRoute', 'model router', true);
  s.launchAgents = agents(ctx, 'omniroute');
  http(s, ctx, 20128, '/api/health', r);
  const j = obj(r.json);
  if (r.ok && str(j.status) === 'ok') {
    s.status = 'up';
    s.summary = 'ok';
  } else if (r.reachable) {
    s.status = 'degraded';
    s.summary = `answered ${r.status}`;
  } else deadOrStuck(s, r, agentPid(s.launchAgents));
  const v = ctx.plists.get('com.omniroute.autostart')?.packages.omniroute;
  if (v) {
    s.version = v;
    s.versionSource = 'package.json (LaunchAgent install)';
  }
  const rss = s.process?.rssBytes;
  if (rss != null && rss >= 3 * GiB) {
    s.facts.push({ label: 'server RSS', value: `${(rss / GiB).toFixed(2)} GiB`, tone: rss >= 4 * GiB ? 'critical' : 'warn' });
    s.notes.push('RSS is near the ~4.2 GB heap-exhaustion hang seen before (high CPU, requests stall).');
    if (s.status === 'up') {
      s.status = 'degraded';
      s.summary = 'ok, but RSS is near the heap-hang size';
    }
  }
  s.command = {
    label: 'Restart command',
    command: KICK('com.omniroute.autostart'),
    note: 'kickstart only restarts the launcher: if the server is hung, kill the orphaned `omniroute (v…)` child first.',
  };
  return s;
}

export function claudeMem(ctx: Ctx, r: HttpResult): ServiceCheck {
  const s = base('claude-mem', 'claude-mem worker', 'memory', true);
  http(s, ctx, 37777, '/api/health', r);
  const j = obj(r.json);
  const deps = obj(j.dependencies);
  if (r.ok && str(j.status) === 'ok') {
    const degraded = deps.degraded === true || j.initialized === false;
    s.status = degraded ? 'degraded' : 'up';
    s.summary = j.initialized === false ? 'initializing' : deps.degraded === true ? 'dependencies degraded' : 'ok';
  } else if (r.reachable) {
    s.status = 'degraded';
    s.summary = `answered ${r.status}`;
  } else {
    s.status = 'down';
    s.summary = r.error ?? 'not answering';
  }
  s.version = str(j.version);
  if (s.version) s.versionSource = 'health endpoint';
  const pid = num(j.pid);
  if (!s.process && pid) s.process = procFor(ctx, pid);
  if (r.ok) {
    s.facts.push({ label: 'MCP', value: j.mcpReady === true ? 'ready' : 'not ready', tone: j.mcpReady === true ? 'ok' : 'warn' });
    const ai = obj(j.ai);
    const last = obj(ai.lastInteraction);
    if (str(ai.provider)) {
      const ok = last.success === true;
      const ts = num(last.timestamp);
      const ago = ts ? Math.max(0, Math.round((ctx.now - ts) / 60_000)) : null;
      s.facts.push({
        label: 'observer',
        value: `${str(ai.provider)} · last call ${last.success === undefined ? 'n/a' : ok ? 'ok' : 'failed'}${ago == null ? '' : ago < 1 ? ' · just now' : ` · ${ago < 60 ? `${ago}m` : `${Math.round(ago / 60)}h`} ago`}`,
        tone: last.success === false ? 'warn' : undefined,
      });
    }
    const limited = Object.keys(obj(j.rateLimits)).length;
    if (limited) s.facts.push({ label: 'rate limits', value: `${limited} active`, tone: 'warn' });
  }
  s.notes.push('Started by the claude-mem plugin hooks, not a LaunchAgent.');
  if (ctx.meta.claudeMemWorker) {
    s.command = {
      label: 'Start command',
      command: `CLAUDE_MEM_WORKER_PORT=37777 nohup ${ctx.meta.bun} ${tilde(ctx.meta.claudeMemWorker)} >> ~/.claude-mem/worker.log 2>&1 < /dev/null &`,
      note: 'Detached with nohup + stdin from /dev/null — the bundled `worker-cli.js start` dies when its parent shell exits.',
    };
  }
  return s;
}

const runtimeName: Record<ModelRuntime['id'], string> = { llmster: 'llmster', lmstudio: 'LM Studio', ollama: 'Ollama' };

/** The local runtime(s) Honcho's LLM clients use (from its .env), or the last known one labelled as an assumption. */
function honchoLlmTargets(deps: HonchoLlmDeps): { targets: HonchoLlmTarget[]; assumed: boolean } {
  if (deps.source) return { targets: deps.targets, assumed: false };
  return { targets: [{ hostPort: 'host.docker.internal:1234', runtime: 'lmstudio', local: true, roles: [] }], assumed: true };
}

/** "host.docker.internal:1234" when Honcho (per its .env) uses this runtime, else null. */
export function honchoUses(deps: HonchoLlmDeps, id: ModelRuntime['id']): string | null {
  return deps.targets.find((t) => t.runtime === id)?.hostPort ?? null;
}

export function honcho(ctx: Ctx, r: HttpResult, docker: DockerResult, runtimes: ModelRuntime[], deps: HonchoLlmDeps): ServiceCheck {
  const s = base('honcho', 'Honcho', 'memory · docker', true);
  s.launchAgents = agents(ctx, 'docker');
  let port = 8000;
  let pathName = '/health';
  try {
    const u = new URL(HONCHO_URL);
    port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
    pathName = `${u.pathname.replace(/\/$/, '')}/health`;
  } catch {
    // keep defaults
  }
  http(s, ctx, port, pathName, r);
  s.process = null; // the port belongs to Docker's port-forwarder, not Honcho
  s.containers = docker.containers;
  const running = docker.containers.filter((c) => c.state === 'running');
  const unhealthy = docker.containers.filter((c) => c.state !== 'running' || c.health === 'unhealthy');

  // LLM dependency: only a runtime named by Honcho's own config can make it degraded.
  const { targets, assumed } = honchoLlmTargets(deps);
  const rt = (id: ModelRuntime['id'] | null) => (id ? runtimes.find((x) => x.id === id) : undefined);
  const downDeps = assumed ? [] : targets.filter((t) => t.runtime && rt(t.runtime)?.status !== 'up');

  const j = obj(r.json);
  if (r.ok && str(j.status) === 'ok') {
    const dockerBad = docker.daemon === 'error';
    s.status = (docker.daemon === 'up' && unhealthy.length) || downDeps.length || dockerBad ? 'degraded' : 'up';
    if (downDeps.length && !unhealthy.length && !dockerBad) s.blockedBy = downDeps[0].runtime ?? undefined;
    const parts = [downDeps.length ? 'API ok, LLM backend down' : dockerBad ? 'API ok, Docker not responding' : 'ok'];
    if (docker.containers.length) parts.push(`${running.length}/${docker.containers.length} containers running`);
    s.summary = parts.join(' · ');
  } else if (r.reachable) {
    s.status = 'degraded';
    s.summary = `answered ${r.status}`;
  } else {
    s.status = 'down';
    s.summary = docker.daemon === 'down' ? 'Docker engine not running' : docker.daemon === 'error' ? `Docker not responding (${docker.error})` : (r.error ?? 'not answering');
  }
  s.facts.push({
    label: 'Docker',
    value: docker.daemon === 'up' ? 'engine running' : docker.daemon === 'down' ? 'engine not running' : docker.daemon === 'error' ? `not responding · ${docker.error}` : 'CLI not found',
    tone: docker.daemon === 'up' ? 'ok' : docker.daemon === 'error' && r.ok ? 'warn' : 'critical',
  });
  if (docker.daemon === 'up') {
    s.facts.push({
      label: 'containers',
      value: docker.containers.length ? `${running.length}/${docker.containers.length} running${unhealthy.length ? ` · ${unhealthy.length} need attention` : ''}` : 'none found for compose project "honcho"',
      tone: !docker.containers.length || unhealthy.length ? 'warn' : 'ok',
    });
  }
  if (docker.error) s.notes.push(`docker: ${docker.error}`);
  if (docker.daemon === 'error') s.notes.push('Container state is unknown while the Docker CLI fails — Docker Desktop may be hung (restart it from its menu-bar icon).');

  for (const t of targets) {
    const x = rt(t.runtime);
    const name = t.runtime ? `${runtimeName[t.runtime]} :${t.hostPort.split(':').pop()}` : t.hostPort;
    s.facts.push({
      label: assumed ? 'LLM (assumed)' : t.roles.length && targets.length > 1 ? `LLM · ${t.roles.join(', ')}` : 'LLM',
      value: x ? `${name} — ${x.status}` : t.local ? `${name} — not probed` : `${name} — remote, not probed`,
      tone: x ? (x.status === 'up' ? 'ok' : assumed ? 'warn' : 'critical') : 'muted',
    });
  }
  if (!targets.length) s.facts.push({ label: 'LLM', value: 'no *_BASE_URL in .env — config.toml / defaults apply (not checked)', tone: 'muted' });
  if (assumed) s.notes.push(`${deps.error ?? 'Honcho .env not read'} — LLM endpoint assumed to be :1234 (last known); not used for status.`);
  for (const t of downDeps) {
    const who = t.roles.length ? `${t.roles.join(', ')} model${t.roles.length === 1 ? ' points' : 's point'}` : 'models point';
    s.notes.unshift(`Its ${who} at ${t.hostPort} (${t.runtime ? runtimeName[t.runtime] : t.hostPort}, per ${deps.source}), which is not answering — new memory isn't being derived.`);
  }
  s.command =
    docker.daemon === 'down'
      ? {
          label: 'Start Docker',
          command: 'open -a Docker',
          note: `Docker Desktop may ask for admin authorization (privileged port mapping) before the engine starts. Then: ${HONCHO_START_COMMAND}`,
        }
      : { label: 'Start command', command: HONCHO_START_COMMAND };
  return s;
}

export function hermes(ctx: Ctx, st: HermesState, r: HttpResult | null, port: number): ServiceCheck {
  const s = base('hermes', 'Hermes gateway', 'agent gateway', true);
  s.launchAgents = agents(ctx, 'hermes');
  if (r) http(s, ctx, port, '/health', r);
  const proc = procFor(ctx, st.pid) ?? procFor(ctx, agentPid(s.launchAgents));
  s.process = proc;
  s.version = st.version;
  if (st.version) s.versionSource = 'gateway_state.json';

  // Platform records written before this gateway process started belong to an earlier run.
  const startedAt = proc?.uptimeSec != null ? ctx.now - proc.uptimeSec * 1000 : null;
  const isCurrent = (p: HermesState['platforms'][number]) => !startedAt || (p.updatedAt != null && Date.parse(p.updatedAt) >= startedAt - 120_000);
  const current = st.platforms.filter(isCurrent);
  const stale = st.platforms.filter((p) => !isCurrent(p));
  const connected = current.filter((p) => p.state === 'connected');
  const attention = current.filter((p) => p.needsAttention || p.state !== 'connected');

  if (st.error && !proc) {
    s.status = 'down';
    s.summary = st.error;
  } else if (!proc) {
    s.status = 'down';
    s.summary = st.pid ? `gateway pid ${st.pid} not running (state file is stale)` : 'not running';
  } else if (r && !r.ok) {
    s.status = 'degraded';
    s.summary = `process alive, A2A :${port} ${r.error}`;
  } else if (st.state && st.state !== 'running') {
    s.status = 'degraded';
    s.summary = `gateway state: ${st.state}`;
  } else if (attention.length) {
    s.status = 'degraded';
    s.summary = `${attention.map((p) => `${p.id} ${p.state}`).join(', ')}`;
  } else {
    s.status = 'up';
    s.summary = st.state ?? 'running';
  }
  if (st.profiles) s.facts.push({ label: 'profiles served', value: String(st.profiles) });
  if (current.length) s.facts.push({ label: 'platforms', value: `${connected.length}/${current.length} connected`, tone: connected.length === current.length ? 'ok' : 'warn' });
  for (const p of current) if (p.state !== 'connected' || p.needsAttention) s.facts.push({ label: p.id, value: `${p.state}${p.errorCode ? ` (${redactSecrets(p.errorCode).slice(0, 60)})` : ''}`, tone: 'warn' });
  if (st.activeAgents != null) s.facts.push({ label: 'active agents', value: String(st.activeAgents) });
  if (st.sessionStore) s.facts.push({ label: 'session store', value: st.sessionStore, tone: st.sessionStore === 'ok' ? 'ok' : 'warn' });
  if (st.updatedAt) {
    const age = Math.max(0, Math.round((ctx.now - Date.parse(st.updatedAt)) / 1000));
    s.facts.push({ label: 'state file', value: age < 120 ? `${age}s old` : `${Math.round(age / 60)}m old`, tone: age > 15 * 60 ? 'warn' : undefined });
  }
  if (stale.length) s.notes.push(`Ignored ${stale.length} platform record${stale.length > 1 ? 's' : ''} from before this gateway started: ${stale.map((p) => `${p.id} (${p.state})`).join(', ')}.`);
  s.notes.push(`Health from ~/.hermes/gateway_state.json + the A2A listener's /health (port ${port}${port === 9900 ? ', the A2A default' : ', owned by the gateway pid'}).`);
  s.command = { label: 'Restart command', command: KICK('ai.hermes.gateway') };
  return s;
}

export function ollama(ctx: Ctx, p: RuntimeProbe, deps: HonchoLlmDeps): ServiceCheck {
  const used = honchoUses(deps, 'ollama');
  const s = base('ollama', 'Ollama', 'local models', Boolean(used));
  s.launchAgents = agents(ctx, 'ollama');
  http(s, ctx, p.runtime.port, '/api/version', p.http);
  s.status = p.runtime.status;
  s.version = p.version;
  if (p.version) s.versionSource = 'health endpoint';
  const n = p.runtime.loaded.length;
  s.summary = s.status === 'down' ? (p.runtime.error ?? 'not answering') : n ? `${n} model${n > 1 ? 's' : ''} loaded` : 'up · no model loaded';
  const cloud = p.runtime.cloud;
  const cloudInUse = cloud.filter((m) => m.loaded);
  s.facts.push({ label: 'installed', value: `${p.runtime.available.length + n} local${cloud.length ? ` · ${cloud.length} cloud` : ''}` });
  if (cloudInUse.length) s.facts.push({ label: 'cloud in use', value: cloudInUse.map((m) => m.id).join(', '), tone: 'muted' });
  if (cloud.length) s.notes.push(`${cloud.length} cloud model${cloud.length > 1 ? 's run' : ' runs'} on ${cloud[0].remoteHost ?? 'ollama.com'} — no local disk or memory.`);
  if (used) s.facts.push({ label: 'used by', value: `Honcho (${used})` });
  if (s.status !== 'down' && !n) s.notes.push('No model resident — the first request (e.g. ltm-ingest summaries) pays the load time.');
  s.command = { label: 'Start command', command: 'open -a Ollama' };
  return s;
}

export function lmStudioService(ctx: Ctx, p: RuntimeProbe, sibling: RuntimeProbe, deps: HonchoLlmDeps): ServiceCheck {
  const isLlmster = p.runtime.id === 'llmster';
  const s = base(p.runtime.id, isLlmster ? 'llmster (headless LM Studio)' : 'LM Studio API', 'local models', isLlmster);
  if (isLlmster) s.launchAgents = agents(ctx, 'llmster');
  const pathName = p.runtime.endpoint?.replace(/^[^/]+/, '') ?? '/v1/models';
  http(s, ctx, p.runtime.port, pathName, p.http);
  s.status = p.runtime.status;
  const owner = ctx.listeners.get(p.runtime.port)?.name ?? null;
  p.runtime.servedBy = owner;
  const n = p.runtime.loaded.length;
  s.summary = s.status === 'down' ? (p.runtime.error ?? 'not answering') : n ? `${n} model${n > 1 ? 's' : ''} loaded` : p.runtime.error ?? 'up · no model loaded';
  if (owner) s.facts.push({ label: 'served by', value: owner });
  s.facts.push({ label: 'models', value: `${n} loaded · ${p.runtime.available.length + n} available` });
  const siblingOwner = ctx.listeners.get(sibling.runtime.port)?.name ?? null;
  const used = honchoUses(deps, p.runtime.id);
  if (used) s.facts.push({ label: 'used by', value: `Honcho (${used})` });
  if (isLlmster) {
    // llmster and the LM Studio app share :1234 and can't run at once; the port's owner says which one is live.
    if (s.status !== 'down' && owner && owner !== 'llmster') {
      s.status = 'down';
      s.summary = `not running — :${p.runtime.port} is served by ${owner} (the LM Studio app)`;
    }
    s.command = {
      label: 'Start command',
      command: KICK('com.epsilon.llmster-autostart', false),
      note: 'Re-runs ~/bin/llmster-autostart.sh (lms server start --port 1234, loads qwen/qwen3.5-9b). It skips itself while the LM Studio app is open.',
    };
  } else {
    if (owner === 'llmster') s.notes.push('This port is answered by the headless llmster server, not the LM Studio app.');
    s.notes.push('The LM Studio app and llmster share one runtime lock — only one can run at a time.');
    s.command = { label: 'Start command', command: 'open -a "LM Studio"' };
  }
  return s;
}

/** Naive local "YYYY-MM-DDTHH:MM:SS" (LTM's format) → epoch ms in this machine's timezone. */
const localMs = (ts: string) => new Date(ts.replace(' ', 'T')).getTime();

export function ltmDaemon(ctx: Ctx, st: LtmStatus): ServiceCheck {
  const s = base('ltm', 'unvolta-ltm capture', 'screen memory', true);
  s.launchAgents = agents(ctx, 'ltm');
  const daemon = s.launchAgents[0];
  s.process = procFor(ctx, daemon.pid);
  const ageMin = st.available && st.last ? Math.max(0, Math.round((ctx.now - localMs(st.last)) / 60_000)) : null;
  const ageText = ageMin == null ? null : ageMin < 60 ? `${ageMin}m ago` : ageMin < 48 * 60 ? `${Math.round(ageMin / 60)}h ago` : `${Math.round(ageMin / 1440)}d ago`;
  if (!st.available) {
    s.status = daemon.pid ? 'degraded' : 'down';
    s.summary = redactSecrets(st.reason ?? 'database unavailable').slice(0, 240);
  } else if (!daemon.pid) {
    s.status = 'down';
    s.summary = `daemon not running${ageText ? ` · last capture ${ageText}` : ''}`;
  } else if (ageMin != null && ageMin > 60) {
    s.status = 'degraded';
    s.summary = `running, but no capture for ${ageText?.replace(' ago', '')}`;
    s.notes.push('Could simply be idle or a locked screen — the daemon skips unchanged frames.');
  } else {
    s.status = 'up';
    s.summary = ageText ? `capturing · last ${ageText}` : 'running';
  }
  if (st.available) {
    s.facts.push({ label: 'captures', value: st.total.toLocaleString('en-US') });
    if (ageText) s.facts.push({ label: 'last capture', value: ageText, tone: ageMin != null && ageMin <= LTM_LIVE_MINUTES ? 'ok' : 'muted' });
    if (st.pruned) s.facts.push({ label: 'pruned', value: st.pruned.total.toLocaleString('en-US') });
  }
  s.endpoint = tilde(st.dbPath);
  s.command = { label: 'Restart command', command: KICK('com.unvolta.ltm-daemon') };
  return s;
}

