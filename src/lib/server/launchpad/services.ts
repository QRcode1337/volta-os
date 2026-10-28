import 'server-only';
import { LOOPBACK_HOSTS } from '../local-only';
import { SERVICES, withPort } from '../services';
import { getSystemsReport } from '../systems';
import { probe } from './probe';
import { tailnetEntries } from './tailscale';
import type { LinkItem, ProbeResult, ServicesData, TailnetEntry } from './types';

// Launchpad links. Agent services come from the shared registry (lib/server/services.ts) and show the Systems
// verdict, so the two pages always agree; creative tools are a static catalogue probed for plain liveness. Every
// URL is a constant (or built from a constant + an env override), never derived from request input.

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


/** A loopback href re-pointed at the root `tailscale serve` entry that proxies the same port, if there is one. */
function remoteHrefFor(href: string, entries: TailnetEntry[]): string | undefined {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return undefined;
  }
  if (!LOOPBACK_HOSTS.has(u.hostname)) return undefined;
  const port = u.port || (u.protocol === 'https:' ? '443' : '80');
  for (const e of entries) {
    if (e.path !== '/') continue;
    try {
      const t = new URL(e.target);
      if (LOOPBACK_HOSTS.has(t.hostname) && (t.port || (t.protocol === 'https:' ? '443' : '80')) === port) return e.url.replace(/\/$/, '') + u.pathname + u.search;
    } catch {
      // static or text handler: not a proxy
    }
  }
  return undefined;
}

/** The agent services, each with the Systems verdict (same probe, same rule) and its live port. */
async function agentLinks(force: boolean): Promise<LinkItem[]> {
  const report = await getSystemsReport(force).catch(() => null);
  return SERVICES.map((def): LinkItem => {
    const check = report?.services.find((c) => c.id === def.id);
    const base = withPort(def.baseUrl, check?.port);
    const href = `${base}${def.uiPath}`;
    const probe: ProbeResult = !check
      ? { state: 'unknown' }
      : { state: check.status === 'unknown' ? 'unknown' : check.status, ms: check.latencyMs ?? undefined, summary: check.summary };
    return { id: def.id, label: def.label, href, detail: href.replace(/^https?:\/\//, '').replace(/\/$/, ''), note: def.note, probe };
  });
}

export async function loadServices(force = false): Promise<ServicesData> {
  const [agents, tailnet, creative] = await Promise.all([agentLinks(force), tailnetEntries(force), resolve(CREATIVE, force)]);
  for (const a of agents) a.remoteHref = remoteHrefFor(a.href, tailnet.entries);
  return { agents, tailnet, creative, probedAt: new Date().toISOString() };
}
