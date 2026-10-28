'use client';

import type { BrainNode, Department, ModelTier, RoutineItem, SkillCardItem } from '@/types/os';

export type ViewId = 'orb' | 'map' | 'timeline' | 'routines' | 'skills' | 'apps';

export const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'orb', label: '3D orb' },
  { id: 'map', label: '2D map' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'routines', label: 'Routines' },
  { id: 'skills', label: 'Skills' },
  { id: 'apps', label: 'Applications' },
];

export function isViewId(v: string | null | undefined): v is ViewId {
  return !!v && VIEWS.some((x) => x.id === v);
}

export interface BrainEdge {
  source: string;
  target: string;
}

export interface BrainData {
  nodes: BrainNode[];
  edges: BrainEdge[];
  skills: SkillCardItem[];
  routines: RoutineItem[];
  totalFiles: number;
  scannedFiles: number | null; // null until /api/workspace answers
  live: boolean;
}

/** Lowercase query → set of matching node ids (null = no active search). */
export function matchNodes(query: string, nodes: BrainNode[]): Set<string> | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const out = new Set<string>();
  for (const n of nodes) {
    if (
      n.label.toLowerCase().includes(q) ||
      n.filePath.toLowerCase().includes(q) ||
      n.department.toLowerCase().includes(q) ||
      (n.summary ?? '').toLowerCase().includes(q)
    ) {
      out.add(n.id);
    }
  }
  return out;
}

export function textMatches(query: string, ...fields: (string | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => (f ?? '').toLowerCase().includes(q));
}

/** Workspace-relative path for /api/files (strips the leading `workspace/`). */
export function toWorkspacePath(filePath: string): string {
  return filePath.replace(/^\.?\/?workspace\//, '');
}

/** Relative API price per token vs OPUS (Haiku ≈ 1/12, Sonnet ≈ 1/5). */
export const MODEL_COST_FACTOR: Record<ModelTier, number> = {
  HAIKU: 1 / 12,
  SONNET: 1 / 5,
  OPUS: 1,
  FABLE: 1.6,
};

export function rerouteCost(baseCost: number, from: ModelTier, to: ModelTier): number {
  return (baseCost * MODEL_COST_FACTOR[to]) / MODEL_COST_FACTOR[from];
}

/** Ring / cluster order used across views. */
export const DEPT_ORDER: Department[] = [
  'memory',
  'skills',
  'business',
  'content',
  'research',
  'agents',
  'product',
  'personal',
  'routines',
  'applications',
];

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
