// VOLTA Agentic OS — shared seed data. Owned by Phase 0 (lead). Sub-agents import, never edit.
// Everything here is deterministic (no Math.random) so server and client renders match.

import type {
  BrainNode,
  CalendarEvent,
  Department,
  EmailFlaggedItem,
  MicroAppItem,
  UsageSnapshot,
  YouTubeVideoStat,
} from '@/types/os';

// ───────────────────────── Deterministic PRNG ─────────────────────────

/** mulberry32 — returns a deterministic () => [0,1) generator. Use instead of Math.random in render paths. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────── Identity & constants ─────────────────────────

/** Change these two strings to re-brand the OS owner everywhere. */
export const OS_OWNER = { name: 'Patrick', org: 'Epsilon LLC' } as const;
export const OS_PORT = 50000;

export const DEPARTMENT_COLORS: Record<Department, string> = {
  skills: '#FFFFFF',
  business: '#FF6B2B',
  content: '#EF4444',
  research: '#10B981',
  agents: '#A855F7',
  product: '#3B82F6',
  personal: '#06B6D4',
  routines: '#F5A623',
  applications: '#8B5CF6',
  memory: '#F5F2EB',
};

/** Patrick's departments (2026-10-28). Slugs match `workspace/departments/<slug>.md`; labels are what the UI shows. */
export const DEPARTMENT_LABELS: Record<Department, string> = {
  skills: 'Skills',
  business: 'Business · EPSILON',
  content: 'Content · The Strangest Times',
  research: 'Research',
  agents: 'Agent fleet',
  product: 'VOLTA',
  personal: 'Personal',
  routines: 'Routines',
  applications: 'Applications',
  memory: 'Memory',
};

/** Departments that have a router file at `workspace/departments/<slug>.md`. */
export const ROUTER_DEPARTMENTS = ['business', 'content', 'research', 'agents', 'product', 'personal'] as const satisfies readonly Department[];
export type RouterDepartment = (typeof ROUTER_DEPARTMENTS)[number];

export const MODEL_COLORS = {
  HAIKU: '#22C55E',
  SONNET: '#14B8A6',
  OPUS: '#A855F7',
  FABLE: '#F5A623',
} as const;

export const MODEL_TIERS = ['HAIKU', 'SONNET', 'OPUS', 'FABLE'] as const;
export const EFFORT_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'XHIGH', 'MAX'] as const;

// ───────────────────────── Micro apps ─────────────────────────

export const MICRO_APPS: MicroAppItem[] = [
  { id: 'ltm', name: 'VOLTA LTM', subtitle: 'Screen memory: timeline, search, screenshots', route: '/apps/ltm', port: OS_PORT, iconType: 'ltm', accentColor: '#FF5500' },
  { id: 'honcho', name: 'VOLTA Honcho', subtitle: 'Peer memory: cards, sessions, conclusions', route: '/apps/honcho', port: OS_PORT, iconType: 'honcho', accentColor: '#FF5500' },
  { id: 'research', name: 'VOLTA Research', subtitle: 'Find any file; see what connects your folders', route: '/apps/research', port: OS_PORT, iconType: 'research', accentColor: '#FF5500' },
  { id: 'tasks', name: 'VOLTA Tasks', subtitle: 'Agent action pipeline · what awaits you', route: '/apps/tasks', port: OS_PORT, iconType: 'tasks', accentColor: '#FF5500' },
  { id: 'feeds', name: 'VOLTA Feeds', subtitle: 'Sentinel, Scout, Curator & cron outputs', route: '/apps/feeds', port: OS_PORT, iconType: 'feeds', accentColor: '#FF5500' },
  { id: 'launchpad', name: 'VOLTA Launchpad', subtitle: 'OmniRoute, OpenClaw, Netlify, repos, Notion pins', route: '/apps/launchpad', port: OS_PORT, iconType: 'launchpad', accentColor: '#FF5500' },
  { id: 'music', name: 'VANTA VECTOR', subtitle: 'Your music: library, player, lyrics & credits', route: '/apps/music', port: OS_PORT, iconType: 'music', accentColor: '#FF5500' },
  { id: 'podcast', name: 'VOLTA Briefing', subtitle: 'Daily AI, UAP & quantum deep-research podcast', route: '/apps/podcast', port: OS_PORT, iconType: 'podcast', accentColor: '#FF5500' },
  { id: 'search', name: 'VOLTA Search', subtitle: 'One search across every memory source', route: '/apps/search', port: OS_PORT, iconType: 'search', accentColor: '#FF5500' },
  { id: 'sessions', name: 'VOLTA Sessions', subtitle: 'Claude Code projects, sessions & tokens', route: '/apps/sessions', port: OS_PORT, iconType: 'sessions', accentColor: '#FF5500' },
  { id: 'systems', name: 'VOLTA Systems', subtitle: 'Agents, services, models & storage health', route: '/apps/systems', port: OS_PORT, iconType: 'systems', accentColor: '#FF5500' },
  { id: 'editor', name: 'VOLTA Editor', subtitle: 'Review Studio renders & Generations; pin notes per file', route: '/apps/editor', port: OS_PORT, iconType: 'editor', accentColor: '#FF5500' },
  { id: 'scripts', name: 'VOLTA Scripts', subtitle: 'Notion outlines, source ledgers & teleprompter', route: '/apps/scripts', port: OS_PORT, iconType: 'scripts', accentColor: '#FF5500' },
  { id: 'generations', name: 'Generations', subtitle: 'Image, video & voice generation (xAI, ElevenLabs)', route: '/apps/generations', port: OS_PORT, iconType: 'generations', accentColor: '#FF5500' },
  { id: 'studio', name: 'VOLTA Studio', subtitle: 'Render queue: HyperFrames · Remotion · ffmpeg', route: '/apps/studio', port: OS_PORT, iconType: 'studio', accentColor: '#FF5500' },
  { id: 'recos', name: 'VOLTA Recos', subtitle: 'Weekly fixes from real signals', route: '/apps/recos', port: OS_PORT, iconType: 'recos', accentColor: '#FF5500' },
  { id: 'brain', name: 'Second Brain', subtitle: 'Vault graph, LTM timeline, routines, skills & MCP', route: '/second-brain', port: OS_PORT, iconType: 'brain', accentColor: '#FF5500' },
  { id: 'carousels', name: 'VOLTA Carousels', subtitle: 'Shorts decks from Notion, review & approve', route: '/apps/carousels', port: OS_PORT, iconType: 'carousels', accentColor: '#FF5500' },
  { id: 'elements', name: 'Elements', subtitle: 'Reusable /robo UI component library', route: '/apps/elements', port: OS_PORT, iconType: 'elements', accentColor: '#FF5500' },
];

// ───────────────────────── Calendar ─────────────────────────

export const HOME_CLOCK = { label: 'ET · NEW YORK', timeZone: 'America/New_York' } as const;
export const WORLD_CLOCKS = [
  { label: 'USA PT', timeZone: 'America/Los_Angeles' },
  { label: 'USA ET', timeZone: 'America/New_York' },
  { label: 'LONDON', timeZone: 'Europe/London' },
] as const;

export const CALENDAR_EVENTS: CalendarEvent[] = [
  { id: 'ev-1', title: 'BetaShares sponsor sync', timeRange: '09:45 – 10:15', relativeTime: 'in 45m' },
  { id: 'ev-2', title: 'Record: Claude Mods Deep Dive', timeRange: '14:00 – 16:00', relativeTime: '14:00' },
  { id: 'ev-3', title: 'Skool community live Q&A', timeRange: '16:30 – 17:30', relativeTime: '16:30' },
];

export type AvailabilityCell = 'free' | 'blocked' | 'focus';
export const AVAILABILITY_ROWS = ['9-12', '12-3', '3-6'] as const;
/** 3 rows × 14 days, starting today. */
export const AVAILABILITY: AvailabilityCell[][] = (() => {
  const rnd = seededRandom(43);
  return AVAILABILITY_ROWS.map(() =>
    Array.from({ length: 14 }, () => {
      const r = rnd();
      return r < 0.18 ? 'focus' : r < 0.55 ? 'blocked' : 'free';
    }),
  );
})();

// ───────────────────────── YouTube ─────────────────────────

export const YOUTUBE_SUBSCRIBERS = 202_000;
export const YOUTUBE_VIDEOS: YouTubeVideoStat[] = [
  { id: 'yt-1', title: 'Claude 5.5 Agentic OS — full build', views48h: 148_200, publishedAgo: '2d' },
  { id: 'yt-2', title: 'Why your MCPs are draining context', views48h: 61_400, publishedAgo: '6d' },
  { id: 'yt-3', title: 'Database skills vs wildcards', views48h: 38_900, publishedAgo: '11d' },
];

// ───────────────────────── Email ─────────────────────────

export const EMAILS_PAST_24H = 47;
export const FLAGGED_EMAILS: EmailFlaggedItem[] = [
  { id: 'em-1', sender: 'BetaShares', subject: 'BetaShares Q4 Sponsor Deck approval', age: '2h', category: 'PARTNERS', completed: false },
  { id: 'em-2', sender: 'Anthropic', subject: 'Anthropic Creator Partner invite', age: '5h', category: 'PARTNERS', completed: false },
  { id: 'em-3', sender: 'Stripe', subject: 'Stripe webhook failure alert', age: '7h', category: 'OTHER', completed: false },
];
export const EMAIL_MIX = [
  { label: 'PARTNERS', count: 9, color: '#FF5500' },
  { label: 'LEADS', count: 14, color: '#F5A623' },
  { label: 'PERSONAL', count: 6, color: '#22C55E' },
  { label: 'OTHER', count: 18, color: '#3A3834' },
] as const;

// ───────────────────────── Second Brain graph (structure only) ─────────────────────────
// Template seeds (fake skills, routines, connectors, client files, artifacts) were removed 2026-10-28.
// Real skills/routines/MCP come from /api/skills-real, /api/routines and /api/mcp; /api/workspace adds one node per real file.

const SEED_DATE = '2026-10-28';

export const BRAIN_NODES: BrainNode[] = [
  { id: 'claude-md', label: 'CLAUDE.md', department: 'memory', filePath: 'workspace/CLAUDE.md', tokens: 0, lastEdited: SEED_DATE, connections: ['memory-md', 'agents-md', ...ROUTER_DEPARTMENTS.map((d) => `dept-${d}`)], summary: 'Root router: points to department files and compaction rules.' },
  { id: 'agents-md', label: 'AGENTS.md', department: 'memory', filePath: 'workspace/AGENTS.md', tokens: 0, lastEdited: SEED_DATE, connections: ['claude-md'], summary: 'Mirror of CLAUDE.md for non-Claude agents.' },
  { id: 'memory-md', label: 'MEMORY.md', department: 'memory', filePath: 'workspace/MEMORY.md', tokens: 0, lastEdited: SEED_DATE, connections: ROUTER_DEPARTMENTS.map((d) => `dept-${d}`), summary: 'Session index card catalog with 1-line pointers.' },
  ...ROUTER_DEPARTMENTS.map((d): BrainNode => ({
    id: `dept-${d}`,
    label: `${d}.md`,
    department: d,
    filePath: `workspace/departments/${d}.md`,
    tokens: 0,
    lastEdited: SEED_DATE,
    connections: [],
    summary: `${DEPARTMENT_LABELS[d]} department router.`,
  })),
];

export const BRAIN_EDGES: { source: string; target: string }[] = BRAIN_NODES.flatMap((n) =>
  n.connections.map((target) => ({ source: n.id, target })),
);

// ───────────────────────── Usage mod ─────────────────────────

export const USAGE_SNAPSHOT: UsageSnapshot = {
  weeklyPctLeft: 68,
  fiveHourPctLeft: 84,
  cache: {
    state: 'WARM',
    warmMinutesLeft: 51,
    cachedTokens: 186_000,
    idleLabel: 'Idle 11h 30m',
    coldTokens: 600_000,
    contextUsed: 186_420,
    contextMax: 1_000_000,
    warmNextMsgUsd: 0.14,
    coldReloadUsd: 4.92,
  },
  jev: { routes: 4_451, totalUsd: 0.18, haikuPct: 41 },
};
