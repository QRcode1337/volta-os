import 'server-only';
import type { DocDetail } from '@/components/research/types';
import { getGraph } from './graphs';
import { getLibrary } from './library';
import { publicRow } from './search';
import { readStageBText, type StageARec } from './stagea';
import { mentionsOf, toMention } from './vault';

const stemOf = (name: string) => name.replace(/\.[A-Za-z0-9]{1,6}$/, '');

function stageAPublic(rec: StageARec, matchedBy: 'path' | 'name' | 'none'): NonNullable<DocDetail['stageA']> {
  return {
    sid: rec.sid,
    title: rec.title,
    summary: rec.summary,
    domainTags: rec.domainTags,
    keyClaims: rec.keyClaims,
    methods: rec.methods,
    noveltyScore: rec.novelty,
    crossDomainCount: rec.crossDomainCount,
    crossDomainLinks: rec.crossDomainLinks,
    hasContradiction: rec.hasContradiction,
    contradictionNotes: rec.contradictionNotes,
    confidence: rec.confidence,
    recommendedAction: rec.action,
    sourcePdf: rec.sourcePdf,
    matchedBy,
    stageB: rec.stageB,
  };
}

/** Doc detail by library row id or Stage A id (unmasked: /api/research/doc masks the whole response). Null when unknown; `{building}` is signalled by returning undefined. */
export async function getDoc(id: string): Promise<DocDetail | null | undefined> {
  const lib = await getLibrary();
  if (!lib) return undefined;
  const row = lib.byId.get(id) ?? lib.bySid.get(id);
  if (!row) return null;
  const rec = row.sid ? (lib.stageA.bySid.get(row.sid) ?? null) : null;

  const needles = { title: rec?.title, stem: stemOf(row.name) };
  const notes = rec ? (lib.mentions.get(rec.sid) ?? []) : mentionsOf(lib.vault, needles);
  const vaultNotes = notes.slice(0, 12).map((n) => toMention(n, needles));

  const concepts: DocDetail['concepts'] = [];
  const related = new Map<string, { id: string; title: string; reason: string; score: number }>();
  if (rec) {
    try {
      const g = await getGraph('voltamachine');
      const communities = new Set<number>();
      for (const n of g.nodes) {
        if (n.sid !== rec.sid) continue;
        communities.add(n.community);
        if (concepts.length < 30) concepts.push({ id: n.id, label: n.label, community: n.community, communityName: g.names.get(n.community) ?? '' });
      }
      for (const c of communities) {
        for (const nid of g.members.get(c) ?? []) {
          const sid = g.byId.get(nid)?.sid;
          if (!sid || sid === rec.sid) continue;
          const other = lib.stageA.bySid.get(sid);
          const orow = lib.bySid.get(sid);
          if (!other || !orow) continue;
          const e = related.get(orow.id);
          const reason = `same cluster: ${g.names.get(c) ?? c}`;
          if (e) e.score += 1;
          else related.set(orow.id, { id: orow.id, title: other.title, reason, score: 2 });
        }
      }
    } catch {
      // graph unavailable: tag overlap below still works
    }
    for (const other of lib.stageA.recs) {
      if (other.sid === rec.sid) continue;
      const shared = other.tagKeys.filter((k) => rec.tagKeys.includes(k) && k !== 'science');
      if (shared.length < 2) continue;
      const orow = lib.bySid.get(other.sid);
      if (!orow) continue;
      const labels = shared.slice(0, 3).map((k) => lib.facets.tags.find((f) => f.key === k)?.label ?? k);
      const e = related.get(orow.id);
      if (e) e.score += shared.length;
      else related.set(orow.id, { id: orow.id, title: other.title, reason: `shares ${labels.join(', ')}`, score: shared.length });
    }
  }
  const relatedList = [...related.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ id: rid, title, reason }) => ({ id: rid, title, reason }));

  return {
    row: publicRow(row),
    stageA: rec ? stageAPublic(rec, row.matchedBy) : null,
    stageBText: rec?.stageBText ? await readStageBText(rec.sid) : null,
    vaultNotes,
    concepts,
    related: relatedList,
  };
}
