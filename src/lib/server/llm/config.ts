import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { memoByFiles } from '../sources/cache';
import type { RoutesConfig, TaskRoute } from './types';

// config/llm-routes.json: task -> OmniRoute combo chain, the local LM Studio fallback and the request limits.
// Re-read when the file's mtime changes, so a routing edit needs no restart. A broken file never throws: the
// built-in defaults below take over and the problem is listed in `errors`.

export const CONFIG_PATH = path.join(process.cwd(), 'config', 'llm-routes.json');
export const LOCAL_TARGET = 'local';

const DEFAULTS: RoutesConfig = {
  gateway: { baseUrl: 'http://127.0.0.1:20128/v1', keyEnv: 'OMNIROUTE_API_KEY', baseUrlEnv: 'OMNIROUTE_BASE_URL' },
  local: { baseUrl: 'http://127.0.0.1:1234/v1', model: 'qwen/qwen3.5-9b', timeoutMs: 150_000, minMaxTokens: 1024 },
  limits: { maxMessages: 60, maxChars: 600_000, maxOutputTokens: 32_000, maxTimeoutMs: 600_000 },
  apiBilledProviders: ['xai', 'gemini', 'anthropic', 'openai', 'nous-research', 'openrouter'],
  tasks: {
    quick: { chain: [LOCAL_TARGET], timeoutMs: 60_000, maxTokens: 1024 },
    'long-write': { chain: ['SmartSpread', LOCAL_TARGET], timeoutMs: 240_000, maxTokens: 8192 },
  },
  verified: null,
  errors: [],
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number, min = 1) => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v.trim() : d);
/** Task and combo names are used in URLs-free JSON and logs only, but keep them boring anyway. */
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function loadRoutes(): RoutesConfig {
  return memoByFiles('llm-routes', [CONFIG_PATH], parseRoutes);
}

function parseRoutes(): RoutesConfig {
  const errors: string[] = [];
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (isObj(parsed)) raw = parsed;
    else errors.push('config/llm-routes.json is not an object; using built-in defaults.');
  } catch (err) {
    errors.push(`config/llm-routes.json unreadable (${(err as Error).message}); using built-in defaults.`);
  }

  const gw = isObj(raw.gateway) ? raw.gateway : {};
  const lc = isObj(raw.local) ? raw.local : {};
  const lim = isObj(raw.limits) ? raw.limits : {};
  const cfg: RoutesConfig = {
    gateway: {
      baseUrl: str(gw.baseUrl, DEFAULTS.gateway.baseUrl).replace(/\/+$/, ''),
      keyEnv: str(gw.keyEnv, DEFAULTS.gateway.keyEnv),
      baseUrlEnv: str(gw.baseUrlEnv, DEFAULTS.gateway.baseUrlEnv),
    },
    local: {
      baseUrl: str(lc.baseUrl, DEFAULTS.local.baseUrl).replace(/\/+$/, ''),
      model: str(lc.model, DEFAULTS.local.model),
      timeoutMs: num(lc.timeoutMs, DEFAULTS.local.timeoutMs, 1000),
      minMaxTokens: num(lc.minMaxTokens, DEFAULTS.local.minMaxTokens),
    },
    limits: {
      maxMessages: num(lim.maxMessages, DEFAULTS.limits.maxMessages),
      maxChars: num(lim.maxChars, DEFAULTS.limits.maxChars, 1000),
      maxOutputTokens: num(lim.maxOutputTokens, DEFAULTS.limits.maxOutputTokens),
      maxTimeoutMs: num(lim.maxTimeoutMs, DEFAULTS.limits.maxTimeoutMs, 1000),
    },
    apiBilledProviders: Array.isArray(raw.apiBilledProviders)
      ? raw.apiBilledProviders.filter((x): x is string => typeof x === 'string').map((s) => s.toLowerCase())
      : DEFAULTS.apiBilledProviders,
    tasks: {},
    verified: raw.verified ?? null,
    errors,
  };

  const tasks = isObj(raw.tasks) ? raw.tasks : {};
  for (const [name, t] of Object.entries(tasks)) {
    if (!NAME_RE.test(name) || !isObj(t)) {
      errors.push(`Ignored task ${JSON.stringify(name)}: bad name or definition.`);
      continue;
    }
    const chain = (Array.isArray(t.chain) ? t.chain : []).filter((c): c is string => typeof c === 'string' && NAME_RE.test(c));
    if (chain.length === 0) {
      errors.push(`Task "${name}" has no usable chain; ignored.`);
      continue;
    }
    const route: TaskRoute = {
      chain: [...new Set(chain)],
      timeoutMs: num(t.timeoutMs, 90_000, 1000),
      maxTokens: num(t.maxTokens, 2048),
      liveWeb: t.liveWeb === true,
      note: typeof t.note === 'string' ? t.note : undefined,
    };
    cfg.tasks[name] = route;
  }
  if (Object.keys(cfg.tasks).length === 0) {
    cfg.tasks = DEFAULTS.tasks;
    errors.push('No valid tasks in config/llm-routes.json; using built-in defaults.');
  }
  return cfg;
}

/** The chain for a task with the local fallback guaranteed to be tried last (unless it already appears). */
export function chainFor(route: TaskRoute): string[] {
  return route.chain.includes(LOCAL_TARGET) ? route.chain : [...route.chain, LOCAL_TARGET];
}
