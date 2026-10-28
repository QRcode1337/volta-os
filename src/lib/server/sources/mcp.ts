import 'server-only';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { McpServerInfo } from '@/types/sources';
import { cached } from './cache';
import { getPluginState } from './plugins';
import { tilde } from '../storage';

// MCP servers configured for Claude Code: user scope (~/.claude.json mcpServers), project scope
// (~/.claude.json projects[dir].mcpServers) and enabled plugins (<plugin>/.mcp.json or plugin.json mcpServers).
// Returns names + transport + host only — never args, env, headers or URL paths/queries (they can hold secrets).
// http/sse servers get a cheap reachability probe of their origin; stdio servers can't be checked without launching.

const HOME = os.homedir();
const CLAUDE_JSON = path.join(HOME, '.claude.json');
const CONFIG_TTL_MS = 30_000;
const PROBE_TIMEOUT_MS = 1500;
const PROBE_TTL_MS = 5 * 60_000;

interface RawServer {
  type?: string;
  command?: string;
  url?: string;
}
type RawMap = Record<string, RawServer>;


function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null; // e.g. "${API_URL}" placeholders
  }
}

type Described = McpServerInfo & { origin: string | null };

function describe(name: string, s: RawServer, scope: McpServerInfo['scope'], extra: Partial<McpServerInfo> = {}): Described {
  const declared = s.type === 'stdio' || s.type === 'http' || s.type === 'sse' ? s.type : null;
  const transport: McpServerInfo['transport'] = declared ?? (s.command ? 'stdio' : s.url ? 'http' : 'unknown');
  let host: string | null = null;
  if (s.url) {
    try {
      host = new URL(s.url).host;
    } catch {
      host = null;
    }
  }
  return {
    name,
    scope,
    transport,
    command: s.command ? path.basename(s.command) : null,
    host,
    plugin: null,
    project: null,
    ...extra,
    origin: transport === 'http' || transport === 'sse' ? originOf(s.url) : null,
  };
}

async function readJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fsp.readFile(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

const asMap = (v: unknown): RawMap => (v && typeof v === 'object' && !Array.isArray(v) ? (v as RawMap) : {});

/** Servers declared by plugins enabled in ~/.claude/settings.json (disabled plugins aren't loaded by Claude Code). */
async function pluginServers(): Promise<Described[]> {
  const { enabled, installPath } = await getPluginState();
  const out: Described[] = [];
  for (const [id, on] of enabled) {
    if (!on) continue;
    const root = installPath.get(id);
    if (!root) continue;
    let servers: RawMap = {};
    const mcpJson = await readJson<Record<string, unknown>>(path.join(root, '.mcp.json'));
    if (mcpJson) servers = asMap('mcpServers' in mcpJson ? mcpJson.mcpServers : mcpJson);
    const manifest = await readJson<{ mcpServers?: unknown }>(path.join(root, '.claude-plugin', 'plugin.json'));
    if (typeof manifest?.mcpServers === 'string') {
      const ref = path.resolve(root, manifest.mcpServers);
      if (ref.startsWith(root + path.sep)) {
        const j = await readJson<Record<string, unknown>>(ref);
        if (j) servers = { ...servers, ...asMap('mcpServers' in j ? j.mcpServers : j) };
      }
    } else {
      servers = { ...servers, ...asMap(manifest?.mcpServers) };
    }
    for (const [name, s] of Object.entries(servers)) if (s && typeof s === 'object') out.push(describe(name, s, 'plugin', { plugin: id }));
  }
  return out;
}

async function loadConfig(): Promise<Described[]> {
  const out: Described[] = [];
  const cfg = await readJson<{ mcpServers?: unknown; projects?: Record<string, { mcpServers?: unknown }> }>(CLAUDE_JSON);
  for (const [name, s] of Object.entries(asMap(cfg?.mcpServers))) if (s && typeof s === 'object') out.push(describe(name, s, 'user'));
  for (const [dir, p] of Object.entries(cfg?.projects ?? {})) {
    for (const [name, s] of Object.entries(asMap(p?.mcpServers))) {
      if (s && typeof s === 'object') out.push(describe(name, s, 'project', { project: tilde(dir) }));
    }
  }
  out.push(...(await pluginServers()));
  const order = { user: 0, project: 1, plugin: 2 } as const;
  return out.sort((a, b) => order[a.scope] - order[b.scope] || a.name.localeCompare(b.name));
}

// ── Reachability ──
// Any HTTP answer (even 401/404/405) means the host is up; only a network error or timeout counts as unreachable.
// Only the origin is requested (no path, query, headers or credentials), and results are kept 5 min.

type Probe = { at: number; ok: boolean };
const probes = ((globalThis as unknown as { __voltaMcpProbes?: Map<string, Probe> }).__voltaMcpProbes ??= new Map());
const probing = new Map<string, Promise<Probe>>();

function probe(origin: string): Promise<Probe> {
  let p = probing.get(origin);
  if (!p) {
    p = fetch(origin, { method: 'HEAD', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
      .then(
        () => true,
        () => false,
      )
      .then((ok) => {
        const r = { at: Date.now(), ok };
        probes.set(origin, r);
        return r;
      })
      .finally(() => probing.delete(origin));
    probing.set(origin, p);
  }
  return p;
}

/** Last result per origin; stale results are returned at once and refreshed in the background. */
async function reachability(origins: string[]): Promise<Map<string, Probe>> {
  const now = Date.now();
  await Promise.all(
    [...new Set(origins)].map(async (o) => {
      const hit = probes.get(o);
      if (!hit) await probe(o);
      else if (now - hit.at > PROBE_TTL_MS) void probe(o);
    }),
  );
  return probes;
}

export async function getMcpServers(): Promise<McpServerInfo[]> {
  const servers = await cached('mcp-config', CONFIG_TTL_MS, loadConfig);
  const reach = await reachability(servers.flatMap((s) => (s.origin ? [s.origin] : [])));
  return servers.map(({ origin, ...s }) => {
    const r = origin ? reach.get(origin) : undefined;
    return { ...s, reachable: r ? r.ok : null, checkedAt: r ? new Date(r.at).toISOString() : null };
  });
}
