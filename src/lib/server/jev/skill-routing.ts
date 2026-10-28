import 'server-only';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ModelTier } from '@/types/os';
import type { RealSkill } from '@/types/sources';
import { HttpError } from '@/lib/server/route-helpers';
import { WINDSOR_ROOT, WINDSOR_VOLTA, isInside, isWindsorMounted, onWindsor, tilde, writeAtomic } from '@/lib/server/storage';
import { WORKSPACE_DIR } from '@/lib/server/workspace';
import { getSkills } from '@/lib/server/sources/skills';
import { skillCommand } from '@/components/dashboard/widgets/right-skills';
import type { JevRouteSource } from './heuristic';

// Per-skill routing history for the Skills "JEV ROUTED" leaderboard: one JSON line per dashboard skill run (requested
// tier, JEV's pick, confidence, whether it overrode). Append-only, next to JEV telemetry on Windsor. No prompts are
// stored. If the volume is not mounted, entries stay in a small in-memory ring and `persisted` reports false.

export const ROUTING_LOG_PATH = process.env.VOLTA_JEV_ROUTING_LOG_PATH || path.join(WINDSOR_VOLTA, 'jev', 'skill-routing.jsonl');
const RING = 200;
const TAIL_BYTES = 512 * 1024;
const TIER_RANK: Record<ModelTier, number> = { HAIKU: 0, SONNET: 1, OPUS: 2, FABLE: 3 };

export interface SkillRouteEntry {
  at: string;
  command: string;
  skillId: string | null;
  requested: ModelTier;
  picked: Exclude<ModelTier, 'FABLE'>;
  confidence: number;
  routed: ModelTier;
  overridden: boolean;
  source: JevRouteSource;
}

const g = globalThis as typeof globalThis & { __voltaJevSkillLog?: { ring: SkillRouteEntry[]; persisted: boolean; lastError: string | null } };
const state = (g.__voltaJevSkillLog ??= { ring: [], persisted: false, lastError: null });

/** Append one run. Never throws, never blocks the run. */
export function recordSkillRoute(entry: SkillRouteEntry): void {
  state.ring.push(entry);
  if (state.ring.length > RING) state.ring.splice(0, state.ring.length - RING);
  void (async () => {
    try {
      const dir = path.dirname(ROUTING_LOG_PATH);
      // Never create the volume's mount point if the drive is absent.
      if (onWindsor(dir) && !(await isWindsorMounted())) throw new Error(`${WINDSOR_ROOT} is not mounted`);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.appendFile(ROUTING_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
      state.persisted = true;
      state.lastError = null;
    } catch (err) {
      state.persisted = false;
      state.lastError = (err as Error).message.slice(0, 160);
    }
  })();
}

function readEntries(): SkillRouteEntry[] {
  const out = new Map<string, SkillRouteEntry>();
  const keyOf = (e: SkillRouteEntry) => `${e.at}|${e.command}`;
  try {
    const fd = fs.openSync(ROUTING_LOG_PATH, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, TAIL_BYTES);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      const lines = buf.toString('utf8').split('\n');
      if (size > len) lines.shift(); // first line is probably cut
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line) as SkillRouteEntry;
          if (e && typeof e.command === 'string' && e.requested in TIER_RANK && e.picked in TIER_RANK) out.set(keyOf(e), e);
        } catch {
          // skip a torn line
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // no file yet / volume absent: the ring still answers
  }
  for (const e of state.ring) out.set(keyOf(e), e);
  return [...out.values()];
}

// ── Where a skill's tier is defined on disk ──

/**
 * "/name" against the real skill catalog, with the Skills Deck's rule: when several skills strip to one "/name",
 * only a single bare (un-namespaced) skill owns it.
 */
export async function resolveSkill(command: string): Promise<{ skill: RealSkill | null; peers: string[] }> {
  let skills: RealSkill[] = [];
  try {
    skills = await getSkills();
  } catch {
    // catalog unreadable: treat as unknown
  }
  const matches = skills.filter((s) => skillCommand(s) === command);
  if (matches.length <= 1) return { skill: matches[0] ?? null, peers: [] };
  const bare = matches.filter((s) => !s.id.includes(':'));
  return { skill: bare.length === 1 ? bare[0] : null, peers: matches.map((s) => s.id) };
}

export interface TierFile {
  /** ~-shortened SKILL.md path, or null when no SKILL.md was found. */
  path: string | null;
  /** The frontmatter `model:` value, upper-cased (null when the line is absent). */
  model: string | null;
  writable: boolean;
  /** Why it can't be written (plugin-managed, outside the user skill folders, no frontmatter…). */
  reason?: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const MODEL_LINE = /^model:[ \t]*(.*)$/m;

/** The SKILL.md that defines `command`: the catalog's own path, else workspace/skills/<name>/SKILL.md. */
async function skillFileFor(command: string): Promise<{ file: string | null; skill: RealSkill | null }> {
  const { skill } = await resolveSkill(command);
  if (skill?.path) return { file: skill.path, skill };
  const ws = path.join(WORKSPACE_DIR, 'skills', command.slice(1), 'SKILL.md');
  return { file: fs.existsSync(ws) ? ws : null, skill };
}

async function writableReason(file: string, skill: RealSkill | null): Promise<string | undefined> {
  if (skill?.source === 'plugin') return 'Plugin-managed SKILL.md (a plugin update would overwrite it).';
  const real = await fs.promises.realpath(file).catch(() => null);
  if (!real) return 'SKILL.md could not be resolved.';
  const roots = [path.join(os.homedir(), '.claude', 'skills'), path.join(WORKSPACE_DIR, 'skills')];
  for (const r of roots) if (await isInside(real, r)) return undefined;
  return `Resolves outside ~/.claude/skills and workspace/skills (${tilde(real)}).`;
}

async function tierFileOf(command: string): Promise<TierFile> {
  const { file, skill } = await skillFileFor(command);
  if (!file) return { path: null, model: null, writable: false, reason: 'No SKILL.md on disk (built-in or transcript-only skill).' };
  const text = await fs.promises.readFile(file, 'utf8').catch(() => null);
  if (text === null) return { path: tilde(file), model: null, writable: false, reason: 'SKILL.md is not readable.' };
  const fm = FRONTMATTER.exec(text)?.[1];
  const model = fm ? (MODEL_LINE.exec(fm)?.[1].trim().replace(/^['"]|['"]$/g, '').toUpperCase() || null) : null;
  const reason = fm === undefined ? 'SKILL.md has no frontmatter.' : await writableReason(file, skill);
  return { path: tilde(file), model, writable: !reason, ...(reason ? { reason } : {}) };
}

// ── Leaderboard ──

export interface SkillRoutingRow {
  command: string;
  skillId: string | null;
  runs: number;
  /** Runs where JEV overrode the requested tier with a cheaper one. */
  routedDown: number;
  routedUp: number;
  /** Tier the most recent run requested (the deck's default for this skill at that time). */
  lastRequested: ModelTier;
  /** JEV's most common pick, and how many runs it was. */
  jevPick: Exclude<ModelTier, 'FABLE'>;
  jevPickRuns: number;
  haikuPicks: number;
  avgConfidence: number;
  fallbacks: number;
  lastAt: string;
  tierFile: TierFile;
}

export interface SkillRoutingBoard {
  rows: SkillRoutingRow[];
  totalRuns: number;
  persisted: boolean;
  path: string;
  lastError: string | null;
}

export async function skillRoutingBoard(): Promise<SkillRoutingBoard> {
  const entries = readEntries().sort((a, b) => (a.at < b.at ? -1 : 1));
  const groups = new Map<string, SkillRouteEntry[]>();
  for (const e of entries) (groups.get(e.command) ?? groups.set(e.command, []).get(e.command)!).push(e);
  const rows = await Promise.all(
    [...groups.entries()].map(async ([command, es]): Promise<SkillRoutingRow> => {
      const last = es[es.length - 1];
      const picks = new Map<SkillRouteEntry['picked'], number>();
      for (const e of es) picks.set(e.picked, (picks.get(e.picked) ?? 0) + 1);
      const [jevPick, jevPickRuns] = [...picks.entries()].sort((a, b) => b[1] - a[1] || TIER_RANK[a[0]] - TIER_RANK[b[0]])[0];
      const down = es.filter((e) => e.overridden && TIER_RANK[e.routed] < TIER_RANK[e.requested]).length;
      return {
        command,
        skillId: last.skillId,
        runs: es.length,
        routedDown: down,
        routedUp: es.filter((e) => e.overridden).length - down,
        lastRequested: last.requested,
        jevPick,
        jevPickRuns,
        haikuPicks: picks.get('HAIKU') ?? 0,
        avgConfidence: Math.round((es.reduce((a, e) => a + e.confidence, 0) / es.length) * 100) / 100,
        fallbacks: es.filter((e) => e.source === 'fallback').length,
        lastAt: last.at,
        tierFile: await tierFileOf(command),
      };
    }),
  );
  rows.sort((a, b) => b.runs - a.runs || b.lastAt.localeCompare(a.lastAt));
  return {
    rows,
    totalRuns: entries.length,
    persisted: state.persisted || fs.existsSync(ROUTING_LOG_PATH),
    path: tilde(ROUTING_LOG_PATH),
    lastError: state.lastError,
  };
}

// ── "Optimize to Haiku": plan, then write only on explicit confirm ──

export interface TierPlan {
  command: string;
  skillId: string | null;
  tier: 'HAIKU' | 'SONNET';
  file: TierFile & {
    /** The frontmatter line before / after (null before = the line is added just above the closing ---). */
    before: string | null;
    after: string;
    /** false when the file already says this tier. */
    changes: boolean;
    mtimeMs: number | null;
  };
}

function planText(text: string, value: string): { next: string; before: string | null; after: string } | null {
  const m = FRONTMATTER.exec(text);
  if (!m) return null;
  const fm = m[1];
  const after = `model: ${value}`;
  const line = MODEL_LINE.exec(fm);
  const nextFm = line ? fm.replace(MODEL_LINE, () => after) : `${fm}\n${after}`;
  const start = m.index + m[0].indexOf(fm);
  return { next: text.slice(0, start) + nextFm + text.slice(start + fm.length), before: line ? line[0] : null, after };
}

/** What setting `command` to `tier` would change in its SKILL.md. With `apply`, writes it atomically (409 if the file moved on). */
export async function planSkillTier(command: string, tier: 'HAIKU' | 'SONNET', apply?: { expectMtimeMs: number }): Promise<TierPlan> {
  const { file, skill } = await skillFileFor(command);
  const tf = await tierFileOf(command);
  const value = tier.toLowerCase();
  const base = { command, skillId: skill?.id ?? null, tier };
  if (!file || !tf.path) {
    if (apply) throw new HttpError(tf.reason ?? 'No SKILL.md to change.', 409);
    return { ...base, file: { ...tf, before: null, after: `model: ${value}`, changes: false, mtimeMs: null } };
  }
  const real = await fs.promises.realpath(file);
  const [text, st] = await Promise.all([fs.promises.readFile(real, 'utf8'), fs.promises.stat(real)]);
  const plan = planText(text, value);
  const changes = !!plan && plan.before !== plan.after;
  const out: TierPlan = {
    ...base,
    file: { ...tf, before: plan?.before ?? null, after: plan?.after ?? `model: ${value}`, changes, mtimeMs: st.mtimeMs },
  };
  if (!apply) return out;
  if (!tf.writable || !plan) throw new HttpError(tf.reason ?? 'SKILL.md is not writable from VOLTA.', 409);
  if (apply.expectMtimeMs !== st.mtimeMs) throw new HttpError(`${tf.path} changed since the preview. Review it again.`, 409);
  if (changes) await writeAtomic(real, plan.next, { expectMtimeMs: st.mtimeMs });
  return out;
}
