import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { GraphCommunity, GraphData, GraphEdge, GraphNode } from '@/components/research/types';
import { cached } from '../sources/cache';
import { loadConfig, ResearchError, type GraphCfg } from './config';
import { isPlaceholder } from './inventory';

// Graphify outputs (graph.json + GRAPH_REPORT.md). Read-only; a graph that is an iCloud placeholder is refused, not opened.

const TTL_MS = 5 * 60_000;

export interface GNode {
  id: string;
  label: string;
  community: number;
  type: string;
  sourceFile: string;
  /** Stage A id, for graphs whose nodes come from stagea-md notes. */
  sid: string | null;
}
export interface GLink {
  s: string;
  t: string;
  rel: string;
  conf: string;
}
export interface LoadedGraph {
  cfg: GraphCfg;
  nodes: GNode[];
  byId: Map<string, GNode>;
  links: GLink[];
  deg: Map<string, number>;
  /** community id -> member node ids */
  members: Map<number, string[]>;
  names: Map<number, string>;
  report: string | null;
  builtAt: string | null;
}

const asStr = (v: unknown) => (typeof v === 'string' ? v : '');

async function load(cfg: GraphCfg): Promise<LoadedGraph> {
  const file = path.join(cfg.dir, 'graph.json');
  const st = await fs.stat(file).catch(() => null);
  if (!st) throw new ResearchError(`${file} does not exist.`, 404);
  if (isPlaceholder(st)) throw new ResearchError(`${file} is an iCloud placeholder (not downloaded), so it was not opened.`, 409);
  const j = JSON.parse(await fs.readFile(file, 'utf8')) as { nodes?: Record<string, unknown>[]; links?: Record<string, unknown>[] };

  const nodes: GNode[] = [];
  for (const n of j.nodes ?? []) {
    const id = asStr(n.id);
    if (!id) continue;
    const sourceFile = asStr(n.source_file);
    const stem = path.basename(sourceFile).replace(/\.md$/i, '');
    nodes.push({
      id,
      label: asStr(n.label) || id,
      community: typeof n.community === 'number' ? n.community : -1,
      type: asStr(n.file_type) || 'node',
      sourceFile,
      sid: cfg.docNodes === 'stagea' && /^\d{8}-\d{6}-\d+$/.test(stem) ? stem : null,
    });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links: GLink[] = [];
  const deg = new Map<string, number>();
  for (const l of j.links ?? []) {
    const s = asStr(l.source);
    const t = asStr(l.target);
    if (!byId.has(s) || !byId.has(t) || s === t) continue;
    links.push({ s, t, rel: asStr(l.relation) || 'related', conf: asStr(l.confidence) || 'EXTRACTED' });
    deg.set(s, (deg.get(s) ?? 0) + 1);
    deg.set(t, (deg.get(t) ?? 0) + 1);
  }
  const members = new Map<number, string[]>();
  for (const n of nodes) (members.get(n.community) ?? members.set(n.community, []).get(n.community)!).push(n.id);

  // Community names: the report's hub list is in community-id order; else the node's community_name; else its best-connected node.
  let report: string | null = null;
  let hubs: string[] = [];
  try {
    const md = await fs.readFile(path.join(cfg.dir, 'GRAPH_REPORT.md'), 'utf8');
    hubs = [...md.matchAll(/\[\[_COMMUNITY_[^|\]]*\|([^\]]+)\]\]/g)].map((m) => m[1].trim());
    report = /^## Summary\s*\n([\s\S]*?)(?=\n## )/m.exec(md)?.[1]?.trim().slice(0, 800) ?? null;
  } catch {
    // no report: names fall back to the nodes
  }
  const rawNames = new Map<number, string>();
  for (const n of j.nodes ?? []) if (typeof n.community === 'number' && typeof n.community_name === 'string' && n.community_name) rawNames.set(n.community, n.community_name);
  const names = new Map<number, string>();
  for (const [c, ids] of members) {
    const best = ids.reduce((a, b) => ((deg.get(b) ?? 0) > (deg.get(a) ?? 0) ? b : a), ids[0]);
    names.set(c, rawNames.get(c) || hubs[c] || byId.get(best)?.label || `Community ${c}`);
  }
  return { cfg, nodes, byId, links, deg, members, names, report, builtAt: st.mtime.toISOString() };
}

export function graphCfg(id: string): GraphCfg {
  const g = loadConfig().graphs.find((x) => x.id === id);
  if (!g) throw new ResearchError(`Unknown graph "${id}".`, 404);
  return g;
}

export const getGraph = (id: string, force = false) => {
  const cfg = graphCfg(id);
  return cached<LoadedGraph>(`research:graph:${id}`, TTL_MS, () => load(cfg), { force });
};

/** A browser-sized sample: the best-connected nodes of the biggest communities (or one community plus its neighbours). */
export async function sampleGraph(id: string, opts: { maxNodes?: number; maxEdges?: number; community?: number | null } = {}): Promise<GraphData> {
  const g = await getGraph(id);
  const maxNodes = Math.min(900, Math.max(30, opts.maxNodes ?? 450));
  const maxEdges = Math.min(2000, Math.max(30, opts.maxEdges ?? 900));
  const picked = new Set<string>();
  const degOf = (nid: string) => g.deg.get(nid) ?? 0;
  const byDeg = (a: string, b: string) => degOf(b) - degOf(a);

  if (opts.community !== null && opts.community !== undefined && g.members.has(opts.community)) {
    const inside = [...g.members.get(opts.community)!].sort(byDeg).slice(0, maxNodes);
    inside.forEach((n) => picked.add(n));
    const room = Math.max(0, maxNodes - picked.size);
    const outside = new Map<string, number>();
    for (const l of g.links) {
      const a = picked.has(l.s);
      const b = picked.has(l.t);
      if (a !== b) outside.set(a ? l.t : l.s, (outside.get(a ? l.t : l.s) ?? 0) + 1);
    }
    [...outside].sort((x, y) => y[1] - x[1]).slice(0, Math.min(room, Math.ceil(maxNodes / 3))).forEach(([n]) => picked.add(n));
  } else {
    const comms = [...g.members].sort((a, b) => b[1].length - a[1].length);
    const quota = Math.max(3, Math.floor(maxNodes / Math.min(40, comms.length || 1) / 1.6));
    for (const [, ids] of comms.slice(0, 40)) [...ids].sort(byDeg).slice(0, quota).forEach((n) => picked.add(n));
    if (picked.size < maxNodes) {
      for (const n of g.nodes.map((x) => x.id).sort(byDeg)) {
        if (picked.size >= maxNodes) break;
        picked.add(n);
      }
    }
    while (picked.size > maxNodes) picked.delete([...picked].sort((a, b) => degOf(a) - degOf(b))[0]);
  }

  const edgesAll = g.links.filter((l) => picked.has(l.s) && picked.has(l.t));
  const cross = (l: GLink) => (g.byId.get(l.s)!.community !== g.byId.get(l.t)!.community ? 1 : 0);
  const edges: GraphEdge[] = edgesAll
    .sort((a, b) => cross(b) - cross(a) || (b.conf === 'INFERRED' ? 1 : 0) - (a.conf === 'INFERRED' ? 1 : 0))
    .slice(0, maxEdges)
    .map((l) => ({ s: l.s, t: l.t, rel: l.rel, conf: l.conf }));
  const nodes: GraphNode[] = [...picked].map((nid) => {
    const n = g.byId.get(nid)!;
    return { id: n.id, label: n.label, c: n.community, deg: degOf(n.id), type: n.type, ...(n.sid ? { sid: n.sid } : {}) };
  });
  const sampledBy = new Map<number, number>();
  for (const n of nodes) sampledBy.set(n.c, (sampledBy.get(n.c) ?? 0) + 1);
  const communities: GraphCommunity[] = [...sampledBy.keys()]
    .map((c) => ({ id: c, name: g.names.get(c) ?? `Community ${c}`, size: g.members.get(c)?.length ?? 0 }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 80);
  return {
    source: id,
    label: g.cfg.label,
    totals: { nodes: g.nodes.length, edges: g.links.length, communities: g.members.size },
    sampled: { nodes: nodes.length, edges: edges.length },
    nodes,
    edges,
    communities,
    report: g.report,
    builtAt: g.builtAt,
  };
}
