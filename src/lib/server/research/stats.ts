import 'server-only';
import { bestLabel, tagKey, type StatsResponse } from '@/components/research/types';
import { getLibrary } from './library';

/** Per-domain (Stage A tags) and per-folder (inventory) stats. Null while the first inventory build is running. */
export async function getStats(): Promise<StatsResponse | null> {
  const lib = await getLibrary();
  if (!lib) return null;

  const dom = new Map<string, { label: Map<string, number>; docs: number; nov: number; novN: number; esc: number; con: number }>();
  for (const rec of lib.stageA.recs) {
    const seen = new Set<string>();
    for (const t of rec.domainTags) {
      const k = tagKey(t);
      if (!k) continue;
      const e = dom.get(k) ?? { label: new Map(), docs: 0, nov: 0, novN: 0, esc: 0, con: 0 };
      e.label.set(t, (e.label.get(t) ?? 0) + 1);
      dom.set(k, e);
      if (seen.has(k)) continue;
      seen.add(k);
      e.docs++;
      if (rec.novelty !== null) {
        e.nov += rec.novelty;
        e.novN++;
      }
      if (rec.action === 'escalate') e.esc++;
      if (rec.hasContradiction) e.con++;
    }
  }
  const domains = [...dom]
    .map(([key, e]) => ({
      key,
      label: bestLabel(e.label, key),
      docs: e.docs,
      avgNovelty: e.novN ? Math.round((e.nov / e.novN) * 100) / 100 : 0,
      escalate: e.esc,
      contradictions: e.con,
    }))
    .sort((a, b) => b.docs - a.docs)
    .slice(0, 80);

  const fold = new Map<string, StatsResponse['folders'][number]>();
  for (const r of lib.rows) {
    if (r.storage === 'external') continue;
    const k = `${r.root}\0${r.folder}`;
    const e = fold.get(k) ?? { root: r.root, rootLabel: r.rootLabel, folder: r.folder, files: 0, local: 0, icloud: 0, indexed: 0, bytes: 0 };
    e.files++;
    if (r.storage === 'local') e.local++;
    else e.icloud++;
    if (r.sid) e.indexed++;
    e.bytes += r.size;
    fold.set(k, e);
  }
  return {
    total: lib.rows.length,
    indexed: lib.rows.filter((r) => r.sid).length,
    domains,
    folders: [...fold.values()].sort((a, b) => a.root.localeCompare(b.root) || a.folder.localeCompare(b.folder)),
    kinds: lib.facets.kinds,
  };
}
