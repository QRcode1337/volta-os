import 'server-only';
import type { LocalModel, ModelRuntime } from '@/types/systems';
import { arr, httpGet, num, obj, str, type HttpResult } from './run';

// Local model runtimes: Ollama (:11434) and the LM Studio API, served either by the LM Studio app (:1234) or by
// the headless `llmster` server — both on :1234 (they can't run at once; com.epsilon.llmster-autostart starts llmster).
// Honcho's LLM points at :1234, so whichever one is running serves it.

export interface RuntimeProbe {
  runtime: ModelRuntime;
  /** The first (liveness) request, for the matching service card. */
  http: HttpResult;
  version: string | null;
}

const BASE = 'http://127.0.0.1';

function blankModel(id: string): LocalModel {
  return { id, name: null, type: null, loaded: null, sizeBytes: null, sizeKind: null, vramBytes: null, params: null, quantization: null, contextLength: null, expiresAt: null, ttlSec: null, remoteHost: null };
}

/** Ollama cloud models carry `remote_host` (e.g. "https://ollama.com:443") → "ollama.com"; local models have none. */
function remoteHostOf(m: Record<string, unknown>): string | null {
  const h = str(m.remote_host);
  if (!h && !str(m.remote_model)) return null;
  if (!h) return 'remote';
  try {
    return new URL(h).hostname || 'remote';
  } catch {
    return 'remote';
  }
}

export async function probeOllama(port = 11434): Promise<RuntimeProbe> {
  const [ver, ps, tags] = await Promise.all([httpGet(`${BASE}:${port}/api/version`), httpGet(`${BASE}:${port}/api/ps`), httpGet(`${BASE}:${port}/api/tags`)]);
  // Cloud models are listed by /api/tags as ~300-byte registry stubs; they run on ollama.com, not on this Mac.
  const cloudHost = new Map<string, string>();
  const tagged = arr(obj(tags.json).models).map((raw) => {
    const m = obj(raw);
    const d = obj(m.details);
    const id = str(m.name) ?? str(m.model) ?? '?';
    const remoteHost = remoteHostOf(m);
    if (remoteHost) cloudHost.set(id, remoteHost);
    return {
      ...blankModel(id),
      loaded: false,
      // A stub's size is meaningless — no disk size for cloud models.
      sizeBytes: remoteHost ? null : num(m.size),
      sizeKind: remoteHost ? null : ('disk' as const),
      params: str(d.parameter_size),
      quantization: str(d.quantization_level),
      contextLength: num(d.context_length),
      remoteHost,
    };
  });
  const running: LocalModel[] = arr(obj(ps.json).models).map((raw) => {
    const m = obj(raw);
    const d = obj(m.details);
    const id = str(m.name) ?? str(m.model) ?? '?';
    const remoteHost = remoteHostOf(m) ?? cloudHost.get(id) ?? null;
    return {
      ...blankModel(id),
      loaded: true,
      // A cloud model "in use" holds no local memory worth reporting.
      sizeBytes: remoteHost ? null : num(m.size),
      sizeKind: remoteHost ? null : ('memory' as const),
      vramBytes: remoteHost ? null : num(m.size_vram),
      params: str(d.parameter_size),
      quantization: str(d.quantization_level),
      contextLength: num(m.context_length),
      expiresAt: str(m.expires_at),
      remoteHost,
    };
  });
  const runningIds = new Set(running.map((m) => m.id));
  const loaded = running.filter((m) => !m.remoteHost);
  const available = tagged.filter((m) => !m.remoteHost && !runningIds.has(m.id));
  const cloud = [...running.filter((m) => m.remoteHost), ...tagged.filter((m) => m.remoteHost && !runningIds.has(m.id))];
  const http = ver.reachable ? ver : ps;
  const up = ver.ok || ps.ok;
  return {
    http,
    version: str(obj(ver.json).version),
    runtime: {
      id: 'ollama',
      name: 'Ollama',
      port,
      status: up ? (ps.ok ? 'up' : 'degraded') : http.reachable ? 'degraded' : 'down',
      servedBy: null,
      endpoint: `127.0.0.1:${port}/api/ps`,
      loaded,
      available,
      cloud,
      error: up ? (ps.ok ? null : `/api/ps: ${ps.error}`) : http.error,
    },
  };
}

/** LM Studio REST API: /api/v1/models (sizes + loaded instances) → /api/v0/models (state) → /v1/models (ids only). */
export async function probeLmStudio(id: 'lmstudio' | 'llmster', name: string, port: number): Promise<RuntimeProbe> {
  const v1 = await httpGet(`${BASE}:${port}/api/v1/models`);
  const out = (status: ModelRuntime['status'], endpoint: string, loaded: LocalModel[], available: LocalModel[], error: string | null, http: HttpResult): RuntimeProbe => ({
    http,
    version: null,
    runtime: { id, name, port, status, servedBy: null, endpoint, loaded, available, cloud: [], error },
  });
  if (!v1.reachable) return out('down', `127.0.0.1:${port}/v1/models`, [], [], v1.error, v1);

  const rich = arr(obj(v1.json).models);
  if (v1.ok && rich.length) {
    const all = rich.map((raw) => {
      const m = obj(raw);
      const inst = arr(m.loaded_instances).map(obj);
      const cfg = obj(inst[0]?.config);
      return {
        ...blankModel(str(m.key) ?? '?'),
        name: str(m.display_name),
        type: str(m.type),
        loaded: inst.length > 0,
        sizeBytes: num(m.size_bytes),
        sizeKind: 'disk' as const,
        params: str(m.params_string),
        quantization: str(obj(m.quantization).name),
        contextLength: num(cfg.context_length) ?? num(m.max_context_length),
        ttlSec: num(inst[0]?.remaining_ttl_seconds),
      };
    });
    return out('up', `127.0.0.1:${port}/api/v1/models`, all.filter((m) => m.loaded), all.filter((m) => !m.loaded), null, v1);
  }

  const v0 = await httpGet(`${BASE}:${port}/api/v0/models`);
  const data0 = arr(obj(v0.json).data);
  if (v0.ok && data0.length) {
    const all = data0.map((raw) => {
      const m = obj(raw);
      const loaded = str(m.state) === 'loaded';
      return {
        ...blankModel(str(m.id) ?? '?'),
        type: str(m.type),
        loaded,
        quantization: str(m.quantization),
        contextLength: (loaded ? num(m.loaded_context_length) : null) ?? num(m.max_context_length),
      };
    });
    return out('up', `127.0.0.1:${port}/api/v0/models`, all.filter((m) => m.loaded), all.filter((m) => !m.loaded), null, v0);
  }

  const oai = await httpGet(`${BASE}:${port}/v1/models`);
  const data = arr(obj(oai.json).data);
  if (oai.ok) {
    // OpenAI-compatible listing only: which models are loaded is unknown.
    const all = data.map((raw) => blankModel(str(obj(raw).id) ?? '?'));
    return out('up', `127.0.0.1:${port}/v1/models`, [], all, 'loaded state not exposed by /v1/models', oai);
  }
  return out('degraded', `127.0.0.1:${port}/v1/models`, [], [], oai.error ?? v1.error, oai.reachable ? oai : v1);
}
