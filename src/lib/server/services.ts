import 'server-only';
import { CLAUDE_MEM_URL } from './sources/claude-mem';
import { HONCHO_URL } from './honcho';

// The one list of the user's local agent services: where each one listens, how its health is checked, and where its
// UI lives. Systems probes these (and judges up / degraded / down); Launchpad links to them and shows that verdict,
// so the two pages can never disagree. Addresses honour the same env overrides everywhere.

const port = (v: string | undefined, fallback: number) => (/^\d{2,5}$/.test(v ?? '') ? Number(v) : fallback);

export interface ServiceDef {
  /** Systems ServiceCheck id. */
  id: 'openclaw' | 'omniroute' | 'hermes' | 'claude-mem' | 'honcho';
  label: string;
  /** Base URL (no trailing slash). For Hermes, the default; Systems reads the live listener port. */
  baseUrl: string;
  healthPath: string;
  /** Page a human opens (Launchpad link). */
  uiPath: string;
  note?: string;
}

/** Hermes A2A gateway: the port isn't in its plist or config.yaml; Systems reads the live listener, this is the default. */
export const HERMES_DEFAULT_PORT = port(process.env.HERMES_GATEWAY_PORT, 9900);

export const SERVICES: readonly ServiceDef[] = [
  { id: 'openclaw', label: 'OpenClaw gateway', baseUrl: 'http://127.0.0.1:18789', healthPath: '/health', uiPath: '/' },
  {
    id: 'omniroute',
    label: 'OmniRoute dashboard',
    baseUrl: 'http://127.0.0.1:20128',
    healthPath: '/api/health',
    uiPath: '/dashboard',
    note: 'UI lives at /dashboard (the root redirects there)',
  },
  {
    id: 'hermes',
    label: 'Hermes gateway',
    baseUrl: `http://127.0.0.1:${HERMES_DEFAULT_PORT}`,
    healthPath: '/health',
    uiPath: '/',
    note: 'JSON health endpoint. Port is not in the plist or config.yaml; read from the live listener (override with HERMES_GATEWAY_PORT)',
  },
  { id: 'claude-mem', label: 'claude-mem viewer', baseUrl: CLAUDE_MEM_URL.replace(/\/+$/, ''), healthPath: '/api/health', uiPath: '/' },
  { id: 'honcho', label: 'Honcho API', baseUrl: HONCHO_URL, healthPath: '/health', uiPath: '/docs' },
];

export const service = (id: ServiceDef['id']): ServiceDef => SERVICES.find((s) => s.id === id)!;
export const healthUrl = (id: ServiceDef['id']) => `${service(id).baseUrl}${service(id).healthPath}`;
/** The port a service listens on (from its base URL). */
export const portOf = (id: ServiceDef['id']) => Number(new URL(service(id).baseUrl).port) || 80;

/** Same base URL with another port (Hermes: the gateway's live listener). */
export function withPort(baseUrl: string, p: number | null | undefined): string {
  if (!p) return baseUrl;
  const u = new URL(baseUrl);
  u.port = String(p);
  return u.toString().replace(/\/+$/, '');
}
