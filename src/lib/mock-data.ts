// VOLTA Agentic OS — shared seed data. Owned by Phase 0 (lead). Sub-agents import, never edit.
// Everything here is deterministic (no Math.random) so server and client renders match.

import type {
  ArtifactItem,
  BrainNode,
  CalendarEvent,
  ConnectorItem,
  Department,
  EmailFlaggedItem,
  MicroAppItem,
  RecommendationCardExt,
  RoutineItem,
  SkillCardItem,
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
export const TOTAL_BRAIN_FILES = 424_846;
export const OS_PORT = 50000;

export const DEPARTMENT_COLORS: Record<Department, string> = {
  skills: '#FFFFFF',
  business: '#FF6B2B',
  content: '#EF4444',
  personal: '#06B6D4',
  product: '#3B82F6',
  community: '#10B981',
  routines: '#F5A623',
  applications: '#8B5CF6',
  memory: '#F5F2EB',
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  skills: 'Skills',
  business: 'Business',
  content: 'Content',
  personal: 'Personal',
  product: 'Product',
  community: 'Community',
  routines: 'Routines',
  applications: 'Applications',
  memory: 'Memory',
};

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
  { id: 'search', name: 'VOLTA Search', subtitle: 'One search across every memory source', route: '/apps/search', port: OS_PORT, iconType: 'search', accentColor: '#FF5500' },
  { id: 'sessions', name: 'VOLTA Sessions', subtitle: 'Claude Code projects, sessions & tokens', route: '/apps/sessions', port: OS_PORT, iconType: 'sessions', accentColor: '#FF5500' },
  { id: 'systems', name: 'VOLTA Systems', subtitle: 'Agents, services, models & storage health', route: '/apps/systems', port: OS_PORT, iconType: 'systems', accentColor: '#FF5500' },
  { id: 'editor', name: 'VOLTA Editor', subtitle: 'Review Studio renders & Generations; pin notes per file', route: '/apps/editor', port: OS_PORT, iconType: 'editor', accentColor: '#FF5500' },
  { id: 'scripts', name: 'VOLTA Scripts', subtitle: 'Draft & teleprompter view for YouTube', route: '/apps/scripts', port: OS_PORT, iconType: 'scripts', accentColor: '#FF5500', sample: true },
  { id: 'generations', name: 'Generations', subtitle: 'Image, video & voice generation (xAI, ElevenLabs)', route: '/apps/generations', port: OS_PORT, iconType: 'generations', accentColor: '#FF5500' },
  { id: 'studio', name: 'VOLTA Studio', subtitle: 'Render queue: HyperFrames · Remotion · ffmpeg', route: '/apps/studio', port: OS_PORT, iconType: 'studio', accentColor: '#FF5500' },
  { id: 'recos', name: 'VOLTA Recos', subtitle: 'Weekly agent improvement cart', route: '/apps/recos', port: OS_PORT, iconType: 'recos', accentColor: '#FF5500', sample: true },
  { id: 'brain', name: 'Second Brain', subtitle: '424,846 interconnected workspace files', route: '/second-brain', port: OS_PORT, iconType: 'brain', accentColor: '#FF5500' },
  { id: 'carousels', name: 'VOLTA Carousels', subtitle: 'Instagram carousel slide approval', route: '/apps/carousels', port: OS_PORT, iconType: 'carousels', accentColor: '#FF5500', sample: true },
  { id: 'elements', name: 'Elements', subtitle: 'Reusable /robo UI component library', route: '/apps/elements', port: OS_PORT, iconType: 'elements', accentColor: '#FF5500' },
];

// ───────────────────────── Artifact ring (36) ─────────────────────────

const ARTIFACT_SEED: [title: string, tag: string, type: ArtifactItem['type'], age: string][] = [
  ['Q4 Sponsor Deck', 'BETASHARES', 'deck', '2 days ago'],
  ['ETF Explainer Script', 'BETASHARES', 'doc', '3 days ago'],
  ['Campaign Brief v2', 'BETASHARES', 'pdf', '5 days ago'],
  ['/robo Brand Book', 'ROBO', 'html', '1 day ago'],
  ['HUD Component Sheet', 'ROBO', 'html', '4 days ago'],
  ['Pixel Mascot Pack', 'ROBO', 'image', '6 days ago'],
  ['Creator Partner Kit', 'ANTHROPIC', 'pdf', '5 hours ago'],
  ['Claude 5.5 Launch Thread', 'ANTHROPIC', 'doc', '1 day ago'],
  ['Agentic OS Thumbnail A', 'YOUTUBE', 'image', '2 days ago'],
  ['Agentic OS Thumbnail B', 'YOUTUBE', 'image', '2 days ago'],
  ['Agentic OS Script v3', 'YOUTUBE', 'doc', '3 days ago'],
  ['Mods Deep Dive Outline', 'YOUTUBE', 'doc', '1 week ago'],
  ['Automation Audit Report', 'NORTHWIND', 'pdf', '4 days ago'],
  ['Onboarding Playbook', 'NORTHWIND', 'deck', '1 week ago'],
  ['Proposal — AI Ops Retainer', 'LUMEN LABS', 'pdf', '2 days ago'],
  ['Discovery Call Recap', 'LUMEN LABS', 'doc', '3 days ago'],
  ['Pricing One-Pager', 'VOLTA', 'html', '6 days ago'],
  ['ARMS Framework Diagram', 'VOLTA', 'image', '2 weeks ago'],
  ['Second Brain Map Export', 'VOLTA', 'html', '5 days ago'],
  ['Jev Router Benchmarks', 'VOLTA', 'deck', '1 week ago'],
  ['Carousel #14 — ARMS', 'INSTAGRAM', 'image', '1 day ago'],
  ['Carousel #15 — MCP Bloat', 'INSTAGRAM', 'image', '2 days ago'],
  ['Carousel #16 — Jev Math', 'INSTAGRAM', 'image', '3 days ago'],
  ['Skool Weekly Digest', 'COMMUNITY', 'doc', '4 days ago'],
  ['Member Wins Roundup', 'COMMUNITY', 'html', '6 days ago'],
  ['Stripe Webhook Postmortem', 'STRIPE', 'doc', '7 hours ago'],
  ['Revenue Dashboard Snapshot', 'STRIPE', 'html', '1 day ago'],
  ['Brand Watch Report W43', 'BRAND WATCH', 'pdf', '1 day ago'],
  ['Competitor Teardown', 'BRAND WATCH', 'deck', '1 week ago'],
  ['Prompt Cache Cheat Sheet', 'ROBO', 'pdf', '3 days ago'],
  ['Wildcard Lab Results', 'WILDCARD', 'image', '2 days ago'],
  ['Macro Plan — Cut Phase', 'PERSONAL', 'doc', '5 days ago'],
  ['Travel Itinerary — SF', 'PERSONAL', 'pdf', '2 weeks ago'],
  ['Q3 Board Update', 'VOLTA', 'deck', '3 weeks ago'],
  ['Hiring Scorecard — Editor', 'VOLTA', 'doc', '1 week ago'],
  ['Quarterly OKRs', 'VOLTA', 'html', '2 weeks ago'],
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const EXT: Record<ArtifactItem['type'], string> = { deck: 'html', pdf: 'pdf', html: 'html', image: 'png', doc: 'md' };

export const ARTIFACTS: ArtifactItem[] = ARTIFACT_SEED.map(([title, tag, type, age], i) => ({
  id: `art-${String(i + 1).padStart(2, '0')}`,
  title,
  clientOrTag: tag,
  type,
  filePath: `workspace/artifacts/${slug(tag)}/${slug(title)}.${EXT[type]}`,
  createdAt: age,
  angleDeg: i * (360 / ARTIFACT_SEED.length),
}));

// ───────────────────────── Calendar ─────────────────────────

export const HOME_CLOCK = { label: 'AEST · SYDNEY', timeZone: 'Australia/Sydney' } as const;
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

// ───────────────────────── Routines ─────────────────────────

const WEEKDAYS: RoutineItem['scheduleDays'] = ['M', 'T', 'W', 'TH', 'F'];
const ALL_DAYS: RoutineItem['scheduleDays'] = ['M', 'T', 'W', 'TH', 'F', 'SA', 'SU'];

/** First four entries are the Home dashboard ROUTINES widget rows, in order. */
export const ROUTINES: RoutineItem[] = [
  { id: 'r-inbox', time: '10:00', name: 'daily inbox digest team', runner: 'DESKTOP', status: 'NEXT', mode: 'ACTIVE', tokensPerWeek: 6_400_000, costPerWeekUsd: 3.1, capUsd: 5, scheduleDays: WEEKDAYS, hourOfDay: 10 },
  { id: 'r-deliverables', time: '11:00', name: 'deliverables tracker sync', runner: 'HERMES', status: 'QUEUED', mode: 'ACTIVE', tokensPerWeek: 2_800_000, costPerWeekUsd: 1.4, scheduleDays: ['M', 'W', 'F'], hourOfDay: 11 },
  { id: 'r-brandwatch', time: '14:00', name: 'brand watch domain scanner', runner: 'DESKTOP', status: 'QUEUED', mode: 'ACTIVE', tokensPerWeek: 18_200_000, costPerWeekUsd: 9.44, capUsd: 10, scheduleDays: ALL_DAYS, hourOfDay: 14 },
  { id: 'r-recos', time: '18:00', name: 'friday rubric recos generator', runner: 'DESKTOP', status: 'QUEUED', mode: 'PASSIVE', tokensPerWeek: 3_600_000, costPerWeekUsd: 1.85, scheduleDays: ['F'], hourOfDay: 18 },
  { id: 'r-lead-enrich', time: '09:00', name: 'lead enrichment sweep', runner: 'HERMES', status: 'DONE', mode: 'ACTIVE', tokensPerWeek: 4_100_000, costPerWeekUsd: 2.05, scheduleDays: ['T', 'TH'], hourOfDay: 9 },
  { id: 'r-yt-analytics', time: '07:00', name: 'youtube analytics pull', runner: 'HERMES', status: 'DONE', mode: 'PASSIVE', tokensPerWeek: 1_200_000, costPerWeekUsd: 0.6, scheduleDays: ALL_DAYS, hourOfDay: 7 },
  { id: 'r-pattern', time: '21:00', name: 'session pattern scanner', runner: 'DESKTOP', status: 'QUEUED', mode: 'PASSIVE', tokensPerWeek: 2_200_000, costPerWeekUsd: 1.1, scheduleDays: ['F'], hourOfDay: 21 },
  { id: 'r-memory-compact', time: '22:00', name: 'memory compaction', runner: 'DESKTOP', status: 'QUEUED', mode: 'PASSIVE', tokensPerWeek: 1_600_000, costPerWeekUsd: 0.8, scheduleDays: ['SU'], hourOfDay: 22 },
];

/** Title-case display names for analytics views (leaderboard etc.). */
export const ROUTINE_DISPLAY_NAMES: Record<string, string> = {
  'r-inbox': 'Daily Inbox Digest',
  'r-deliverables': 'Deliverables Tracker Sync',
  'r-brandwatch': 'Competitor & Brand Watch',
  'r-recos': 'Friday VOLTA Recos Generator',
  'r-lead-enrich': 'Lead Enrichment Sweep',
  'r-yt-analytics': 'YouTube Analytics Pull',
  'r-pattern': 'Session Pattern Scanner',
  'r-memory-compact': 'Memory Compaction',
};

// ───────────────────────── Skills ─────────────────────────

type SkillSeed = Omit<SkillCardItem, 'filePath' | 'markdownContent' | 'id'> & { purpose: string };

const SKILL_SEED: SkillSeed[] = [
  // Self-triggered (Home SKILLS DECK, in order)
  { command: '/lead-research', name: 'Lead Research', category: 'self-triggered', model: 'HAIKU', effort: 'HIGH', tokensPerWeek: 2_100_000, costPerWeekUsd: 1.2, usesPerWeek: 34, purpose: 'Enrich inbound leads with company, stack and buying-signal research.' },
  { command: '/proposal-writer', name: 'Proposal Writer', category: 'self-triggered', model: 'OPUS', effort: 'HIGH', tokensPerWeek: 1_900_000, costPerWeekUsd: 38, usesPerWeek: 6, purpose: 'Draft client proposals as /robo HTML decks from call recaps and pricing.' },
  { command: '/client-onboarding', name: 'Client Onboarding', category: 'self-triggered', model: 'SONNET', effort: 'HIGH', tokensPerWeek: 1_200_000, costPerWeekUsd: 7.8, usesPerWeek: 4, purpose: 'Spin up client folders, kickoff docs and shared trackers.' },
  { command: '/automation-audit', name: 'Automation Audit', category: 'self-triggered', model: 'SONNET', effort: 'MEDIUM', tokensPerWeek: 900_000, costPerWeekUsd: 5.4, usesPerWeek: 3, purpose: 'Audit a client workflow and rank automation opportunities by ROI.' },
  { command: '/call-recap', name: 'Call Recap', category: 'self-triggered', model: 'HAIKU', effort: 'HIGH', tokensPerWeek: 1_600_000, costPerWeekUsd: 0.95, usesPerWeek: 22, purpose: 'Turn call transcripts into decisions, action items and follow-up email drafts.' },
  { command: '/clean-up', name: 'Clean Up', category: 'self-triggered', model: 'HAIKU', effort: 'LOW', tokensPerWeek: 200_000, costPerWeekUsd: 0.08, usesPerWeek: 14, purpose: 'Find orphaned dev processes, temp files and stale caches; report before removing.' },
  // Database skills
  { command: '/tone', name: 'Tone', category: 'database', model: 'SONNET', effort: 'MEDIUM', tokensPerWeek: 3_100_000, costPerWeekUsd: 14, usesPerWeek: 41, purpose: 'Writing-voice database: 80% corpus-aligned phrasing, 20% wildcard.' },
  { command: '/thumb', name: 'Thumb', category: 'database', model: 'SONNET', effort: 'HIGH', tokensPerWeek: 4_200_000, costPerWeekUsd: 21, usesPerWeek: 18, purpose: 'YouTube thumbnail reference database with winning layouts and CTR notes.' },
  { command: '/robo', name: 'Robo', category: 'database', model: 'OPUS', effort: 'HIGH', tokensPerWeek: 6_400_000, costPerWeekUsd: 74, usesPerWeek: 27, purpose: 'Brand book and HTML-first artifact design system (Ink Well Soft).' },
  { command: '/wildcard', name: 'Wildcard', category: 'database', model: 'SONNET', effort: 'MEDIUM', tokensPerWeek: 800_000, costPerWeekUsd: 3.9, usesPerWeek: 12, purpose: 'Anti-overfitting directive: every batch is 80% corpus-aligned, 20% novel.' },
  // Artifact skills
  { command: '/animate', name: 'Animate', category: 'artifact', model: 'OPUS', effort: 'MAX', tokensPerWeek: 18_500_000, costPerWeekUsd: 256, usesPerWeek: 19, purpose: 'Generate HTML/Canvas motion graphics and B-roll animations for videos.' },
  { command: '/cut', name: 'Cut', category: 'artifact', model: 'OPUS', effort: 'HIGH', tokensPerWeek: 4_600_000, costPerWeekUsd: 52, usesPerWeek: 9, purpose: 'Assemble A-roll cuts from transcripts: pacing, dead-air trims, jump cuts.' },
  { command: '/grammar', name: 'Grammar', category: 'artifact', model: 'HAIKU', effort: 'LOW', tokensPerWeek: 700_000, costPerWeekUsd: 0.4, usesPerWeek: 63, purpose: 'Fast grammar and clarity pass on any draft.' },
  { command: '/note', name: 'Note', category: 'artifact', model: 'HAIKU', effort: 'LOW', tokensPerWeek: 500_000, costPerWeekUsd: 0.3, usesPerWeek: 48, purpose: 'Capture a note into the right department file in the Second Brain.' },
  { command: '/calibrate', name: 'Calibrate', category: 'artifact', model: 'SONNET', effort: 'MEDIUM', tokensPerWeek: 600_000, costPerWeekUsd: 3.2, usesPerWeek: 5, purpose: 'Re-tune a skill against recent feedback and RL log entries.' },
  { command: '/search-connectors', name: 'Search Connectors', category: 'artifact', model: 'HAIKU', effort: 'MEDIUM', tokensPerWeek: 400_000, costPerWeekUsd: 0.22, usesPerWeek: 16, purpose: 'Pick the lightest connector (CLI → API → MCP) for a task.' },
  { command: '/chromify', name: 'Chromify', category: 'artifact', model: 'SONNET', effort: 'HIGH', tokensPerWeek: 1_100_000, costPerWeekUsd: 6.6, usesPerWeek: 7, purpose: 'Drive the browser to complete a web task end to end.' },
];

function skillMarkdown(s: SkillSeed): string {
  return `---
name: ${s.command.slice(1)}
description: ${s.purpose}
model: ${s.model.toLowerCase()}
effort: ${s.effort.toLowerCase()}
category: ${s.category}
---

# ${s.command}

${s.purpose}

## When to use
- Triggered ${s.category === 'self-triggered' ? 'by the agent when the task pattern matches' : 'explicitly by command or by another skill'}.
- Routed through Jev; default tier **${s.model}** at **${s.effort}** effort.

## Steps
1. Load only the department router files this task needs (never the whole MEMORY.md).
2. Execute the task using the lightest connector available.
3. Write outputs into \`workspace/\` and log a one-line pointer in MEMORY.md.

## Learned Preferences (RL Log)
<!-- Appended by VOLTA Editor / Recos. Newest last. -->
`;
}

export const SKILLS: SkillCardItem[] = SKILL_SEED.map(({ purpose: _purpose, ...s }, i) => ({
  ...s,
  id: `sk-${s.command.slice(1)}`,
  filePath: `workspace/skills/${s.command.slice(1)}/SKILL.md`,
  markdownContent: skillMarkdown(SKILL_SEED[i]),
}));

export const SKILL_DECK_IDS = SKILLS.filter((s) => s.category === 'self-triggered').map((s) => s.id);

// ───────────────────────── Connectors (Applications) ─────────────────────────

export const CONNECTORS: ConnectorItem[] = [
  { id: 'cli-ffmpeg', name: 'ffmpeg', tier: 'CLI', description: 'Transcode, trim and concat video locally.', contextTokens: 0, enabled: true, usesPerWeek: 52 },
  { id: 'cli-gh', name: 'gh', tier: 'CLI', description: 'GitHub repos, PRs and issues.', contextTokens: 0, enabled: true, usesPerWeek: 31 },
  { id: 'cli-aws', name: 'aws', tier: 'CLI', description: 'S3 asset storage and Lambda routines.', contextTokens: 0, enabled: true, usesPerWeek: 9 },
  { id: 'cli-premiere', name: 'premiere-cli', tier: 'CLI', description: 'Push /cut timelines into Premiere Pro.', contextTokens: 0, enabled: true, usesPerWeek: 6 },
  { id: 'api-youtube', name: 'YouTube Data API', tier: 'API', description: 'Channel stats, 48h velocity, comments.', contextTokens: 1_200, enabled: true, usesPerWeek: 40 },
  { id: 'api-mfp', name: 'MyFitnessPal Scraper API', tier: 'API', description: 'Daily macros into personal.md.', contextTokens: 800, enabled: true, usesPerWeek: 7 },
  { id: 'api-media', name: 'Direct Image/Video Gen API', tier: 'API', description: 'Flux, Kling, Runway, Ideogram, Recraft endpoints.', contextTokens: 1_600, enabled: true, usesPerWeek: 58 },
  { id: 'mcp-gcal', name: 'Google Calendar MCP', tier: 'MCP', description: 'Events, availability, scheduling.', contextTokens: 9_800, enabled: true, usesPerWeek: 21 },
  { id: 'mcp-gmail', name: 'Gmail MCP', tier: 'MCP', description: 'Inbox digest, flagged threads, drafts.', contextTokens: 12_400, enabled: true, usesPerWeek: 35 },
  { id: 'mcp-slack', name: 'Slack MCP', tier: 'MCP', description: 'Team channels and DMs.', contextTokens: 18_600, enabled: true, usesPerWeek: 3 },
  { id: 'mcp-excalidraw', name: 'Excalidraw MCP', tier: 'MCP', description: 'Diagrams for scripts and carousels.', contextTokens: 7_200, enabled: false, usesPerWeek: 1 },
];

// ───────────────────────── Second Brain graph ─────────────────────────

const DEPT_FILES: Record<'business' | 'content' | 'personal' | 'product' | 'community', string[]> = {
  business: ['clients/betashares.md', 'clients/northwind.md', 'clients/lumen-labs.md', 'pricing.md', 'pipeline.md', 'artifacts/beta-shares-deck.html'],
  content: ['youtube-calendar.md', 'scripts/agentic-os-v3.md', 'scripts/mods-deep-dive.md', 'thumbnails-log.md', 'carousels/post-14-arms.md'],
  personal: ['health.md', 'macros-log.md', 'goals-2026.md', 'travel.md'],
  product: ['rubric-os-roadmap.md', 'robo-ui-library.md', 'jev-router.md', 'second-brain-spec.md'],
  community: ['skool.md', 'member-wins.md', 'discord-faq.md'],
};

const SKILL_DEPT_LINKS: Record<string, (keyof typeof DEPT_FILES)[]> = {
  '/lead-research': ['business'],
  '/proposal-writer': ['business'],
  '/client-onboarding': ['business'],
  '/automation-audit': ['business'],
  '/call-recap': ['business'],
  '/clean-up': ['product'],
  '/tone': ['content', 'community'],
  '/thumb': ['content'],
  '/robo': ['content', 'product', 'business'],
  '/wildcard': ['content'],
  '/animate': ['content'],
  '/cut': ['content'],
  '/grammar': ['content'],
  '/note': ['personal', 'business'],
  '/calibrate': ['product'],
  '/search-connectors': ['product'],
  '/chromify': ['product'],
};

function isoDaysAgo(daysAgo: number): string {
  const base = Date.UTC(2026, 9, 22); // Oct 22 2026
  return new Date(base - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

export const BRAIN_NODES: BrainNode[] = (() => {
  const rnd = seededRandom(424846);
  const nodes: BrainNode[] = [];
  const add = (n: Omit<BrainNode, 'tokens' | 'lastEdited'> & Partial<Pick<BrainNode, 'tokens' | 'lastEdited'>>) =>
    nodes.push({ tokens: Math.round(400 + rnd() * 6000), lastEdited: isoDaysAgo(Math.floor(rnd() * 82)), ...n });

  const depts = Object.keys(DEPT_FILES) as (keyof typeof DEPT_FILES)[];
  add({ id: 'claude-md', label: 'CLAUDE.md', department: 'memory', filePath: 'workspace/CLAUDE.md', tokens: 2_100, lastEdited: isoDaysAgo(1), connections: ['memory-md', 'agents-md', ...depts.map((d) => `dept-${d}`)], summary: 'Root router: points to department files and compaction rules.' });
  add({ id: 'agents-md', label: 'AGENTS.md', department: 'memory', filePath: 'workspace/AGENTS.md', tokens: 1_900, lastEdited: isoDaysAgo(1), connections: ['claude-md'], summary: 'Mirror of CLAUDE.md for non-Claude agents.' });
  add({ id: 'memory-md', label: 'MEMORY.md', department: 'memory', filePath: 'workspace/MEMORY.md', tokens: 3_400, lastEdited: isoDaysAgo(0), connections: depts.map((d) => `dept-${d}`), summary: 'Session index card catalog with 1-line pointers.' });

  for (const d of depts) {
    const fileIds = DEPT_FILES[d].map((f) => `${d}-${slug(f)}`);
    add({ id: `dept-${d}`, label: `${d}.md`, department: d, filePath: `workspace/departments/${d}.md`, connections: fileIds, summary: `${DEPARTMENT_LABELS[d]} department router.` });
    DEPT_FILES[d].forEach((f, i) => {
      add({ id: fileIds[i], label: f.split('/').pop()!, department: d, filePath: `workspace/${d}/${f}`, connections: [] });
    });
  }

  for (const s of SKILLS) {
    add({ id: s.id, label: s.command, department: 'skills', filePath: s.filePath, tokens: Math.round(s.markdownContent.length / 4), connections: (SKILL_DEPT_LINKS[s.command] ?? []).map((d) => `dept-${d}`), summary: SKILL_SEED.find((x) => x.command === s.command)?.purpose, content: s.markdownContent });
  }
  for (const r of ROUTINES) {
    add({ id: r.id, label: ROUTINE_DISPLAY_NAMES[r.id] ?? r.name, department: 'routines', filePath: `workspace/routines/${r.id.slice(2)}.md`, connections: ['memory-md'], summary: `${r.time} · ${r.runner} · ${r.mode}` });
  }
  for (const c of CONNECTORS) {
    add({ id: c.id, label: c.name, department: 'applications', filePath: `workspace/applications/${c.id}.md`, connections: ['claude-md'], summary: c.description });
  }
  return nodes;
})();

export const BRAIN_EDGES: { source: string; target: string }[] = BRAIN_NODES.flatMap((n) =>
  n.connections.map((target) => ({ source: n.id, target })),
);

/** Daily edit activity for the Timeline view (Aug 1 → Oct 22 2026). */
export interface TimelineDay {
  date: string; // ISO yyyy-mm-dd
  department: Department;
  edits: number;
  files: string[]; // labels of files touched
}
export const TIMELINE_DEPARTMENTS: Department[] = ['applications', 'routines', 'memory', 'content', 'community', 'product', 'personal', 'business', 'skills'];
export const TIMELINE_ACTIVITY: TimelineDay[] = (() => {
  const rnd = seededRandom(2026);
  const days = 83; // Aug 1 .. Oct 22
  const out: TimelineDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = isoDaysAgo(days - 1 - i);
    for (const department of TIMELINE_DEPARTMENTS) {
      const pool = BRAIN_NODES.filter((n) => n.department === department);
      const weekend = [0, 6].includes(new Date(date).getUTCDay());
      const edits = Math.max(0, Math.round((rnd() * 14 - 4) * (weekend ? 0.4 : 1) + (i / days) * 4));
      if (edits === 0) continue;
      const files = Array.from({ length: Math.min(edits, 4) }, () => pool[Math.floor(rnd() * pool.length)]?.label).filter(Boolean) as string[];
      out.push({ date, department, edits, files: [...new Set(files)] });
    }
  }
  return out;
})();

// ───────────────────────── Recos (12) ─────────────────────────

export const RECOMMENDATIONS: RecommendationCardExt[] = [
  { id: 'rc-1', category: 'Memory', bucket: 'Memory', priority: true, title: 'Shrink CLAUDE.md into Department Routers', benefit: 'CLAUDE.md loads on every session. Moving department detail into routers cuts the always-on preamble from 9.2k to 2.1k tokens.', actionDescription: 'Split CLAUDE.md sections into departments/*.md and leave 1-line router pointers behind.', filesTouched: ['CLAUDE.md', 'departments/business.md', 'departments/content.md', 'departments/product.md'], effortLabel: '2 mins · Low risk', savingsLabel: 'Saves ~18.4k tok/chat', weeklyTokensSaved: 2_400_000, weeklyUsdSaved: 12.6, promptPayload: 'Refactor workspace/CLAUDE.md into a slim router: move each department section into workspace/departments/<dept>.md and replace it with a one-line pointer. Preserve /compact directives verbatim.', status: 'pending' },
  { id: 'rc-2', category: 'Memory', bucket: 'Memory', priority: true, title: 'Enable 55m Self-Ping Cache Keep-Alive', benefit: 'Cold cache reloads cost $4.92 on Opus 5.5. A 55-minute self-ping keeps the prompt cache warm for 4h working blocks.', actionDescription: 'Add a keep-alive routine and document it in MEMORY.md.', filesTouched: ['routines/cache-keepalive.md', 'MEMORY.md'], effortLabel: '3 mins · Low risk', savingsLabel: 'Saves $437/mo API eq.', weeklyTokensSaved: 0, weeklyUsdSaved: 101, promptPayload: 'Create workspace/routines/cache-keepalive.md: a passive routine that pings the session every 55 minutes during working hours. Add a pointer in MEMORY.md.', status: 'pending' },
  { id: 'rc-3', category: 'Memory', bucket: 'Memory', priority: false, title: 'Archive 14 Cold Client Folders from MEMORY.md', benefit: '14 client pointers have not been touched in 60+ days but still load in the index.', actionDescription: 'Move cold pointers into MEMORY-archive.md and keep a single archive link.', filesTouched: ['MEMORY.md', 'MEMORY-archive.md'], effortLabel: '2 mins · Low risk', savingsLabel: 'Saves ~3.1k tok/chat', weeklyTokensSaved: 420_000, weeklyUsdSaved: 2.1, promptPayload: 'Move MEMORY.md entries for clients untouched in 60+ days into workspace/MEMORY-archive.md; leave one archive pointer.', status: 'pending' },
  { id: 'rc-4', category: 'Memory', bucket: 'Memory', priority: false, title: 'Split MEMORY.md Index into Per-Department Cards', benefit: 'Agents only need the department they are working in; a split index halves lookup reads.', actionDescription: 'Group MEMORY.md pointers under per-department headings and link from each router.', filesTouched: ['MEMORY.md', 'departments/business.md', 'departments/content.md'], effortLabel: '5 mins · Low risk', savingsLabel: 'Saves ~1.9k tok/chat', weeklyTokensSaved: 260_000, weeklyUsdSaved: 1.3, promptPayload: 'Reorganise workspace/MEMORY.md into per-department sections and add a back-link from each departments/<dept>.md.', status: 'pending' },
  { id: 'rc-5', category: 'Skills', bucket: 'Skills', priority: true, title: 'Route /grammar & /note via Jev to Haiku', benefit: '/grammar and /note run 111×/wk; Jev already classifies them as Haiku-safe with 0.97 confidence.', actionDescription: 'Pin both skills to HAIKU · LOW in their frontmatter and add a Jev routing hint.', filesTouched: ['skills/grammar/SKILL.md', 'skills/note/SKILL.md'], effortLabel: '1 min · Low risk', savingsLabel: 'Saves ~$6.20/wk', weeklyTokensSaved: 0, weeklyUsdSaved: 6.2, promptPayload: 'Set model: haiku and effort: low in skills/grammar/SKILL.md and skills/note/SKILL.md, and add "jev: prefer-haiku" to both frontmatters.', status: 'pending' },
  { id: 'rc-6', category: 'Skills', bucket: 'Skills', priority: false, title: 'Add 20% /wildcard Rule to /thumb & /tone', benefit: 'Thumbnail and hook outputs are converging; a 20% wildcard quota keeps the corpus from overfitting.', actionDescription: 'Insert the 80/20 wildcard directive into both database skills.', filesTouched: ['skills/thumb/SKILL.md', 'skills/tone/SKILL.md'], effortLabel: '2 mins · Low risk', savingsLabel: '+11% CTR variance', weeklyTokensSaved: 0, weeklyUsdSaved: 0, promptPayload: 'Append a "## Wildcard Quota" section to skills/thumb/SKILL.md and skills/tone/SKILL.md: 80% corpus-aligned outputs, 20% deliberately novel, labelled WILDCARD.', status: 'pending' },
  { id: 'rc-7', category: 'Skills', bucket: 'Skills', priority: false, title: 'Extract Reusable Table into /robo Library', benefit: 'The same pricing table is regenerated in 9 artifacts a week. A library component removes ~2k output tokens each time.', actionDescription: 'Add an HTML table component to the /robo skill and reference it from /proposal-writer.', filesTouched: ['skills/robo/SKILL.md', 'skills/proposal-writer/SKILL.md'], effortLabel: '6 mins · Low risk', savingsLabel: 'Saves ~18k tok/wk', weeklyTokensSaved: 18_000, weeklyUsdSaved: 1.4, promptPayload: 'Add a "## Components → Table" section to skills/robo/SKILL.md with the canonical HTML table and reference it from skills/proposal-writer/SKILL.md.', status: 'pending' },
  { id: 'rc-8', category: 'Routines', bucket: 'Routines', priority: true, title: 'Convert Brand Watch to Passive Routine', benefit: 'Brand Watch is the #1 token consumer (18.2M/wk) but only surfaces 2 actionable items a week.', actionDescription: 'Switch the routine to PASSIVE (digest only) and cap at $4/wk.', filesTouched: ['routines/brandwatch.md'], effortLabel: '2 mins · Low risk', savingsLabel: 'Saves ~11.6M tok/wk', weeklyTokensSaved: 11_600_000, weeklyUsdSaved: 5.44, promptPayload: 'In workspace/routines/brandwatch.md set mode: passive and cap_usd: 4, and change output to a single weekly digest.', status: 'pending' },
  { id: 'rc-9', category: 'Routines', bucket: 'Routines', priority: false, title: 'Cap Competitor Scraper Routine at $4/wk', benefit: 'Prevents runaway scraping weeks like W38 ($14.20).', actionDescription: 'Add a hard weekly budget cap and an early-exit rule.', filesTouched: ['routines/brandwatch.md'], effortLabel: '1 min · Low risk', savingsLabel: 'Caps spend at $4/wk', weeklyTokensSaved: 0, weeklyUsdSaved: 2.5, promptPayload: 'Add cap_usd: 4 and an early-exit-on-cap rule to workspace/routines/brandwatch.md.', status: 'pending' },
  { id: 'rc-10', category: 'Routines', bucket: 'Routines', priority: false, title: 'Automate Friday Session Pattern Scanner', benefit: 'Turns the manual Friday review into a routine that feeds VOLTA Recos automatically.', actionDescription: 'Create a Friday 21:00 routine that scans the week\'s sessions and writes new recos.', filesTouched: ['routines/pattern.md', 'MEMORY.md'], effortLabel: '4 mins · Low risk', savingsLabel: 'Saves ~40 min/wk', weeklyTokensSaved: 0, weeklyUsdSaved: 0, promptPayload: 'Create workspace/routines/pattern.md: Friday 21:00 passive routine that scans this week\'s sessions for repeated corrections and writes VOLTA Recos candidates.', status: 'pending' },
  { id: 'rc-11', category: 'Apps', bucket: 'Apps', priority: false, title: 'Replace Heavy Slack MCP with Lightweight CLI', benefit: 'Slack MCP preloads 18.6k tokens every session but is used 3×/wk.', actionDescription: 'Disable the Slack MCP and add a slack CLI connector note.', filesTouched: ['applications/mcp-slack.md', 'CLAUDE.md'], effortLabel: '3 mins · Medium risk', savingsLabel: 'Saves ~18.6k tok/chat', weeklyTokensSaved: 2_600_000, weeklyUsdSaved: 13.1, promptPayload: 'Mark workspace/applications/mcp-slack.md as disabled and document a slack CLI fallback; update the connector list in CLAUDE.md.', status: 'pending' },
  { id: 'rc-12', category: 'Apps', bucket: 'Apps', priority: false, title: 'Add Direct FAL Image Endpoint to Generations', benefit: 'Direct endpoints skip the aggregator markup and return 30% faster.', actionDescription: 'Register a direct FAL endpoint in the media API connector.', filesTouched: ['applications/api-media.md'], effortLabel: '5 mins · Low risk', savingsLabel: 'Saves ~$3.80/wk', weeklyTokensSaved: 0, weeklyUsdSaved: 3.8, promptPayload: 'Add a FAL direct endpoint section to workspace/applications/api-media.md (env var name only, no secrets).', status: 'pending' },
];

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
