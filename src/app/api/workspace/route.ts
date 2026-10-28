import fs from 'node:fs/promises';
import type { ArtifactItem, BrainNode, Department, EffortLevel, ModelTier, SkillCardItem, WorkspaceResponse } from '@/types/os';
import { BRAIN_EDGES, BRAIN_NODES, EFFORT_LEVELS, MODEL_TIERS, ROUTER_DEPARTMENTS, type RouterDepartment } from '@/lib/mock-data';
import { listWorkspaceFiles, readWorkspaceFile, resolveWorkspacePath } from '@/lib/server/workspace';
import { HttpError, route } from '@/lib/server/route-helpers';
import { parseFrontmatter } from '@/lib/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isRouterDept = (s: string): s is RouterDepartment => (ROUTER_DEPARTMENTS as readonly string[]).includes(s);

/** Top-level workspace folders that belong to a department other than their own name. */
const FOLDER_DEPT: Record<string, RouterDepartment> = { ops: 'agents', videos: 'content' };

/** Artifact folder tag → department (`artifacts/<tag>/…`); unknown tags fall back to content. */
const ARTIFACT_TAG_DEPT: Record<string, RouterDepartment> = {
  epsilon: 'business',
  argus: 'business',
  robo: 'product',
  volta: 'product',
  'the-strangest-times': 'content',
  tst: 'content',
  youtube: 'content',
  tiktok: 'content',
  research: 'research',
  uap: 'research',
  agents: 'agents',
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
  return FOLDER_DEPT[first] ?? 'memory'; // context/ and anything else
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const tokensFor = (bytes: number) => Math.max(1, Math.round(bytes / 4));
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function asModel(v: string | undefined): ModelTier | undefined {
  const u = v?.toUpperCase();
  return (MODEL_TIERS as readonly string[]).includes(u ?? '') ? (u as ModelTier) : undefined;
}
function asEffort(v: string | undefined): EffortLevel | undefined {
  const u = v?.toUpperCase();
  return (EFFORT_LEVELS as readonly string[]).includes(u ?? '') ? (u as EffortLevel) : undefined;
}
const CATEGORIES = ['database', 'artifact', 'self-triggered'] as const;
const asCategory = (v: string | undefined): SkillCardItem['category'] =>
  (CATEGORIES as readonly string[]).includes(v ?? '') ? (v as SkillCardItem['category']) : 'artifact';

/**
 * Skills: one card per `skills/<name>/SKILL.md` on disk, from its frontmatter. Usage and cost are 0 here because the
 * workspace has no usage data — real usage lives in /api/skills-real (Claude Code transcripts).
 */
async function loadSkills(files: string[]): Promise<SkillCardItem[]> {
  const paths = files.filter((f) => /^skills\/[^/]+\/SKILL\.md$/.test(f)).sort();
  const cards = await Promise.all(
    paths.map(async (rel): Promise<SkillCardItem | null> => {
      const md = await readWorkspaceFile(rel);
      if (md === null) return null;
      const fm = parseFrontmatter(md);
      const name = fm.get('name') || rel.split('/')[1];
      return {
        id: `sk-${name}`,
        command: `/${name}`,
        name: name.replace(/(^|-)(\w)/g, (_m, sep: string, c: string) => (sep ? ' ' : '') + c.toUpperCase()),
        category: asCategory(fm.get('category')),
        model: asModel(fm.get('model')) ?? 'SONNET',
        effort: asEffort(fm.get('effort')) ?? 'MEDIUM',
        tokensPerWeek: 0,
        costPerWeekUsd: 0,
        usesPerWeek: 0,
        filePath: `workspace/${rel}`,
        markdownContent: md,
      };
    }),
  );
  return cards.filter((c): c is SkillCardItem => c !== null);
}

const ARTIFACT_TYPE: Record<string, ArtifactItem['type']> = { html: 'html', pdf: 'pdf', md: 'doc', png: 'image', jpg: 'image', jpeg: 'image', webp: 'image' };

/** Artifacts: real files under `artifacts/<tag>/`, newest first. */
function loadArtifacts(files: string[], stats: Map<string, { size: number; mtime: Date }>): ArtifactItem[] {
  const rows = files
    .filter((f) => f.startsWith('artifacts/') && f.split('/').length >= 3 && stats.has(f))
    .sort((a, b) => stats.get(b)!.mtime.getTime() - stats.get(a)!.mtime.getTime());
  return rows.map((rel, i) => {
    const file = rel.split('/').pop() ?? rel;
    const ext = file.split('.').pop()?.toLowerCase() ?? '';
    return {
      id: `art-${slug(rel)}`,
      title: file.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
      clientOrTag: rel.split('/')[1].toUpperCase(),
      type: ARTIFACT_TYPE[ext] ?? 'doc',
      filePath: `workspace/${rel}`,
      createdAt: isoDay(stats.get(rel)!.mtime),
      angleDeg: rows.length ? i * (360 / rows.length) : 0,
    };
  });
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

/** GET /api/workspace → WorkspaceResponse (real ./workspace scan; no template seeds). */
export const GET = route(async () => {
  const files = await listWorkspaceFiles().catch((e: Error) => {
    throw new HttpError(`Workspace scan failed: ${e.message}`, 500);
  });
  const [stats, skills] = await Promise.all([fileStats(files), loadSkills(files)]);
  const skillByPath = new Map(skills.map((s) => [s.filePath.replace(/^workspace\//, ''), s]));

  // 1. Structural nodes (root files + department routers), with real size and mtime when the file exists.
  const seedPaths = new Set<string>();
  const nodes: BrainNode[] = BRAIN_NODES.map((n) => {
    const rel = n.filePath.replace(/^workspace\//, '');
    seedPaths.add(rel);
    const st = stats.get(rel);
    return st ? { ...n, tokens: tokensFor(st.size), lastEdited: isoDay(st.mtime) } : n;
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
    const skill = skillByPath.get(rel);
    nodes.push({
      id,
      label: skill ? skill.command : (rel.split('/').pop() ?? rel),
      department,
      filePath: `workspace/${rel}`,
      tokens: tokensFor(st.size),
      lastEdited: isoDay(st.mtime),
      connections,
      summary: `On disk · ${rel}`,
      ...(skill ? { content: skill.markdownContent } : {}),
    });
    for (const target of connections) edges.push({ source: id, target });
  }

  const res: WorkspaceResponse = {
    totalFiles: files.length,
    scannedFiles: files.length,
    nodes,
    edges,
    skills,
    routines: [], // real routines: GET /api/routines (OpenClaw cron + launchd)
    artifacts: loadArtifacts(files, stats),
  };
  return res;
});
