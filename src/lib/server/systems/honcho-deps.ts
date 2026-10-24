import 'server-only';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { ModelRuntime } from '@/types/systems';
import { cached } from '@/lib/server/sources/cache';
import { HOME } from './run';

// Which model endpoints Honcho's LLM clients point at, from the compose project's .env (the api/deriver containers
// load it via env_file). ONLY lines whose key ends in BASE_URL are parsed, and only each URL's host + port are kept —
// every other key, and any userinfo/path in a URL, is discarded. Cached 5 min.

const HONCHO_ENV = path.join(HOME, 'ErisMorn', 'projects', 'honcho', '.env');
const TTL_MS = 5 * 60_000;

/** Hostnames that mean "this Mac" from inside a Docker container or on the host. */
const LOCAL_HOSTS = new Set(['host.docker.internal', 'gateway.docker.internal', 'localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);
const RUNTIME_BY_PORT: Record<number, ModelRuntime['id']> = { 1234: 'lmstudio', 11434: 'ollama' };

export interface HonchoLlmTarget {
  /** "host.docker.internal:1234" or a remote hostname ("openrouter.ai"). */
  hostPort: string;
  /** Local runtime answering that port, when it is one VOLTA probes. */
  runtime: ModelRuntime['id'] | null;
  local: boolean;
  /** Which Honcho clients use it: deriver, dialectic, summary, dream, embedding, default. */
  roles: string[];
}

export interface HonchoLlmDeps {
  /** Display path of the file read, or null when nothing could be read (the dependency is then an assumption). */
  source: string | null;
  targets: HonchoLlmTarget[];
  error: string | null;
}

function roleOf(key: string): string {
  const k = key.toUpperCase();
  if (k.startsWith('DIALECTIC')) return 'dialectic';
  if (k.startsWith('DREAM')) return 'dream';
  if (k.startsWith('DERIVER')) return 'deriver';
  if (k.startsWith('SUMMARY')) return 'summary';
  if (k.startsWith('EMBEDDING')) return 'embedding';
  if (k.startsWith('LLM_')) return 'default';
  return k.split('_')[0].toLowerCase();
}

async function load(): Promise<HonchoLlmDeps> {
  let text: string;
  try {
    text = await fsp.readFile(HONCHO_ENV, 'utf8');
  } catch (err) {
    return { source: null, targets: [], error: (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'Honcho .env not found' : 'Honcho .env unreadable' };
  }
  const byTarget = new Map<string, HonchoLlmTarget>();
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]*BASE_URL)\s*=\s*(.*)$/);
    if (!m) continue; // comments and every non-BASE_URL key are skipped unread
    const raw = m[2].replace(/\s+#.*$/, '').trim().replace(/^(["'])(.*)\1$/, '$2');
    if (!raw) continue;
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    const host = u.hostname.toLowerCase();
    const local = LOCAL_HOSTS.has(host);
    const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
    const hostPort = local || u.port ? `${host}:${port}` : host;
    const t = byTarget.get(hostPort) ?? { hostPort, runtime: local ? (RUNTIME_BY_PORT[port] ?? null) : null, local, roles: [] };
    const role = roleOf(m[1]);
    if (!t.roles.includes(role)) t.roles.push(role);
    byTarget.set(hostPort, t);
  }
  return { source: '~/ErisMorn/projects/honcho/.env', targets: [...byTarget.values()], error: byTarget.size ? null : 'no *_BASE_URL set in Honcho .env' };
}

export const getHonchoLlmDeps = () => cached('systems:honcho-llm-deps', TTL_MS, load);
