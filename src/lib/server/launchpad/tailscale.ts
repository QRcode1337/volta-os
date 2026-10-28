import 'server-only';
import { bin, run } from '../proc';
import { cached } from '../sources/cache';
import { probe } from './probe';
import { safeMessage } from './safe';
import type { ProbeResult, TailnetEntry } from './types';

const TAILSCALE = bin('tailscale', ['/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale']);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
/** Local services we can name with confidence (from the user's own setup); everything else gets a neutral label. */
const KNOWN_TARGET_PORTS: Record<number, string> = { 18790: 'OpenClaw control panel', 50000: 'VOLTA OS' };

interface ServeHandler {
  Proxy?: string;
  Path?: string;
  Text?: string;
}
interface ServeConfig {
  TCP?: Record<string, { HTTPS?: boolean; HTTP?: boolean }>;
  Web?: Record<string, { Handlers?: Record<string, ServeHandler> }>;
  AllowFunnel?: Record<string, boolean>;
}

async function serveStatusJson(): Promise<ServeConfig> {
  const r = await run(TAILSCALE, ['serve', 'status', '--json'], { timeoutMs: 4000, maxBuffer: 1 << 20 });
  if (r.code !== 0) throw new Error(r.error ?? `exit ${r.code}`);
  return JSON.parse(r.stdout || '{}') as ServeConfig;
}

interface RawEntry extends Omit<TailnetEntry, 'probe'> {
  probeUrl: string | null;
}

function parse(cfg: ServeConfig): { host: string | null; entries: RawEntry[] } {
  const entries: RawEntry[] = [];
  let host: string | null = null;
  for (const [hostPort, web] of Object.entries(cfg.Web ?? {})) {
    const i = hostPort.lastIndexOf(':');
    const h = i > 0 ? hostPort.slice(0, i) : hostPort;
    const port = i > 0 ? Number(hostPort.slice(i + 1)) : 443;
    if (!Number.isFinite(port) || !/^[A-Za-z0-9.-]+$/.test(h)) continue;
    host ??= h;
    const scheme = cfg.TCP?.[String(port)]?.HTTP && !cfg.TCP?.[String(port)]?.HTTPS ? 'http' : 'https';
    const base = `${scheme}://${h}${(scheme === 'https' && port === 443) || (scheme === 'http' && port === 80) ? '' : `:${port}`}`;
    for (const [path, handler] of Object.entries(web.Handlers ?? {})) {
      let target = handler.Proxy ?? (handler.Path ? 'static files' : handler.Text ? 'text response' : 'unknown handler');
      let probeUrl: string | null = null;
      let targetPort: number | null = null;
      if (handler.Proxy) {
        try {
          const u = new URL(handler.Proxy);
          // Strip anything credential-shaped; only loopback targets are ever probed.
          target = `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname}`;
          if (LOOPBACK.has(u.hostname) && (u.protocol === 'http:' || u.protocol === 'https:')) {
            probeUrl = `${u.protocol}//${u.host}/`;
            targetPort = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
          }
        } catch {
          target = 'invalid proxy target';
        }
      }
      const known = targetPort !== null ? KNOWN_TARGET_PORTS[targetPort] : undefined;
      entries.push({
        id: `ts:${port}${path}`,
        url: base + path,
        target,
        port,
        path,
        label: known ?? `Tailnet :${port}${path === '/' ? '' : path}`,
        funnel: !!cfg.AllowFunnel?.[hostPort],
        probeUrl,
      });
    }
  }
  entries.sort((a, b) => a.port - b.port || a.path.localeCompare(b.path));
  return { host, entries };
}

interface Snapshot {
  host: string | null;
  entries: RawEntry[];
  error: string | null;
  fetchedAt: string;
}
let lastGood: Snapshot | null = null;

/** `tailscale serve status --json`, cached 60s. On failure the last good snapshot (if any) is kept and the error reported. */
function snapshot(force: boolean): Promise<Snapshot> {
  return cached<Snapshot>(
    'launchpad:tailscale',
    60_000,
    async () => {
      try {
        const { host, entries } = parse(await serveStatusJson());
        return (lastGood = { host, entries, error: null, fetchedAt: new Date().toISOString() });
      } catch (err) {
        const error = `tailscale serve status failed: ${safeMessage(err, 160)}`;
        return lastGood ? { ...lastGood, error } : { host: null, entries: [], error, fetchedAt: new Date().toISOString() };
      }
    },
    { maxStaleMs: 10 * 60_000, force },
  );
}

export async function tailnetEntries(force = false): Promise<{ entries: TailnetEntry[]; host: string | null; error: string | null; fetchedAt: string }> {
  const snap = await snapshot(force);
  const entries = await Promise.all(
    snap.entries.map(async ({ probeUrl, ...e }): Promise<TailnetEntry> => {
      const p: ProbeResult = probeUrl ? await probe(probeUrl, 20_000, force) : { state: 'unknown' };
      return { ...e, probe: p };
    }),
  );
  return { entries, host: snap.host, error: snap.error, fetchedAt: snap.fetchedAt };
}
