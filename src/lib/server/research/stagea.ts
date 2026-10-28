import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tagKey, type StageBFacts } from '@/components/research/types';
import { cached } from '../sources/cache';
import { mapLimit } from '../proc';
import { loadConfig } from './config';

// Voltamachine Stage A records (stagea/*.json, with Stage B merged in) and the Stage B markdown reports.
// Read-only. Files are small local JSON, so they are read in full; the result is cached for a minute.

const TTL_MS = 60_000;
const STR_CAP = 6000;

export interface StageARec {
  sid: string;
  title: string;
  summary: string;
  domainTags: string[];
  tagKeys: string[];
  keyClaims: string[];
  methods: string[];
  novelty: number | null;
  crossDomainCount: number | null;
  crossDomainLinks: string[];
  hasContradiction: boolean;
  contradictionNotes: string[];
  confidence: number | null;
  action: string | null;
  sourcePdf: string;
  /** Root id and relative path the sourcePdf maps to (mirror prefix or a configured root), when it does. */
  root: string | null;
  rel: string | null;
  stageB: StageBFacts | null;
  /** The *.stageb.md exists and has real content (not an empty stub). */
  stageBText: boolean;
  mtimeMs: number;
}
export interface StageAData {
  recs: StageARec[];
  bySid: Map<string, StageARec>;
  errors: string[];
  stageBFull: number;
  stageBStubs: number;
  loadedAt: number;
}

const s = (v: unknown, cap = STR_CAP): string => (typeof v === 'string' ? v.slice(0, cap) : '');
const sArr = (v: unknown, cap = 40): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, STR_CAP)).slice(0, cap) : []);
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function stageBFrom(v: unknown): StageBFacts | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const risk: Record<string, string> = {};
  if (o.riskAssessment && typeof o.riskAssessment === 'object') for (const [k, val] of Object.entries(o.riskAssessment as Record<string, unknown>)) if (typeof val === 'string') risk[k] = val;
  const strOrNull = (x: unknown) => (typeof x === 'string' && x ? x : null);
  const list = (x: unknown) => (Array.isArray(x) ? x.map((e) => (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, STR_CAP)).slice(0, 30) : []);
  return {
    escalated: o.escalated === true,
    model: strOrNull(o.model),
    generatedAt: strOrNull(o.generatedAt),
    synthesisSummary: s(o.synthesisSummary),
    coreInsight: s(o.coreInsight),
    whyItMatters: s(o.whyItMatters),
    risk,
    crossDomainSynthesis: list(o.crossDomainSynthesis),
    testableHypotheses: list(o.testableHypotheses),
    validationPlan: list(o.validationPlan),
    priority: strOrNull(o.priority),
    publishRecommendation: strOrNull(o.publishRecommendation),
    escalationReason: strOrNull(o.escalationReason),
  };
}

/** A Stage B report whose sections are empty (the model produced nothing) is a stub. */
function stageBHasContent(md: string): boolean {
  const sections = new Map<string, string>();
  for (const part of md.split(/^## /m).slice(1)) {
    const nl = part.indexOf('\n');
    sections.set((nl < 0 ? part : part.slice(0, nl)).trim(), nl < 0 ? '' : part.slice(nl + 1).trim());
  }
  return ['Synthesis Summary', 'Core Insight', 'Why It Matters'].some((k) => (sections.get(k) ?? '').length > 0);
}

/** sourcePdf -> { root, rel } using the mirror prefixes, then each root's own path. */
export function mapSource(sourcePdf: string): { root: string; rel: string } | null {
  const cfg = loadConfig();
  const prefixes = [...cfg.stageA.mirrorPrefixes.map((m) => ({ prefix: m.prefix, root: m.root })), ...cfg.roots.map((r) => ({ prefix: r.path, root: r.id }))];
  for (const p of prefixes) {
    if (sourcePdf.startsWith(p.prefix + path.sep)) return { root: p.root, rel: sourcePdf.slice(p.prefix.length + 1) };
  }
  return null;
}

async function load(): Promise<StageAData> {
  const dir = loadConfig().stageA.dir;
  const errors: string[] = [];
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    errors.push(`Stage A folder unreadable: ${(err as Error).message}`);
  }
  const jsonNames = names.filter((f) => f.endsWith('.json') && !f.startsWith('.'));
  const stageBNames = new Set(names.filter((f) => f.endsWith('.stageb.md')));
  const recs: StageARec[] = [];
  let full = 0;
  let stubs = 0;
  await mapLimit(jsonNames, 16, async (f) => {
    const sid = f.replace(/\.json$/, '');
    try {
      const file = path.join(dir, f);
      const [text, st] = await Promise.all([fs.readFile(file, 'utf8'), fs.stat(file)]);
      const j = JSON.parse(text) as Record<string, unknown>;
      const tags = sArr(j.domainTags, 24);
      const sourcePdf = s(j.sourcePdf, 1024);
      const mapped = mapSource(sourcePdf);
      let hasText = false;
      if (stageBNames.has(`${sid}.stageb.md`)) {
        try {
          hasText = stageBHasContent(await fs.readFile(path.join(dir, `${sid}.stageb.md`), 'utf8'));
        } catch {
          hasText = false;
        }
        if (hasText) full++;
        else stubs++;
      }
      recs.push({
        sid,
        title: s(j.title, 300) || sid,
        summary: s(j.summary),
        domainTags: tags,
        tagKeys: [...new Set(tags.map(tagKey).filter(Boolean))],
        keyClaims: sArr(j.keyClaims),
        methods: sArr(j.methods),
        novelty: n(j.noveltyScore),
        crossDomainCount: n(j.crossDomainCount),
        crossDomainLinks: sArr(j.crossDomainLinks),
        hasContradiction: j.hasContradiction === true,
        contradictionNotes: sArr(j.contradictionNotes),
        confidence: n(j.confidence),
        action: s(j.recommendedAction, 40) || null,
        sourcePdf,
        root: mapped?.root ?? null,
        rel: mapped?.rel ?? null,
        stageB: stageBFrom(j.stageB),
        stageBText: hasText,
        mtimeMs: st.mtimeMs,
      });
    } catch (err) {
      errors.push(`${f}: ${(err as Error).message}`);
    }
  });
  recs.sort((a, b) => a.sid.localeCompare(b.sid));
  return { recs, bySid: new Map(recs.map((r) => [r.sid, r])), errors, stageBFull: full, stageBStubs: stubs, loadedAt: Date.now() };
}

export const getStageA = (force = false) => cached<StageAData>('research:stagea', TTL_MS, load, { force });

/** The Stage B markdown report for one record (masked by /api/research/doc, not here), or null when there is none or it is an empty stub. */
export async function readStageBText(sid: string): Promise<string | null> {
  if (!/^[\w.-]{1,80}$/.test(sid)) return null;
  const file = path.join(loadConfig().stageA.dir, `${sid}.stageb.md`);
  try {
    const t = await fs.readFile(file, 'utf8');
    if (!stageBHasContent(t)) return null;
    return t.slice(0, 80_000);
  } catch {
    return null;
  }
}
