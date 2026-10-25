import 'server-only';
import { probe } from './probe';
import { tailnetEntries } from './tailscale';
import type { LinkItem, ProbeResult, ServicesData } from './types';

// Static catalogue of the user's local services and creative tools. Each probed URL is a constant (or built from a
// constant + an env port override), never derived from request input.

const HERMES_PORT = /^\d{2,5}$/.test(process.env.HERMES_GATEWAY_PORT ?? '') ? process.env.HERMES_GATEWAY_PORT : '9900';

interface Def {
  id: string;
  label: string;
  href: string;
  detail: string;
  note?: string;
  /** URL to probe; defaults to href. */
  probeUrl?: string;
  /** Skip the probe and report this state (served by VOLTA OS itself). */
  fixed?: ProbeResult;
  internal?: boolean;
  probeTtlMs?: number;
}

const AGENTS: Def[] = [
  { id: 'openclaw-gateway', label: 'OpenClaw gateway', href: 'http://127.0.0.1:18789', detail: '127.0.0.1:18789' },
  { id: 'omniroute', label: 'OmniRoute dashboard', href: 'http://localhost:20128/dashboard', detail: 'localhost:20128/dashboard', note: 'UI lives at /dashboard (the root redirects there)' },
  {
    id: 'hermes-gateway',
    label: 'Hermes gateway',
    href: `http://127.0.0.1:${HERMES_PORT}/`,
    probeUrl: `http://127.0.0.1:${HERMES_PORT}/health`,
    detail: `127.0.0.1:${HERMES_PORT}`,
    note: 'JSON health endpoint. Port is not in the plist or config.yaml; read from the live listener (override with HERMES_GATEWAY_PORT)',
  },
  { id: 'claude-mem', label: 'claude-mem viewer', href: 'http://localhost:37777', detail: 'localhost:37777' },
  { id: 'honcho', label: 'Honcho API', href: 'http://127.0.0.1:8000/docs', detail: '127.0.0.1:8000/docs' },
];

const CREATIVE: Def[] = [
  { id: 'google-flow', label: 'Google Flow (Omni)', href: 'https://labs.google/fx/tools/flow', detail: 'labs.google/fx/tools/flow', probeTtlMs: 5 * 60_000 },
  { id: 'app-generations', label: 'Generations', href: '/apps/generations', detail: '/apps/generations', note: 'Image, video and voice', internal: true, fixed: { state: 'up' } },
  { id: 'app-studio', label: 'Studio', href: '/apps/studio', detail: '/apps/studio', internal: true, fixed: { state: 'up' } },
  { id: 'app-editor', label: 'Editor', href: '/apps/editor', detail: '/apps/editor', internal: true, fixed: { state: 'up' } },
];

async function resolve(defs: Def[], force: boolean): Promise<LinkItem[]> {
  return Promise.all(
    defs.map(async (d): Promise<LinkItem> => ({
      id: d.id,
      label: d.label,
      href: d.href,
      detail: d.detail,
      note: d.note,
      internal: d.internal,
      probe: d.fixed ?? (await probe(d.probeUrl ?? d.href, d.probeTtlMs ?? 20_000, force)),
    })),
  );
}

export async function loadServices(force = false): Promise<ServicesData> {
  const [agents, tailnet, creative] = await Promise.all([resolve(AGENTS, force), tailnetEntries(force), resolve(CREATIVE, force)]);
  return { agents, tailnet, creative, probedAt: new Date().toISOString() };
}
