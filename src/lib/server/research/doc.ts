import 'server-only';
import type { DocDetail, LibraryRow, StageBFacts } from '@/components/research/types';
import { redactSecrets } from '../redact';
import { getGraph } from './graphs';
import { getLibrary, type LibRow } from './library';
import { readStageBText, type StageARec } from './stagea';
import { mentionsOf, toMention } from './vault';

const stemOf = (name: string) => name.replace(/\.[A-Za-z0-9]{1,6}$/, '');
const mask = (s: string) => redactSecrets(s);
const maskAll = (a: string[]) => a.map(mask);

function publicRow(r: LibRow): LibraryRow {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const { nameN, titleN, tagsN, pathN, summaryN, claimsN, tagKeys, matchedBy, sids, ...row } = r;
  /* eslint-enable @typescript-eslint/no-unused-vars */
  return row;
}

function stageBMasked(b: StageBFacts | null): StageBFacts | null {
  if (!b) return null;
  return {
    ...b,
    synthesisSummary: mask(b.synthesisSummary),
    coreInsight: mask(b.coreInsight),
    whyItMatters: mask(b.whyItMatters),
    crossDomainSynthesis: maskAll(b.crossDomainSynthesis),
    testableHypotheses: maskAll(b.testableHypotheses),
    validationPlan: maskAll(b.validationPlan),
  };
}

function stageAMasked(rec: StageARec, matchedBy: 'path' | 'name' | 'none'): NonNullable<DocDetail['stageA']> {
  return {
    sid: rec.sid,
    title: mask(rec.title),
    summary: mask(rec.summary),
    domainTags: rec.domainTags,
    keyClaims: maskAll(rec.keyClaims),
    methods: maskAll(rec.methods),
    noveltyScore: rec.novelty,
    crossDomainCount: rec.crossDomainCount,
    crossDomainLinks: maskAll(rec.crossDomainLinks),
    hasContradiction: rec.hasContradiction,
    contradictionNotes: maskAll(rec.contradictionNotes),
    confidence: rec.confidence,
    recommendedAction: rec.action,
    sourcePdf: rec.sourcePdf,
    matchedBy,
    stageB: stageBMasked(rec.stageB),
  };
}

/** Doc detail by library row id or Stage A id. Null when unknown; `{building}` is signalled by returning undefined. */
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
    .map(({ id: rid, title, reason }) => ({ id: rid, title: mask(title), reason }));

  return {
    row: { ...publicRow(row), title: mask(row.title), summary: row.summary ? mask(row.summary) : null },
    stageA: rec ? stageAMasked(rec, row.matchedBy) : null,
    stageBText: rec?.stageBText ? await readStageBText(rec.sid) : null,
    vaultNotes,
    concepts: concepts.map((c) => ({ ...c, label: mask(c.label) })),
    related: relatedList,
  };
}
