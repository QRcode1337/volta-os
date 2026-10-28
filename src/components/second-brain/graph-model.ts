// Pure (framework-free) model for the Second Brain wikilink graph served by /api/brain/graph.
// Clusters = vault/folder. Colours = per vault, tinted per folder. No value imports from '@/…' (relative only)
// so the layout code can be exercised outside Next.
import type { BrainGraph, BrainGraphNode } from '@/types/sources';
import { obsidianUrl } from '../../lib/text';

export const VAULT_COLORS: Record<string, string> = {
  'Pieces-Vault': '#FF6B2B',
  Voltamachine: '#8B5CF6',
  Quantum: '#06B6D4',
};
const VAULT_PALETTE = ['#10B981', '#EAB308', '#EC4899', '#3B82F6', '#84CC16', '#F472B6', '#2DD4BF', '#F5A623'];

// Folder tints inside a vault: 0 = vault colour, >0 toward paper, <0 toward ink.
const FOLDER_TINTS = [0, 0.42, -0.24, 0.66, 0.2, -0.12, 0.54, 0.1, 0.32, -0.06];

export interface GraphNode extends BrainGraphNode {
  index: number;
  vaultId: string;
  cluster: number; // index into model.clusters (-1 for stubs outside the graph)
  color: string; // folder tint of the vault colour
  vaultColor: string;
  rank: number; // 0 = most-linked node in the graph
  links: number; // edges inside the shown graph
  search: string; // searchKey(label, relPath) — see noteMatches()
  stub?: boolean; // built from an id that is not part of the capped graph
}

export interface GraphEdge {
  source: string;
  target: string;
  s: number; // node index
  t: number;
}

export interface GraphCluster {
  index: number;
  key: string; // `${vault}/${folder}`
  vault: string;
  vaultId: string;
  folder: string;
  color: string;
  vaultColor: string;
  shown: number; // nodes in the capped graph
  total: number; // notes in this folder across the whole vault
  nodes: number[];
}

export interface GraphVault {
  id: string;
  name: string;
  color: string;
  total: number;
  shown: number;
  clusters: number[];
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  byId: Map<string, GraphNode>;
  adj: number[][]; // undirected neighbour indices
  clusters: GraphCluster[];
  vaults: GraphVault[];
  totalNotes: number;
  totalLinks: number;
  skippedFiles: number;
  generatedAt: string;
  maxDegree: number;
  /** `${vaultId}|${label.toLowerCase()}` → node id (Obsidian resolves [[Name]] by basename per vault). */
  labelIndex: Map<string, string>;
}

function mix(hex: string, t: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const to = t >= 0 ? [245, 242, 235] : [10, 10, 10];
  const k = Math.abs(t);
  const out = ch.map((c, i) => Math.round(c + (to[i] - c) * k));
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function vaultColor(name: string, index: number): string {
  return VAULT_COLORS[name] ?? VAULT_PALETTE[index % VAULT_PALETTE.length];
}

export const noteTitle = (relPath: string) => (relPath.split('/').pop() ?? relPath).replace(/\.md$/, '');
export const noteFolder = (relPath: string) => (relPath.includes('/') ? relPath.split('/')[0] : '(root)');
const vaultIdOf = (id: string) => id.slice(0, Math.max(0, id.indexOf(':')));

export function buildGraphModel(g: BrainGraph): GraphModel {
  const vaultIdByName = new Map(g.vaults.map((v) => [v.name, v.id]));
  const raw = g.nodes;

  // Vault order: most nodes shown first, then by total notes.
  const shownByVault = new Map<string, number>();
  for (const n of raw) shownByVault.set(n.vault, (shownByVault.get(n.vault) ?? 0) + 1);
  const vaultNames = [...new Set([...g.vaults.map((v) => v.name), ...raw.map((n) => n.vault)])];
  const totalByVault = new Map(g.vaults.map((v) => [v.name, v.notes]));
  vaultNames.sort((a, b) => (shownByVault.get(b) ?? 0) - (shownByVault.get(a) ?? 0) || (totalByVault.get(b) ?? 0) - (totalByVault.get(a) ?? 0));
  const colorByVault = new Map(vaultNames.map((name, i) => [name, vaultColor(name, i)]));

  // Clusters (vault/folder) that have at least one shown node.
  const folderTotals = new Map(g.folders.map((f) => [`${f.vault}/${f.folder}`, f.count]));
  const clusterShown = new Map<string, number>();
  for (const n of raw) {
    const k = `${n.vault}/${n.folder}`;
    clusterShown.set(k, (clusterShown.get(k) ?? 0) + 1);
  }
  const clusters: GraphCluster[] = [];
  const vaults: GraphVault[] = [];
  for (const name of vaultNames) {
    const vc = colorByVault.get(name)!;
    const id = vaultIdByName.get(name) ?? vaultIdOf(raw.find((n) => n.vault === name)?.id ?? '');
    const keys = [...clusterShown.keys()]
      .filter((k) => k.startsWith(`${name}/`))
      .sort((a, b) => clusterShown.get(b)! - clusterShown.get(a)! || a.localeCompare(b));
    const v: GraphVault = { id, name, color: vc, total: totalByVault.get(name) ?? 0, shown: shownByVault.get(name) ?? 0, clusters: [] };
    keys.forEach((key, j) => {
      const index = clusters.length;
      clusters.push({
        index,
        key,
        vault: name,
        vaultId: id,
        folder: key.slice(name.length + 1),
        color: mix(vc, FOLDER_TINTS[j % FOLDER_TINTS.length]),
        vaultColor: vc,
        shown: clusterShown.get(key)!,
        total: folderTotals.get(key) ?? clusterShown.get(key)!,
        nodes: [],
      });
      v.clusters.push(index);
    });
    vaults.push(v);
  }
  const clusterIdx = new Map(clusters.map((c) => [c.key, c.index]));

  const order = raw.map((_, i) => i).sort((a, b) => raw[b].degree - raw[a].degree || raw[b].mtime.localeCompare(raw[a].mtime));
  const rankOf = new Int32Array(raw.length);
  order.forEach((idx, r) => (rankOf[idx] = r));

  const nodes: GraphNode[] = raw.map((n, i) => {
    const ci = clusterIdx.get(`${n.vault}/${n.folder}`) ?? 0;
    const c = clusters[ci];
    c?.nodes.push(i);
    return {
      ...n,
      index: i,
      vaultId: vaultIdOf(n.id),
      cluster: ci,
      color: c?.color ?? '#A39E93',
      vaultColor: c?.vaultColor ?? '#A39E93',
      rank: rankOf[i],
      links: 0,
      search: searchKey(n.label, n.relPath),
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj: number[][] = nodes.map(() => []);
  const edges: GraphEdge[] = [];
  for (const e of g.edges) {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b || a === b) continue;
    edges.push({ source: a.id, target: b.id, s: a.index, t: b.index });
    adj[a.index].push(b.index);
    adj[b.index].push(a.index);
  }
  for (const n of nodes) n.links = adj[n.index].length;
  const labelIndex = new Map<string, string>();
  for (const n of nodes) labelIndex.set(`${n.vaultId}|${n.label.toLowerCase()}`, n.id);

  return {
    nodes,
    edges,
    byId,
    adj,
    clusters,
    vaults,
    totalNotes: g.totalNotes,
    totalLinks: g.totalLinks,
    skippedFiles: g.skippedFiles,
    generatedAt: g.generatedAt,
    maxDegree: Math.max(1, ...nodes.map((n) => n.degree)),
    labelIndex,
  };
}

/**
 * A minimal node for a note that is not part of the capped graph (e.g. picked from search or the timeline).
 * `vaultHint` names/colours the vault while the graph model is still loading (from /api/vaults).
 */
export function stubNode(id: string, model: GraphModel | null, mtime?: string, vaultHint?: { name: string; color: string } | null): GraphNode | null {
  const vaultId = vaultIdOf(id);
  const relPath = id.slice(vaultId.length + 1);
  if (!vaultId || !relPath.endsWith('.md')) return null;
  const vault = model?.vaults.find((v) => v.id === vaultId);
  if (model && !vault) return null;
  const folder = noteFolder(relPath);
  const cluster = model?.clusters.find((c) => c.vaultId === vaultId && c.folder === folder);
  const vc = vault?.color ?? vaultHint?.color ?? '#A39E93';
  const label = noteTitle(relPath);
  return {
    id,
    label,
    vault: vault?.name ?? vaultHint?.name ?? vaultId,
    folder,
    relPath,
    degree: 0,
    mtime: mtime ?? '',
    obsidianUrl: obsidianUrl(vaultId, relPath),
    index: -1,
    vaultId,
    cluster: cluster?.index ?? -1,
    color: cluster?.color ?? vc,
    vaultColor: vc,
    rank: -1,
    links: 0,
    search: searchKey(label, relPath),
    stub: true,
  };
}

// ── Search: ONE rule for graph highlighting and the full-index dropdown, so their counts agree. ──

/** Lowercased `title relPath` (the folder is the first relPath segment, so it is covered too). */
export const searchKey = (title: string, relPath: string) => `${title} ${relPath}`.toLowerCase();

/** `q` must already be trimmed + lowercased. Matches title, path/folder, or vault name. */
export function noteMatches(q: string, key: string, vaultLower: string): boolean {
  return key.includes(q) || vaultLower.includes(q);
}

/** Lowercase substring match on title, folder/path and vault. null = no active search. */
export function matchGraphNodes(query: string, nodes: GraphNode[]): Set<string> | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const vaultLower = new Map<string, string>();
  const out = new Set<string>();
  for (const n of nodes) {
    let vl = vaultLower.get(n.vault);
    if (vl === undefined) vaultLower.set(n.vault, (vl = n.vault.toLowerCase()));
    if (noteMatches(q, n.search, vl)) out.add(n.id);
  }
  return out;
}

/** "3h ago" style label. `nowMs` must come from state set after mount (hydration-safe). */
export function relTime(iso: string, nowMs: number | null): string {
  if (!iso || nowMs == null) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const mins = Math.max(0, Math.round((nowMs - t) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 60) return `${days}d ago`;
  const months = Math.round(days / 30.4);
  if (months < 24) return `${months}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

/** Deterministic PRNG (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
}
