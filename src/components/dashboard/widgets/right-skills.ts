// Skills-deck helpers: slash-command derivation, routing preferences and deck persistence.
import { EFFORT_LEVELS, MODEL_TIERS } from '@/lib/mock-data';
import type { EffortLevel, ModelTier } from '@/types/os';
import type { RealSkill } from '@/types/sources';

export type Routing = { model: ModelTier; effort: EffortLevel };

export const DECK_MAX = 6;
export const DEFAULT_ROUTING: Routing = { model: 'SONNET', effort: 'MEDIUM' };
export const ROUTING_KEY = 'volta:skill-routing';
export const DECK_KEY = 'volta:skill-deck';

const COMMAND_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

/**
 * Slash command for a skill. Uses the invocation id without its plugin prefix
 * ("superpowers:writing-plans" → "/writing-plans", "agentdb-advanced" → "/agentdb-advanced"),
 * slugified when needed so it satisfies /api/skills/run's `/name` format.
 */
export function skillCommand(s: RealSkill): string {
  const base = s.id.slice(s.id.lastIndexOf(':') + 1);
  if (COMMAND_RE.test(base)) return `/${base}`;
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `/${slug || 'skill'}`;
}

/**
 * "Installed" = the server found a SKILL.md on disk (RealSkill.installed). Same definition as /api/skills-real's
 * installedCount and Second Brain → Skills. Falls back to `path` for a payload from before the flag existed.
 */
export const isInstalled = (s: RealSkill) => (typeof s.installed === 'boolean' ? s.installed : !!s.path);

/** True for transcript-only entries (no SKILL.md on disk: Claude Code built-ins, removed plugins, ambiguous names). */
export const isNotOnDisk = (s: RealSkill) => !isInstalled(s);

/** Label for entries that are not installed (shown instead of the origin). */
export const SEEN_LABEL = 'seen in transcripts';

/** Installed-skill count: the server's installedCount when present, else counted from the list. */
export function installedCountOf(payload: { skills?: RealSkill[]; installedCount?: number } | null | undefined): number | null {
  if (!payload) return null;
  if (typeof payload.installedCount === 'number') return payload.installedCount;
  return Array.isArray(payload.skills) ? payload.skills.filter(isInstalled).length : null;
}

/**
 * Installed, but its plugin is disabled in ~/.claude/settings.json (RealSkill.enabled === false): the SKILL.md is
 * on disk and counts as installed, but Claude Code can't invoke it until the plugin is enabled again.
 */
export const isDisabled = (s: RealSkill) => isInstalled(s) && s.enabled === false;

export const DISABLED_LABEL = 'plugin disabled';
export const DISABLED_NOTE = "Plugin disabled in ~/.claude/settings.json — Claude Code can't invoke this skill until it is enabled.";

/**
 * Invocable-skill count: the server's enabledCount when present, else installed skills not marked disabled.
 * null when the payload predates `enabled` (no skill carries the flag), so callers don't claim a number.
 */
export function enabledCountOf(payload: { skills?: RealSkill[]; enabledCount?: number } | null | undefined): number | null {
  if (!payload) return null;
  if (typeof payload.enabledCount === 'number') return payload.enabledCount;
  if (!Array.isArray(payload.skills) || !payload.skills.some((s) => typeof s.enabled === 'boolean')) return null;
  return payload.skills.filter((s) => isInstalled(s) && !isDisabled(s)).length;
}

/** Origin label: plugin name or "user"; entries with no SKILL.md on disk read "seen in transcripts". */
export const skillOrigin = (s: RealSkill) => (isNotOnDisk(s) ? SEEN_LABEL : (s.plugin ?? 'user'));

/** Description for display, with an honest fallback for missing/placeholder frontmatter. */
export function skillDescription(s: RealSkill): string {
  const d = s.description.trim();
  if (d && d !== '>') return s.description;
  return isNotOnDisk(s)
    ? 'Seen in transcripts only — no SKILL.md on disk (Claude Code built-in, removed plugin or a shared name).'
    : 'No description in SKILL.md frontmatter.';
}

/** base command ("/frontend-design") → every skill id that strips to it. */
export type CommandIndex = Map<string, string[]>;

export function buildCommandIndex(skills: RealSkill[]): CommandIndex {
  const idx: CommandIndex = new Map();
  for (const s of skills) {
    const c = skillCommand(s);
    const ids = idx.get(c);
    if (ids) ids.push(s.id);
    else idx.set(c, [s.id]);
  }
  return idx;
}

export interface CommandInfo {
  /** What /api/skills/run receives ("/name" — the API rejects namespaced "/plugin:name"). */
  command: string;
  /** What the UI shows: the bare command, or "/plugin:name" when the bare one is shared. */
  display: string;
  ambiguous: boolean;
  /** False when the bare command would not target this exact skill. */
  runnable: boolean;
  /** Other skill ids sharing the bare command. */
  peers: string[];
}

/**
 * Resolve a skill's command against the whole catalog. When several skills strip to the same "/name",
 * a bare (un-namespaced) user skill keeps it; every namespaced peer is shown by full id and is not
 * runnable from the dashboard, since the run API only accepts "/name".
 */
export function commandInfo(s: RealSkill, idx: CommandIndex): CommandInfo {
  const command = skillCommand(s);
  const ids = idx.get(command) ?? [s.id];
  if (ids.length <= 1) return { command, display: command, ambiguous: false, runnable: true, peers: [] };
  const bare = ids.filter((id) => !id.includes(':'));
  const owns = bare.length === 1 && bare[0] === s.id;
  return {
    command,
    display: owns ? command : `/${s.id}`,
    ambiguous: true,
    runnable: owns,
    peers: ids.filter((id) => id !== s.id),
  };
}

export function ambiguityNote(info: CommandInfo): string {
  if (!info.ambiguous) return '';
  return info.runnable
    ? `${info.command} also strips from ${info.peers.join(', ')} — this user skill owns the bare command.`
    : `${info.peers.length + 1} skills share ${info.command} (${info.peers.join(', ')}); /api/skills/run only accepts bare /name commands, so this one can't be targeted from the dashboard. Run it in Claude Code as ${info.display}.`;
}

/**
 * Cost-estimate tables mirrored from /api/skills/run (RATE $/MTok · EFFORT_MULT) so the routing
 * matrix's "≈ N× est. cost" hint agrees with the Execution Report. Estimates, not metered spend.
 */
export const RUN_RATE: Record<ModelTier, number> = { HAIKU: 0.55, SONNET: 4.6, OPUS: 12.5, FABLE: 21 };
export const RUN_EFFORT_MULT: Record<EffortLevel, number> = { LOW: 0.55, MEDIUM: 0.8, HIGH: 1, XHIGH: 1.35, MAX: 1.8 };
export const runCostWeight = (m: ModelTier, e: EffortLevel) => RUN_RATE[m] * RUN_EFFORT_MULT[e];

export function isRoutingMap(v: unknown): v is Record<string, Routing> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every((r) => {
    if (!r || typeof r !== 'object') return false;
    const { model, effort } = r as Record<string, unknown>;
    return (
      typeof model === 'string' &&
      (MODEL_TIERS as readonly string[]).includes(model) &&
      typeof effort === 'string' &&
      (EFFORT_LEVELS as readonly string[]).includes(effort)
    );
  });
}

export const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Default deck: top skills by 30-day uses, topped up with user skills when fewer than DECK_MAX were used. */
export function defaultDeck(skills: RealSkill[]): string[] {
  const used = [...skills].filter((s) => s.uses30d > 0).sort((a, b) => b.uses30d - a.uses30d);
  const ids = used.slice(0, DECK_MAX).map((s) => s.id);
  for (const s of skills) {
    if (ids.length >= DECK_MAX) break;
    if (s.source === 'user' && !ids.includes(s.id)) ids.push(s.id);
  }
  return ids;
}
