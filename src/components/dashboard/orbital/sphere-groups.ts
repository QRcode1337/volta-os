// Particle groups of the Second Brain sphere and the real sources behind them. Shared by the sphere
// (particle colours + density) and the CenterOrbitalCore legend (labels + counts).

export type SphereGroupId = 'notes' | 'captures' | 'skills' | 'routines' | 'mcp';

export interface SphereGroupMeta {
  id: SphereGroupId;
  label: string;
  color: string;
  /** Where the group lives in the sphere and which API it is counted from. */
  part: string;
  source: string;
}

export const SPHERE_GROUPS: SphereGroupMeta[] = [
  { id: 'notes', label: 'Notes', color: '#FF6B2B', part: 'outer shell lobes', source: 'Obsidian vaults · /api/vaults' },
  { id: 'captures', label: 'Captures', color: '#06B6D4', part: 'outer shell lobes', source: 'unvolta-ltm screen memory · /api/ltm/status' },
  { id: 'skills', label: 'Skills', color: '#FFFFFF', part: 'white core', source: 'user + plugin skills · /api/skills-real' },
  { id: 'routines', label: 'Routines', color: '#F5A623', part: 'ring (amber band)', source: 'OpenClaw cron + LaunchAgents · /api/routines' },
  { id: 'mcp', label: 'MCP servers', color: '#8B5CF6', part: 'ring (violet band)', source: 'configured MCP servers · /api/mcp' },
];

/** Sentinel for a source that failed with no cached value — its particle group is hidden, not guessed. */
export const SPHERE_OFFLINE = 'offline' as const;

/** number = real count; null/undefined = still loading; 'offline' = source failed with nothing cached. */
export type SphereCount = number | null | typeof SPHERE_OFFLINE;
export type SphereCounts = Partial<Record<SphereGroupId, SphereCount>>;

const LOADING_FRACTION = 0.5;
const MIN_FRACTION = 0.16;

/**
 * Share of each group's particle budget to draw: log10(1 + count) relative to the largest known group,
 * so a 12k-capture memory dwarfs 14 MCP servers without hiding them. 0 or offline → hidden;
 * loading → neutral 0.5 until the count arrives.
 */
export function sphereFractions(counts: SphereCounts): Record<SphereGroupId, number> {
  const known = SPHERE_GROUPS.map((g) => counts[g.id]).filter((c): c is number => typeof c === 'number' && c > 0);
  const maxLog = known.length ? Math.max(...known.map((c) => Math.log10(1 + c))) : 0;
  const out = {} as Record<SphereGroupId, number>;
  for (const g of SPHERE_GROUPS) {
    const c = counts[g.id];
    if (c === SPHERE_OFFLINE) out[g.id] = 0;
    else if (typeof c !== 'number') out[g.id] = LOADING_FRACTION;
    else if (c <= 0 || maxLog === 0) out[g.id] = 0;
    else out[g.id] = MIN_FRACTION + (1 - MIN_FRACTION) * (Math.log10(1 + c) / maxLog);
  }
  return out;
}
