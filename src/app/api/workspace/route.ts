import fs from 'node:fs/promises';
import type { BrainNode, Department, EffortLevel, ModelTier, RoutineItem, SkillCardItem, WorkspaceResponse } from '@/types/os';
import { ARTIFACTS, BRAIN_EDGES, BRAIN_NODES, EFFORT_LEVELS, MODEL_TIERS, ROUTINES, SKILLS, TOTAL_BRAIN_FILES } from '@/lib/mock-data';
import { listWorkspaceFiles, readWorkspaceFile, resolveWorkspacePath } from '@/lib/server/workspace';
import { HttpError, route } from '@/lib/server/route-helpers';
import { parseFrontmatter } from './frontmatter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEPT_ROUTERS = ['business', 'content', 'personal', 'product', 'community'] as const;
type RouterDept = (typeof DEPT_ROUTERS)[number];
const isRouterDept = (s: string): s is RouterDept => (DEPT_ROUTERS as readonly string[]).includes(s);

/** Artifact folder tag → department, for files on disk that are not part of the seed graph. */
const ARTIFACT_TAG_DEPT: Record<string, RouterDept> = {
  betashares: 'business',
  northwind: 'business',
  'lumen-labs': 'business',
  stripe: 'business',
  'brand-watch': 'business',
  anthropic: 'business',
  robo: 'product',
  rubric: 'product',
  youtube: 'content',
  instagram: 'content',
  wildcard: 'content',
  community: 'community',
  personal: 'personal',
};

function inferDepartment(rel: string): Department {
  const [first, second] = rel.split('/');
  if (!second) return 'memory'; // root files: CLAUDE.md, AGENTS.md, MEMORY.md, …
  if (first === 'skills') return 'skills';
  if (first === 'routines') return 'routines';
  if (first === 'applications') return 'applications';
  if (first === 'departments') {
    const d = second.replace(/\.md$/, '');
    return isRouterDept(d) ? d : 'memory';
  }
  if (isRouterDept(first)) return first;
  if (first === 'artifacts') return ARTIFACT_TAG_DEPT[second] ?? 'content';
  if (first === 'videos') return 'content';
  return 'memory';
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const tokensFor = (bytes: number) => Math.max(1, Math.round(bytes / 4));

function asModel(v: string | undefined): ModelTier | undefined {
  const u = v?.toUpperCase();
  return (MODEL_TIERS as readonly string[]).includes(u ?? '') ? (u as ModelTier) : undefined;
}
function asEffort(v: string | undefined): EffortLevel | undefined {
  const u = v?.toUpperCase();
  return (EFFORT_LEVELS as readonly string[]).includes(u ?? '') ? (u as EffortLevel) : undefined;
}

/** Skills: real SKILL.md replaces the seed markdown; frontmatter model/effort override the seed tier. */
async function loadSkills(onDisk: Set<string>): Promise<SkillCardItem[]> {
  return Promise.all(
    SKILLS.map(async (s) => {
      const rel = s.filePath.replace(/^workspace\//, '');
      if (!onDisk.has(rel)) return s;
      const md = await readWorkspaceFile(rel);
      if (md === null) return s;
      const fm = parseFrontmatter(md);
      return { ...s, model: asModel(fm.model) ?? s.model, effort: asEffort(fm.effort) ?? s.effort, markdownContent: md };
    }),
  );
}

/** Routines: frontmatter `mode` and `cap_usd` override the seed (VOLTA Recos edits these). */
async function loadRoutines(onDisk: Set<string>): Promise<RoutineItem[]> {
  return Promise.all(
    ROUTINES.map(async (r) => {
      const rel = `routines/${r.id.replace(/^r-/, '')}.md`;
      if (!onDisk.has(rel)) return r;
      const md = await readWorkspaceFile(rel);
      if (md === null) return r;
      const fm = parseFrontmatter(md);
      const mode = fm.mode?.toUpperCase();
      const cap = fm.cap_usd !== undefined ? Number.parseFloat(fm.cap_usd) : NaN;
      return {
        ...r,
        mode: mode === 'ACTIVE' || mode === 'PASSIVE' ? mode : r.mode,
        capUsd: Number.isFinite(cap) && cap >= 0 ? cap : r.capUsd,
      };
    }),
  );
}

async function fileStats(files: string[]): Promise<Map<string, { size: number; mtime: Date }>> {
  const entries = await Promise.all(
    files.map(async (rel) => {
      try {
        const st = await fs.stat(resolveWorkspacePath(rel));
        return [rel, { size: st.size, mtime: st.mtime }] as const;
      } catch {
        return null; // file vanished between list and stat — skip it
      }
    }),
  );
  return new Map(entries.filter((e): e is NonNullable<typeof e> => e !== null));
}

/** GET /api/workspace → WorkspaceResponse (real ./workspace scan merged with the procedural Second Brain). */
export const GET = route(async () => {
  const files = await listWorkspaceFiles().catch((e: Error) => {
    throw new HttpError(`Workspace scan failed: ${e.message}`, 500);
  });
  const onDisk = new Set(files);
  const [stats, skills, routines] = await Promise.all([fileStats(files), loadSkills(onDisk), loadRoutines(onDisk)]);
  const skillById = new Map(skills.map((s) => [s.id, s]));

  // 1. Seed nodes, refreshed with real token counts (and real skill content) when the file exists.
  const seedPaths = new Set<string>();
  const nodes: BrainNode[] = BRAIN_NODES.map((n) => {
    const rel = n.filePath.replace(/^workspace\//, '');
    seedPaths.add(rel);
    const st = stats.get(rel);
    if (!st) return n;
    const skill = n.department === 'skills' ? skillById.get(n.id) : undefined;
    return { ...n, tokens: tokensFor(st.size), ...(skill ? { content: skill.markdownContent } : {}) };
  });

  // 2. Real files that are not in the seed graph become extra nodes linked to their department router.
  const ids = new Set(nodes.map((n) => n.id));
  const edges = [...BRAIN_EDGES];
  for (const rel of files) {
    if (seedPaths.has(rel)) continue;
    const st = stats.get(rel);
    if (!st) continue;
    let id = `ws-${slug(rel)}`;
    for (let i = 2; ids.has(id); i++) id = `ws-${slug(rel)}-${i}`;
    ids.add(id);
    const department = inferDepartment(rel);
    const parent = isRouterDept(department) ? `dept-${department}` : department === 'memory' ? 'claude-md' : undefined;
    const connections = parent && ids.has(parent) ? [parent] : [];
    nodes.push({
      id,
      label: rel.split('/').pop() ?? rel,
      department,
      filePath: `workspace/${rel}`,
      tokens: tokensFor(st.size),
      lastEdited: st.mtime.toISOString().slice(0, 10),
      connections,
      summary: `On disk · ${rel}`,
    });
    for (const target of connections) edges.push({ source: id, target });
  }

  const res: WorkspaceResponse = {
    totalFiles: TOTAL_BRAIN_FILES,
    scannedFiles: files.length,
    nodes,
    edges,
    skills,
    routines,
    artifacts: ARTIFACTS,
  };
  return res;
});
