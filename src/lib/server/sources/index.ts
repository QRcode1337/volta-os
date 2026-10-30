import 'server-only';
import { redactSecrets } from '@/lib/server/redact';
import type { ObsidianVault } from '@/types/ltm';
import { LTM_LIVE_MINUTES, type MemorySource, type NotionPage, type SourceMetric } from '@/types/sources';
import type { YouTubeChannel } from '@/types/youtube';
import { HONCHO_START_COMMAND, HONCHO_URL, health as honchoHealth, listPeers, listSessions, listWorkspaces } from '../honcho';
import { capturesAfter, getStatus as getLtmStatus } from '../ltm';
import { listVaults } from '../vaults';
import { getYouTubeChannel, youtubeConfig } from '../youtube';
import { cached } from './cache';
import { CLAUDE_MEM_URL, getClaudeMemStats, type ClaudeMemStats } from './claude-mem';
import { getNotionPages } from './notion';
import { getLtmIngestAgent, getLtmSummaryWatermark, LTM_INGEST_LABEL, type LtmIngestAgent, type LtmSummaryWatermark } from './pieces';

// Status rows for the home "Memory Sources" panel and the Second Brain Applications view.
// The slow probes (Honcho, claude-mem, vault walk, Notion, ltm-ingest, YouTube) are one shared, cached fan-out
// (stale-while-revalidate), so every widget and tab reuses it; the LTM numbers are read fresh per request
// (one cheap SQLite query) so this row never drifts from /api/ltm/status.

const SLOW_TTL_MS = 30_000;
const HONCHO_COUNTS_TTL_MS = 5 * 60_000; // workspace/peer/session totals change slowly
const MAX_HONCHO_WORKSPACES = 20;
/** ltm_ingest holds a session back until it has settled (≤ 90 min span + 20 min settle + 30 min interval). */
const INGEST_BEHIND_MS = 3 * 3_600_000;

function ago(iso: string | null, nowMs = Date.now()): string {
  if (!iso) return '—';
  const mins = Math.round((nowMs - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}
const n = (x: number) => x.toLocaleString('en-US');
const plural = (x: number, word: string) => `${n(x)} ${word}${x === 1 ? '' : 's'}`;

interface HonchoCounts {
  workspaces: number;
  peers: number;
  sessions: number;
  /** More workspaces than MAX_HONCHO_WORKSPACES, or a count failed → peers/sessions are lower bounds. */
  partial: boolean;
}

/** Totals from size=1 list pages (Honcho has no count endpoint): 1 + 2 calls per workspace. */
async function loadHonchoCounts(): Promise<HonchoCounts> {
  const ws = await listWorkspaces(1, 100);
  let partial = ws.total > Math.min(ws.items.length, MAX_HONCHO_WORKSPACES);
  const per = await Promise.all(
    ws.items.slice(0, MAX_HONCHO_WORKSPACES).map(async (w) => {
      const [p, s] = await Promise.all([listPeers(w.id, 1, 1).catch(() => null), listSessions(w.id, 1, 1).catch(() => null)]);
      if (!p || !s) partial = true;
      return { peers: p?.total ?? 0, sessions: s?.total ?? 0 };
    }),
  );
  return {
    workspaces: ws.total,
    peers: per.reduce((a, x) => a + x.peers, 0),
    sessions: per.reduce((a, x) => a + x.sessions, 0),
    partial,
  };
}

interface SlowProbes {
  honchoUp: boolean;
  honchoCounts: HonchoCounts | null;
  mem: ClaudeMemStats;
  vaults: ObsidianVault[];
  /** null = LTM offline (visits are ranked from LTM window titles) */
  notion: NotionPage[] | null;
  watermark: LtmSummaryWatermark | null;
  /** null = plist not installed · undefined = the check itself failed */
  ingest: LtmIngestAgent | null | undefined;
  /** null = not configured · { error } = the Data API call failed (youtube.ts keeps its own 15 min cache) */
  youtube: YouTubeChannel | { error: string } | null;
  checkedAt: string;
}

async function loadSlow(): Promise<SlowProbes> {
  const honchoUp = await honchoHealth().then(
    () => true,
    () => false,
  );
  const [honchoCounts, mem, vaults, notion, watermark, ingest, youtube] = await Promise.all([
    honchoUp ? cached('sources:honcho-counts', HONCHO_COUNTS_TTL_MS, loadHonchoCounts).catch(() => null) : Promise.resolve(null),
    getClaudeMemStats(),
    listVaults().catch(() => []),
    getLtmStatus().available ? getNotionPages(3).catch(() => []) : Promise.resolve(null),
    getLtmSummaryWatermark().catch(() => null),
    getLtmIngestAgent().catch(() => undefined),
    youtubeConfig() ? getYouTubeChannel().catch((err: unknown) => ({ error: (err as Error).message || 'failed' })) : Promise.resolve(null),
  ]);
  return { honchoUp, honchoCounts, mem, vaults, notion, watermark, ingest, youtube, checkedAt: new Date().toISOString() };
}

function honchoRow(s: SlowProbes): MemorySource {
  const c = s.honchoCounts;
  const lb = c?.partial ? 'lower bound' : undefined;
  return {
    id: 'honcho',
    name: 'Honcho',
    status: s.honchoUp ? 'live' : 'offline',
    headline: !s.honchoUp ? 'Offline' : c ? plural(c.workspaces, 'workspace') : 'API online',
    detail: !s.honchoUp
      ? 'Docker stack not running'
      : c
        ? `${c.partial ? '≥ ' : ''}${plural(c.peers, 'peer')} · ${c.partial ? '≥ ' : ''}${plural(c.sessions, 'session')} · ${HONCHO_URL.replace(/^https?:\/\//, '')}`
        : `${HONCHO_URL.replace(/^https?:\/\//, '')} · counts unavailable`,
    href: '/apps/honcho',
    setupHint: s.honchoUp ? undefined : HONCHO_START_COMMAND,
    metrics: c
      ? [
          { label: 'workspaces', value: c.workspaces },
          { label: 'peers', value: c.peers, note: lb },
          { label: 'sessions', value: c.sessions, note: lb },
        ]
      : undefined,
    checkedAt: s.checkedAt,
  };
}

function claudeMemRow(s: SlowProbes): MemorySource {
  const m = s.mem;
  const obs = m.observer;
  const observerFailing = !!obs && obs.consecutiveFailures > 0;
  const latest = m.latest ? `latest ${ago(m.latest.createdAt)}: ${redactSecrets(m.latest.title)}` : `${n(m.sessions)} sessions`;
  const metrics: SourceMetric[] | undefined = m.answeredAt
    ? [
        { label: 'observations', value: m.observations },
        { label: 'sessions', value: m.sessions },
        { label: 'summaries', value: m.summaries },
      ]
    : undefined;
  if (!m.online) {
    return {
      id: 'claude-mem',
      name: 'claude-mem',
      // It answered earlier (stalled, e.g. under memory pressure) vs never answered since the server started.
      status: m.answeredAt ? 'stale' : 'offline',
      headline: m.answeredAt ? `${n(m.observations)} observations` : 'Worker offline',
      detail: m.answeredAt
        ? `worker on :37777 not answering · counts from ${ago(m.answeredAt)}`
        : 'claude-mem worker on :37777 not responding',
      href: CLAUDE_MEM_URL,
      external: true,
      metrics,
      checkedAt: s.checkedAt,
    };
  }
  return {
    id: 'claude-mem',
    name: 'claude-mem',
    status: observerFailing ? 'stale' : 'live',
    headline: `${n(m.observations)} observations`,
    detail:
      observerFailing && obs
        ? `observer failing ${obs.consecutiveFailures}× since ${ago(obs.failingSince ?? obs.lastErrorAt)}${obs.lastErrorCode ? ` (${obs.lastErrorCode})` : ''} · ${latest}`
        : latest,
    href: CLAUDE_MEM_URL, // the worker's own viewer
    external: true,
    setupHint: observerFailing ? 'See ~/.claude-mem/observer-health.json for the last observer error' : undefined,
    metrics,
    checkedAt: s.checkedAt,
  };
}

/** LTM captures not yet covered by a summary (cheap COUNT on the read-only DB); null when LTM is unreadable. */
function backlogAfter(id: number): ReturnType<typeof capturesAfter> | null {
  try {
    return capturesAfter(id);
  } catch {
    return null;
  }
}

function piecesRow(s: SlowProbes, ltmAvailable: boolean): MemorySource {
  const pieces = s.vaults.find((v) => v.name === 'Pieces-Vault');
  if (!pieces) {
    return {
      id: 'pieces-vault',
      name: 'Pieces-Vault',
      status: 'offline',
      headline: 'Not registered',
      detail: 'Open ~/Pieces-Vault in Obsidian',
      checkedAt: s.checkedAt,
    };
  }
  const w = s.watermark;
  const agent = s.ingest;
  // Ingest's own watermark also covers short bursts it skips without writing a note; use whichever is further.
  const through = Math.max(w?.summarizedThroughId ?? -1, w?.ingestWatermarkId ?? -1);
  const backlog = ltmAvailable && through >= 0 ? backlogAfter(through) : null;
  const behind = !!backlog && backlog.count > 0 && !!backlog.firstTs && Date.now() - Date.parse(backlog.firstTs) > INGEST_BEHIND_MS;
  const lastNote = w?.newestNoteMtime ?? pieces.lastEdited;

  const problems: string[] = [];
  let hint: string | undefined;
  if (agent === null) {
    problems.push(`${LTM_INGEST_LABEL} LaunchAgent not installed`);
  } else if (agent === undefined) {
    // launchctl/plist read failed: say nothing about the agent rather than guess
  } else if (!agent.loaded) {
    problems.push(`${LTM_INGEST_LABEL} not loaded`);
    hint = `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/${LTM_INGEST_LABEL}.plist`;
  } else if (agent.health === 'failing') {
    problems.push(`ltm-ingest last exit ${agent.exitCode}`);
  }
  if (agent?.lastLogError) problems.push(`log ends in ${agent.lastLogError}`);
  if (behind && backlog) problems.push(`${plural(backlog.count, 'capture')} waiting since ${ago(backlog.firstTs)}`);
  if (!hint && (behind || agent?.lastLogError || agent?.health === 'failing')) {
    hint = /timeout/i.test(agent?.lastLogError ?? '')
      ? 'ltm-ingest timed out — is its local model (Ollama) running?'
      : `Check ${agent?.logPath?.replace(/^\/Users\/[^/]+/, '~') ?? 'the ltm-ingest log'}`;
  }

  const parts: string[] = [];
  if (through >= 0) parts.push(`summarized through capture #${through}`);
  if (backlog && !behind) parts.push(backlog.count ? `${n(backlog.count)} newer queued` : 'nothing queued');
  if (!ltmAvailable) parts.push('backlog unknown (LTM offline)');
  parts.push(`last note ${ago(lastNote)}`);

  const status = problems.length ? 'stale' : !ltmAvailable || through < 0 ? 'idle' : 'live';
  const metrics: SourceMetric[] = [{ label: 'notes', value: pieces.notes }];
  if (backlog) metrics.push({ label: 'captures waiting', value: backlog.count });
  if (through >= 0) metrics.push({ label: 'summarized through capture', value: through });
  return {
    id: 'pieces-vault',
    name: 'Pieces-Vault',
    status,
    headline: `${n(pieces.notes)} notes`,
    detail: [...problems, ...parts].join(' · '),
    href: pieces.obsidianUrl,
    external: true,
    setupHint: hint,
    metrics,
    checkedAt: s.checkedAt,
  };
}

function youtubeRow(s: SlowProbes): MemorySource {
  const base = { id: 'youtube', name: 'YouTube' } as const;
  const y = s.youtube;
  if (!y) {
    return {
      ...base,
      status: 'not-connected',
      headline: 'Not connected',
      detail: 'The Strangest Times channel stats',
      setupHint: 'Add YOUTUBE_API_KEY and YOUTUBE_CHANNEL_ID to .env.local',
    };
  }
  if ('error' in y) {
    return {
      ...base,
      status: 'offline',
      headline: 'API error',
      detail: redactSecrets(y.error),
      setupHint: /\b(401|403)\b/.test(y.error)
        ? 'Check the key in Google Cloud Console: YouTube Data API v3 must be enabled for it'
        : undefined,
      checkedAt: s.checkedAt,
    };
  }
  const latest = y.recent[0];
  return {
    ...base,
    status: 'live',
    headline: y.subscribers === null ? `${n(y.views)} views` : plural(y.subscribers, 'subscriber'),
    detail: [
      y.handle ?? y.title,
      plural(y.videoCount, 'video'),
      `${n(y.views)} views`,
      latest ? `latest “${latest.title}” ${ago(latest.publishedAt)}` : 'no uploads',
    ].join(' · '),
    href: y.url,
    external: true,
    metrics: [
      ...(y.subscribers === null ? [] : [{ label: 'subscribers', value: y.subscribers }]),
      { label: 'views', value: y.views },
      { label: 'videos', value: y.videoCount },
    ],
    checkedAt: y.fetchedAt,
  };
}

/** Status rows for the home "Memory Sources" panel. */
export async function getMemorySources(): Promise<MemorySource[]> {
  const ltm = getLtmStatus(); // fresh: same numbers as /api/ltm/status
  const s = await cached('memory-sources', SLOW_TTL_MS, loadSlow);
  // LTM timestamps are naive local time; Date.parse treats them as local too.
  const ltmMins = ltm.last ? (Date.now() - Date.parse(ltm.last)) / 60_000 : Infinity;
  const otherVaults = s.vaults.filter((v) => v.name !== 'Pieces-Vault');
  const calendarConfigured = !!process.env.GOOGLE_CALENDAR_ICS_URL;
  const notion = ltm.available ? (s.notion ?? []) : null;

  return [
    {
      id: 'ltm',
      name: 'unvolta LTM',
      status: !ltm.available ? 'offline' : ltmMins <= LTM_LIVE_MINUTES ? 'live' : 'idle',
      headline: ltm.available ? `${n(ltm.total)} captures` : 'Unavailable',
      detail: ltm.available ? `last capture ${ago(ltm.last)} · ${ltm.apps} apps` : (ltm.reason ?? 'database not found'),
      href: '/apps/ltm',
      setupHint: ltm.available ? undefined : 'Mount the Windsor drive',
      metrics: ltm.available ? [{ label: 'captures', value: ltm.total }, { label: 'apps', value: ltm.apps }] : undefined,
    },
    honchoRow(s),
    claudeMemRow(s),
    piecesRow(s, ltm.available),
    {
      id: 'obsidian',
      name: 'Obsidian',
      status: otherVaults.length ? 'idle' : 'not-connected',
      headline: `${otherVaults.length} more vault${otherVaults.length === 1 ? '' : 's'}`,
      detail: otherVaults.map((v) => `${v.name} (${n(v.notes)})`).join(' · ') || 'No other vaults registered',
      href: otherVaults[0]?.obsidianUrl,
      external: true,
      checkedAt: s.checkedAt,
    },
    {
      id: 'notion',
      name: 'Notion',
      status: notion === null ? 'offline' : notion.length ? 'idle' : 'not-connected',
      headline: notion === null ? 'Needs LTM' : notion[0] ? notion[0].title : 'No visits captured',
      detail:
        notion === null
          ? 'needs LTM (Windsor drive) — visits are ranked from LTM window titles'
          : notion.length
            ? `top pages: ${notion.map((p) => p.title).join(' · ')}`
            : 'Ranked from LTM window titles',
      href: notion?.[0]?.url ?? 'https://www.notion.so',
      external: true,
      setupHint: notion === null ? 'Mount the Windsor drive' : undefined,
      checkedAt: s.checkedAt,
    },
    // No code fetches Calendar yet: a configured URL is reported as such, never as "Connected".
    {
      id: 'calendar',
      name: 'Google Calendar',
      status: 'not-connected',
      headline: calendarConfigured ? 'Configured · not implemented' : 'Not connected',
      detail: 'Upcoming events for the calendar widget',
      setupHint: calendarConfigured ? 'No calendar fetcher exists yet' : 'Add GOOGLE_CALENDAR_ICS_URL (secret iCal address) to .env.local',
    },
    youtubeRow(s),
  ];
}
