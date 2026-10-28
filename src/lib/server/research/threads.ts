import 'server-only';
import path from 'node:path';
import { bestLabel, tagKey, type DomainLink, type DomainNode, type FolderBridge, type Highlight, type ThreadCluster, type ThreadMember, type ThreadsResponse } from '@/components/research/types';
import { loadConfig } from './config';
import { getGraph } from './graphs';
import { getLibrary, type Library } from './library';

// "Threads": what connects the folders. Graphify communities as clusters, Stage A cross-domain links as a domain
// network, graph edges that cross top-level folders, and the highest-signal documents.

const CLUSTERS_PER_GRAPH = 70;
const MEMBERS_PER_CLUSTER = 24;
const NETWORK_NODES = 70;
const NETWORK_LINKS = 240;
const SKIP_TAGS = new Set(['science']); // the category label, not a domain
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s);

function domainNetwork(lib: Library): ThreadsResponse['domainNetwork'] {
  const nodeAgg = new Map<string, { n: number; nov: number; novN: number; variants: Map<string, number> }>();
  const pairAgg = new Map<string, { w: number; docs: { sid: string; title: string; nov: number; bridge: string }[] }>();
  for (const rec of lib.stageA.recs) {
    const keys: { k: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const t of rec.domainTags) {
      const k = tagKey(t);
      if (!k || SKIP_TAGS.has(k) || seen.has(k)) continue;
      seen.add(k);
      keys.push({ k, label: t });
    }
    for (const { k, label } of keys) {
      const e = nodeAgg.get(k) ?? { n: 0, nov: 0, novN: 0, variants: new Map() };
      e.n++;
      if (rec.novelty !== null) {
        e.nov += rec.novelty;
        e.novN++;
      }
      e.variants.set(label, (e.variants.get(label) ?? 0) + 1);
      nodeAgg.set(k, e);
    }
    const ks = keys.slice(0, 8);
    for (let i = 0; i < ks.length; i++) {
      for (let j = i + 1; j < ks.length; j++) {
        const [a, b] = ks[i].k < ks[j].k ? [ks[i], ks[j]] : [ks[j], ks[i]];
        const pk = `${a.k}\0${b.k}`;
        const e = pairAgg.get(pk) ?? { w: 0, docs: [] };
        e.w++;
        const la = a.label.toLowerCase();
        const lb = b.label.toLowerCase();
        const bridge = rec.crossDomainLinks.find((l) => l.toLowerCase().includes(la) || l.toLowerCase().includes(lb)) ?? rec.crossDomainLinks[0] ?? '';
        e.docs.push({ sid: rec.sid, title: rec.title, nov: rec.novelty ?? 0, bridge: bridge.replace(/^Bridge\s*\d+\s*[:.-]\s*/i, '') });
        pairAgg.set(pk, e);
      }
    }
  }
  const kept = [...nodeAgg].filter(([, e]) => e.n >= 3).sort((a, b) => b[1].n - a[1].n).slice(0, NETWORK_NODES);
  const keep = new Set(kept.map(([k]) => k));
  const nodes: DomainNode[] = kept.map(([key, e]) => ({
    key,
    label: bestLabel(e.variants, key),
    count: e.n,
    avgNovelty: e.novN ? Math.round((e.nov / e.novN) * 100) / 100 : 0,
  }));
  const links: DomainLink[] = [...pairAgg]
    .map(([pk, e]) => ({ pk, e, a: pk.split('\0')[0], b: pk.split('\0')[1] }))
    .filter((x) => keep.has(x.a) && keep.has(x.b) && x.e.w >= 2)
    .sort((x, y) => y.e.w - x.e.w)
    .slice(0, NETWORK_LINKS)
    .map((x) => ({
      a: x.a,
      b: x.b,
      weight: x.e.w,
      examples: x.e.docs
        .sort((p, q) => q.nov - p.nov)
        .slice(0, 4)
        .map((d) => ({ sid: d.sid, title: d.title, bridge: clip(d.bridge, 260) })),
    }));
  return { nodes, links };
}

function highlights(lib: Library): Highlight[] {
  const out: Highlight[] = [];
  for (const rec of lib.stageA.recs) {
    const row = lib.bySid.get(rec.sid) ?? null;
    const reasons: string[] = [];
    let score = 0;
    if (rec.action === 'escalate') {
      reasons.push('escalate');
      score += 3;
    }
    if ((rec.novelty ?? 0) >= 0.85) {
      reasons.push(`novelty ${rec.novelty!.toFixed(2)}`);
      score += 2.5;
    }
    score += (rec.novelty ?? 0) * 2;
    if (rec.hasContradiction) {
      reasons.push('contradiction');
      score += 2;
    }
    const pr = rec.stageB?.priority;
    if (pr === 'high' || pr === 'critical') {
      reasons.push(`Stage B ${pr}`);
      score += pr === 'critical' ? 3 : 1.5;
    }
    if ((rec.crossDomainCount ?? 0) >= 4) {
      reasons.push(`${rec.crossDomainCount} domains`);
      score += 1;
    }
    if (!reasons.length) continue;
    const folder = row?.folder ?? (rec.rel ? rec.rel.split('/')[0] : '');
    out.push({
      sid: rec.sid,
      rowId: row?.id ?? null,
      title: rec.title,
      folder,
      novelty: rec.novelty,
      action: rec.action,
      contradiction: rec.hasContradiction,
      crossDomain: rec.crossDomainCount,
      priority: pr ?? null,
      storage: row?.storage ?? null,
      reasons,
      summary: clip(rec.summary, 300) || null,
      score: Math.round(score * 100) / 100,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 40);
}

async function clustersAndBridges(lib: Library): Promise<Pick<ThreadsResponse, 'clusters' | 'clusterTotals' | 'folderBridges'>> {
  const cfg = loadConfig();
  const clusters: ThreadCluster[] = [];
  const clusterTotals: ThreadsResponse['clusterTotals'] = [];
  const bridgeAgg = new Map<string, FolderBridge>();

  for (const gc of cfg.graphs) {
    let g;
    try {
      g = await getGraph(gc.id);
    } catch {
      continue; // reported on the Status tab
    }
    const folderOf = (sid: string | null): string | null => {
      if (!sid) return null;
      const row = lib.bySid.get(sid);
      if (row) return row.folder;
      const rec = lib.stageA.bySid.get(sid);
      return rec?.rel ? rec.rel.split('/')[0] : null;
    };
    const outDeg = new Map<number, number>();
    for (const l of g.links) {
      const a = g.byId.get(l.s)!;
      const b = g.byId.get(l.t)!;
      if (a.community !== b.community) {
        outDeg.set(a.community, (outDeg.get(a.community) ?? 0) + 1);
        outDeg.set(b.community, (outDeg.get(b.community) ?? 0) + 1);
      }
      if (gc.docNodes === 'stagea' && a.sid && b.sid && a.sid !== b.sid) {
        const fa = folderOf(a.sid);
        const fb = folderOf(b.sid);
        if (fa && fb && fa !== fb) {
          const [x, y] = fa < fb ? [fa, fb] : [fb, fa];
          const k = `${x}\0${y}`;
          const e = bridgeAgg.get(k) ?? { a: x, b: y, count: 0, examples: [] };
          e.count++;
          if (e.examples.length < 4) e.examples.push({ from: a.label, to: b.label, relation: l.rel });
          bridgeAgg.set(k, e);
        }
      }
    }
    const ranked = [...g.members].filter(([c]) => c >= 0).sort((a, b) => b[1].length - a[1].length);
    clusterTotals.push({ graph: gc.id, label: gc.label, communities: g.members.size, shown: Math.min(ranked.length, CLUSTERS_PER_GRAPH) });
    for (const [cid, ids] of ranked.slice(0, CLUSTERS_PER_GRAPH)) {
      const nodes = ids.map((i) => g.byId.get(i)!);
      const concepts = [...nodes].sort((a, b) => (g.deg.get(b.id) ?? 0) - (g.deg.get(a.id) ?? 0)).slice(0, 6).map((n) => n.label);
      const groups = new Map<string, ThreadMember>();
      for (const n of nodes) {
        const key = n.sid ?? n.sourceFile ?? n.id;
        const e = groups.get(key);
        if (e) {
          e.count++;
          continue;
        }
        if (n.sid) {
          const rec = lib.stageA.bySid.get(n.sid);
          const row = lib.bySid.get(n.sid);
          groups.set(key, {
            label: rec?.title ?? n.label,
            sid: n.sid,
            rowId: row?.id,
            folder: folderOf(n.sid) ?? undefined,
            novelty: rec?.novelty ?? null,
            action: rec?.action ?? null,
            count: 1,
          });
        } else {
          const base = n.sourceFile ? path.basename(n.sourceFile).replace(/\.[A-Za-z0-9]{1,5}$/, '') : n.label;
          groups.set(key, { label: base || n.label, count: 1 });
        }
      }
      const members = [...groups.values()].sort((a, b) => (b.novelty ?? -1) - (a.novelty ?? -1) || b.count - a.count).slice(0, MEMBERS_PER_CLUSTER);
      clusters.push({
        graph: gc.id,
        id: cid,
        name: g.names.get(cid) ?? `Community ${cid}`,
        size: ids.length,
        concepts,
        members,
        folders: [...new Set(members.map((m) => m.folder).filter((f): f is string => !!f))],
        bridges: outDeg.get(cid) ?? 0,
      });
    }
  }
  const folderBridges = [...bridgeAgg.values()].sort((a, b) => b.count - a.count).slice(0, 24);
  return { clusters, clusterTotals, folderBridges };
}

export async function getThreads(): Promise<ThreadsResponse | null> {
  const lib = await getLibrary();
  if (!lib) return null;
  const cb = await clustersAndBridges(lib);
  return { ...cb, domainNetwork: domainNetwork(lib), highlights: highlights(lib) };
}
