import 'server-only';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Phase2Job, Phase2Status, RelatedResponse, SemanticCluster, SemanticMember, SemanticThreadsResponse } from '@/components/research/types';
import { HttpError } from '../http-error';
import { complete } from '../llm';
import { redactSecrets } from '../redact';
import { cached } from '../sources/cache';
import { requireWindsor, writeAtomic } from '@/lib/server/storage';
import { loadConfig } from './config';
import { getLibrary, type Library, type LibRow } from './library';

// Phase 2: an embedding index of the whole library, on Windsor.
//   * One vector per library row. The text is what is already on this Mac: title, folder path, Stage A tags, summary
//     and claims, plus the head of a local md/txt file. iCloud placeholders are never opened, so nothing downloads.
//   * Vectors come from any OpenAI-compatible /v1/embeddings server (Ollama nomic-embed-text by default). A rebuild
//     re-embeds only rows whose text changed.
//   * Spherical k-means groups the vectors into threads; terms label them at once, then the LLM router (task
//     "quick": local first, then OmniRoute) names them from their top titles, a dozen clusters per call.
//   * Search mixes cosine similarity into the lexical score; a document's nearest neighbours are its related reading.
// Files: meta.json (ids, text hashes), vectors.f32 (n x dim, L2-normalised), clusters.json (assignments, names).

const VERSION = 1;
const BATCH = 64;
const EMBED_TIMEOUT_MS = 120_000;
const QUERY_TIMEOUT_MS = 8000;
const LABEL_TIMEOUT_MS = 120_000;
const LABEL_BATCH = 12;
const MAX_DOC_CHARS = 2000;
const MEMBERS_SHOWN = 30;
const DOC_PREFIX = 'search_document: ';
const QUERY_PREFIX = 'search_query: ';

interface Meta {
  version: number;
  model: string;
  dim: number;
  builtAt: number;
  ids: string[];
  hashes: string[];
  withSummary: number;
  withText: number;
}
interface Index extends Meta {
  vecs: Float32Array;
  pos: Map<string, number>;
  bytes: number;
}
interface ClusterFile {
  version: number;
  builtAt: number;
  indexBuiltAt: number;
  k: number;
  /** cluster id per index position */
  assign: number[];
  clusters: { id: number; terms: string[]; name: string | null }[];
}

const idleJob = (): Phase2Job => ({ running: false, stage: 'idle', done: 0, total: 0, reused: 0, embedded: 0, startedAt: null, finishedAt: null, error: null });
const g = globalThis as unknown as { __voltaResearchP2?: { job: Phase2Job; running: Promise<void> | null; index: { mtimeMs: number; idx: Index } | null; queries: Map<string, Float32Array> } };
const S = (g.__voltaResearchP2 ??= { job: idleJob(), running: null, index: null, queries: new Map() });

const files = () => {
  const dir = loadConfig().phase2.dir;
  return { dir, meta: path.join(dir, 'meta.json'), vecs: path.join(dir, 'vectors.f32'), clusters: path.join(dir, 'clusters.json') };
};
const readJson = async <T,>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
};
const yieldLoop = () => new Promise<void>((r) => setImmediate(r));

// ───────────────────────── index on disk ─────────────────────────

export async function loadIndex(): Promise<Index | null> {
  const f = files();
  const st = await fs.stat(f.meta).catch(() => null);
  if (!st) return null;
  if (S.index && S.index.mtimeMs === st.mtimeMs) return S.index.idx;
  const meta = await readJson<Meta>(f.meta);
  if (!meta || meta.version !== VERSION) return null;
  const buf = await fs.readFile(f.vecs).catch(() => null);
  if (!buf || buf.byteLength !== meta.ids.length * meta.dim * 4) return null;
  const vecs = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const idx: Index = { ...meta, vecs, pos: new Map(meta.ids.map((id, i) => [id, i])), bytes: buf.byteLength };
  S.index = { mtimeMs: st.mtimeMs, idx };
  return idx;
}

const loadClusters = async (idx: Index): Promise<ClusterFile | null> => {
  const c = await readJson<ClusterFile>(files().clusters);
  return c && c.version === VERSION && c.indexBuiltAt === idx.builtAt && c.assign.length === idx.ids.length ? c : null;
};

// ───────────────────────── embedding server ─────────────────────────

function normalise(v: number[] | Float32Array): Float32Array {
  const out = Float32Array.from(v);
  let n = 0;
  for (let i = 0; i < out.length; i++) n += out[i] * out[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= n;
  return out;
}

async function embed(texts: string[], timeoutMs: number): Promise<Float32Array[]> {
  const { embedUrl, embedModel } = loadConfig().phase2;
  const res = await fetch(`${embedUrl}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: embedModel, input: texts }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${embedUrl}/v1/embeddings answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { data?: { index?: number; embedding?: number[] }[] };
  const data = [...(j.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (data.length !== texts.length || data.some((d) => !Array.isArray(d.embedding) || !d.embedding.length)) throw new Error(`${embedModel} returned ${data.length} vectors for ${texts.length} texts.`);
  return data.map((d) => normalise(d.embedding!));
}

const embedderHealth = () =>
  cached('research:p2:embedder', 30_000, async (): Promise<Phase2Status['embedder']> => {
    const { embedUrl, embedModel } = loadConfig().phase2;
    const out = { url: embedUrl, model: embedModel, ok: false, error: null as string | null };
    try {
      const res = await fetch(`${embedUrl}/v1/models`, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return { ...out, error: `${embedUrl}/v1/models answered ${res.status}` };
      const ids = (((await res.json()) as { data?: { id?: string }[] }).data ?? []).map((m) => m.id ?? '');
      const has = ids.some((id) => id === embedModel || id.split(':')[0] === embedModel || id.includes(embedModel));
      return has ? { ...out, ok: true } : { ...out, error: `${embedModel} is not loaded on ${embedUrl} (has ${ids.slice(0, 6).join(', ') || 'no models'}).` };
    } catch (err) {
      return { ...out, error: `${embedUrl} is not answering (${(err as Error).message}).` };
    }
  });

/** The query as a unit vector, or null when the embedder is down. Recent queries are memoised. */
export async function embedQuery(q: string): Promise<Float32Array | null> {
  const key = q.trim().toLowerCase();
  const hit = S.queries.get(key);
  if (hit) return hit;
  try {
    const [v] = await embed([`${QUERY_PREFIX}${q.trim()}`], QUERY_TIMEOUT_MS);
    if (S.queries.size > 64) S.queries.delete(S.queries.keys().next().value!);
    S.queries.set(key, v);
    return v;
  } catch {
    return null;
  }
}

const dot = (a: Float32Array, b: Float32Array, off: number, dim: number) => {
  let s = 0;
  for (let i = 0; i < dim; i++) s += a[i] * b[off + i];
  return s;
};

/** Cosine similarity of `qv` to every indexed row, keyed by row id (empty when there is no index or the dims differ). */
export async function similarities(qv: Float32Array): Promise<Map<string, number>> {
  const idx = await loadIndex();
  const out = new Map<string, number>();
  if (!idx || idx.dim !== qv.length) return out;
  for (let i = 0; i < idx.ids.length; i++) out.set(idx.ids[i], dot(qv, idx.vecs, i * idx.dim, idx.dim));
  return out;
}

// ───────────────────────── document text ─────────────────────────

const nicePath = (r: LibRow) => [r.rootLabel, ...r.rel.split('/').slice(0, -1)].map((s) => s.replace(/^\d+[-_ ]/, '').replace(/_/g, ' ')).join(' / ');

async function localHead(r: LibRow, chars: number): Promise<string> {
  if (!chars || r.storage !== 'local' || r.kind !== 'text' || r.size > 4 * 1024 * 1024) return '';
  let fh: fs.FileHandle | null = null;
  try {
    fh = await fs.open(r.path, 'r');
    const buf = Buffer.alloc(chars * 2);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    return buf
      .subarray(0, bytesRead)
      .toString('utf8')
      .replace(/^---[\s\S]*?\n---\n/, '')
      .replace(/\s+/g, ' ')
      .slice(0, chars);
  } catch {
    return '';
  } finally {
    await fh?.close();
  }
}

async function docTexts(lib: Library, onProgress: (n: number) => void): Promise<{ texts: string[]; withSummary: number; withText: number }> {
  const chars = loadConfig().phase2.localTextChars;
  const texts = new Array<string>(lib.rows.length);
  let withSummary = 0;
  let withText = 0;
  let done = 0;
  const CONC = 8;
  let next = 0;
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (next < lib.rows.length) {
        const i = next++;
        const r = lib.rows[i];
        const rec = r.sid ? lib.stageA.bySid.get(r.sid) : undefined;
        const head = await localHead(r, chars);
        if (rec?.summary) withSummary++;
        if (head) withText++;
        const parts = [
          r.title,
          r.title !== r.name ? r.name.replace(/\.[A-Za-z0-9]{1,6}$/, '').replace(/[_-]+/g, ' ') : '',
          nicePath(r),
          r.tags.length ? `Topics: ${r.tags.join(', ')}` : '',
          rec?.summary ?? '',
          rec ? [...rec.keyClaims.slice(0, 4), ...rec.crossDomainLinks.slice(0, 2)].join(' ') : '',
          head,
        ];
        texts[i] = `${DOC_PREFIX}${parts.filter(Boolean).join('\n')}`.slice(0, MAX_DOC_CHARS);
        if (++done % 250 === 0) onProgress(done);
      }
    }),
  );
  onProgress(done);
  return { texts, withSummary, withText };
}

// ───────────────────────── clustering ─────────────────────────

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Spherical k-means (k-means++ seeding, fixed seed). Yields to the event loop every chunk so the server stays responsive. */
async function kmeans(vecs: Float32Array, n: number, dim: number, k: number): Promise<number[]> {
  const rand = mulberry32(1337);
  const cent = new Float32Array(k * dim);
  const best = new Float32Array(n).fill(-Infinity);
  // k-means++ on cosine distance (1 - sim)
  let first = Math.floor(rand() * n);
  cent.set(vecs.subarray(first * dim, first * dim + dim), 0);
  for (let c = 1; c < k; c++) {
    let total = 0;
    const d = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const s = dot(cent.subarray((c - 1) * dim, c * dim), vecs, i * dim, dim);
      if (s > best[i]) best[i] = s;
      d[i] = Math.max(0, 1 - best[i]) ** 2;
      total += d[i];
    }
    let r = rand() * total;
    first = n - 1;
    for (let i = 0; i < n; i++) if ((r -= d[i]) <= 0) {
      first = i;
      break;
    }
    cent.set(vecs.subarray(first * dim, first * dim + dim), c * dim);
    if (c % 8 === 0) await yieldLoop();
  }
  const assign = new Int32Array(n).fill(-1);
  for (let iter = 0; iter < 25; iter++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      let bc = 0;
      let bs = -Infinity;
      for (let c = 0; c < k; c++) {
        let s = 0;
        const co = c * dim;
        const vo = i * dim;
        for (let j = 0; j < dim; j++) s += cent[co + j] * vecs[vo + j];
        if (s > bs) {
          bs = s;
          bc = c;
        }
      }
      if (assign[i] !== bc) {
        assign[i] = bc;
        moved++;
      }
      if (i % 1500 === 0) await yieldLoop();
    }
    cent.fill(0);
    const counts = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      const co = assign[i] * dim;
      counts[assign[i]]++;
      for (let j = 0; j < dim; j++) cent[co + j] += vecs[i * dim + j];
    }
    for (let c = 0; c < k; c++) {
      if (!counts[c]) {
        // empty cluster: reseed on a random point
        const p = Math.floor(rand() * n);
        cent.set(vecs.subarray(p * dim, p * dim + dim), c * dim);
        continue;
      }
      cent.set(normalise(cent.subarray(c * dim, c * dim + dim)), c * dim);
    }
    if (moved <= n * 0.002) break;
  }
  return [...assign];
}

const STOP = new Set(
  'the and for with from into that this are was were been being have has had not but its their our your his her they them than then also via using use used based towards toward about over under between within without among new study analysis paper report notes note draft copy final file files part chapter vol volume edition pdf doc docx txt md html www http https com org edu net what when where which who how why can may will one two three more most all any some such other each per etc'.split(' '),
);
const termsOf = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));

/** c-TF-IDF: words frequent in a cluster's titles, tags and folders but rare across clusters. */
function clusterTerms(lib: Library, idx: Index, assign: number[], k: number): string[][] {
  const tf = Array.from({ length: k }, () => new Map<string, number>());
  const df = new Map<string, number>();
  for (let i = 0; i < idx.ids.length; i++) {
    const r = lib.byId.get(idx.ids[i]);
    if (!r) continue;
    const words = new Set([...termsOf(r.title), ...r.tags.flatMap(termsOf), ...termsOf(r.sub.replace(/^\d+[-_ ]/, ''))]);
    const m = tf[assign[i]];
    for (const w of words) m.set(w, (m.get(w) ?? 0) + 1);
  }
  for (const m of tf) for (const w of m.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  return tf.map((m) =>
    [...m]
      .filter(([, c]) => c >= 2)
      .map(([w, c]) => [w, c * Math.log(1 + k / (df.get(w) ?? 1))] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([w]) => w),
  );
}

/** Names for a batch of clusters in one LLM call: {"<id>": "<name>"}. Titles are secret-masked first. */
async function nameClusters(batch: { id: number; terms: string[]; titles: string[] }[]): Promise<Map<number, string>> {
  const { labelTask } = loadConfig().phase2;
  const out = new Map<number, string>();
  if (!labelTask) return out;
  const blocks = batch.map((c) => `Group ${c.id}\nKey terms: ${c.terms.join(', ')}\nTitles:\n${c.titles.map((t) => `- ${t.slice(0, 120)}`).join('\n')}`).join('\n\n');
  const res = await complete({
    task: labelTask,
    maxTokens: 900,
    temperature: 0.2,
    timeoutMs: LABEL_TIMEOUT_MS,
    messages: [
      { role: 'system', content: 'You name groups of research documents. Each group was formed by meaning. Give each a specific topic name of 2 to 5 words (no quotes, no numbering). If a group is only file noise (hashes, templates, screenshots), name what it is, e.g. "Image and screenshot dumps".' },
      { role: 'user', content: `${redactSecrets(blocks)}\n\nReply with JSON only, one key per group id: {"<id>": "<name>", ...}` },
    ],
  });
  const json = /\{[\s\S]*\}/.exec(res.text.replace(/<think>[\s\S]*?<\/think>/g, ''))?.[0];
  if (!json) throw new Error(`${res.route.target} replied without JSON.`);
  for (const [k, v] of Object.entries(JSON.parse(json) as Record<string, unknown>)) {
    const id = Number(k);
    const name = typeof v === 'string' ? v.replace(/^["'*`]+|["'*`.]+$/g, '').trim() : '';
    if (Number.isInteger(id) && name && name.length <= 60) out.set(id, name);
  }
  return out;
}

// ───────────────────────── build job ─────────────────────────

function bump(patch: Partial<Phase2Job>) {
  S.job = { ...S.job, ...patch };
}

async function buildIndex(lib: Library): Promise<Index> {
  const cfg = loadConfig().phase2;
  const f = files();
  bump({ stage: 'text', done: 0, total: lib.rows.length });
  const { texts, withSummary, withText } = await docTexts(lib, (n) => bump({ done: n }));
  const hashes = texts.map((t) => createHash('sha1').update(`${cfg.embedModel}\0${t}`).digest('hex').slice(0, 16));
  const ids = lib.rows.map((r) => r.id);

  const prev = await loadIndex();
  const reuse = prev && prev.model === cfg.embedModel ? prev : null;
  const out: (Float32Array | null)[] = ids.map((id, i) => {
    const p = reuse?.pos.get(id);
    return p !== undefined && reuse!.hashes[p] === hashes[i] ? reuse!.vecs.subarray(p * reuse!.dim, (p + 1) * reuse!.dim) : null;
  });
  const todo = out.flatMap((v, i) => (v ? [] : [i]));
  bump({ stage: 'embed', done: 0, total: todo.length, reused: ids.length - todo.length, embedded: 0 });
  for (let b = 0; b < todo.length; b += BATCH) {
    const slice = todo.slice(b, b + BATCH);
    const vs = await embed(slice.map((i) => texts[i]), EMBED_TIMEOUT_MS);
    slice.forEach((i, j) => (out[i] = vs[j]));
    bump({ done: Math.min(todo.length, b + BATCH), embedded: Math.min(todo.length, b + BATCH) });
  }
  const dim = out.find((v) => v)?.length ?? 0;
  if (!dim) throw new Error('No vectors: the library is empty.');
  if (out.some((v) => v!.length !== dim)) throw new Error('Mixed vector sizes: the embedding model changed during the build. Run it again.');
  const vecs = new Float32Array(ids.length * dim);
  out.forEach((v, i) => vecs.set(v!, i * dim));

  await fs.mkdir(f.dir, { recursive: true });
  await writeAtomic(f.vecs, new Uint8Array(vecs.buffer));
  const meta: Meta = { version: VERSION, model: cfg.embedModel, dim, builtAt: Date.now(), ids, hashes, withSummary, withText };
  await writeAtomic(f.meta, JSON.stringify(meta));
  S.index = null;
  return (await loadIndex())!;
}

async function buildClusters(lib: Library, idx: Index): Promise<ClusterFile> {
  bump({ stage: 'cluster', done: 0, total: 1 });
  const n = idx.ids.length;
  const k = Math.max(6, Math.min(48, Math.round(Math.sqrt(n / 3))));
  const assign = await kmeans(idx.vecs, n, idx.dim, k);
  const terms = clusterTerms(lib, idx, assign, k);
  const prev = await readJson<ClusterFile>(files().clusters);
  // keep an LLM name when the cluster's terms did not change (an incremental rebuild with few new files)
  const prevNames = new Map((prev?.clusters ?? []).filter((c) => c.name).map((c) => [c.terms.join('|'), c.name]));
  const cf: ClusterFile = {
    version: VERSION,
    builtAt: Date.now(),
    indexBuiltAt: idx.builtAt,
    k,
    assign,
    clusters: terms.map((t, id) => ({ id, terms: t, name: prevNames.get(t.join('|')) ?? null })),
  };
  await writeAtomic(files().clusters, JSON.stringify(cf));
  bump({ done: 1 });
  return cf;
}

async function labelClusters(lib: Library, idx: Index, cf: ClusterFile): Promise<void> {
  if (!loadConfig().phase2.labelTask) return;
  const sizes = new Map<number, number>();
  cf.assign.forEach((c) => sizes.set(c, (sizes.get(c) ?? 0) + 1));
  const order = cf.clusters.filter((c) => !c.name && (sizes.get(c.id) ?? 0) > 0).sort((a, b) => (sizes.get(b.id) ?? 0) - (sizes.get(a.id) ?? 0));
  bump({ stage: 'label', done: 0, total: order.length });
  let failures = 0;
  for (let i = 0; i < order.length; i += LABEL_BATCH) {
    const batch = order.slice(i, i + LABEL_BATCH);
    try {
      const names = await nameClusters(batch.map((c) => ({ id: c.id, terms: c.terms, titles: clusterMembers(lib, idx, cf, c.id).slice(0, 8).map((m) => m.title) })));
      for (const c of batch) c.name = names.get(c.id) ?? c.name;
      failures = 0;
      await writeAtomic(files().clusters, JSON.stringify(cf));
    } catch (err) {
      if (++failures >= 2) {
        bump({ error: `Cluster naming stopped (${(err as Error).message}); the rest keep their term labels. Try Name clusters again later.` });
        break;
      }
    }
    bump({ done: Math.min(order.length, i + LABEL_BATCH) });
  }
}

/** Start a build (or just the naming pass) in the background. A running job is left alone. */
export async function startPhase2(action: 'build' | 'label'): Promise<Phase2Status> {
  if (S.running) return phase2Status();
  await requireWindsor('the Phase 2 embedding index');
  const lib = await getLibrary({ waitMs: 25_000 });
  if (!lib) throw new HttpError('The file inventory is still being built; try again in a moment.', 409);
  if (action === 'label') {
    const idx = await loadIndex();
    const cf = idx && (await loadClusters(idx));
    if (!idx || !cf) throw new HttpError('There is no Phase 2 index to name yet. Build it first.', 409);
  } else {
    const h = await embedderHealth();
    if (!h.ok) throw new HttpError(`Embedding server unavailable: ${h.error}`, 503);
  }
  S.job = { ...idleJob(), running: true, stage: 'text', startedAt: new Date().toISOString() };
  S.running = (async () => {
    try {
      let idx = await loadIndex();
      let cf = idx && (await loadClusters(idx));
      if (action === 'build') {
        idx = await buildIndex(lib);
        cf = await buildClusters(lib, idx);
      }
      await labelClusters(lib, idx!, cf!);
      bump({ running: false, stage: 'done', finishedAt: new Date().toISOString() });
    } catch (err) {
      bump({ running: false, stage: 'error', error: (err as Error).message, finishedAt: new Date().toISOString() });
    } finally {
      S.running = null;
    }
  })();
  return phase2Status();
}

// ───────────────────────── reads ─────────────────────────

function member(lib: Library, id: string, sim: number): SemanticMember | null {
  const r = lib.byId.get(id);
  if (!r) return null;
  return { id: r.id, title: r.title, root: r.root, folder: r.folder, storage: r.storage, novelty: r.novelty, sid: r.sid, sim: Math.round(sim * 1000) / 1000 };
}

function clusterMembers(lib: Library, idx: Index, cf: ClusterFile, cid: number): SemanticMember[] {
  const dim = idx.dim;
  const at: number[] = [];
  const cent = new Float32Array(dim);
  cf.assign.forEach((c, i) => {
    if (c !== cid) return;
    at.push(i);
    for (let j = 0; j < dim; j++) cent[j] += idx.vecs[i * dim + j];
  });
  const cn = normalise(cent);
  return at
    .map((i) => member(lib, idx.ids[i], dot(cn, idx.vecs, i * dim, dim)))
    .filter((m): m is SemanticMember => !!m)
    .sort((a, b) => b.sim - a.sim);
}

export async function semanticThreads(): Promise<SemanticThreadsResponse | null> {
  const [lib, idx] = await Promise.all([getLibrary(), loadIndex()]);
  if (!lib || !idx) return null;
  const cf = await loadClusters(idx);
  if (!cf) return null;
  const clusters: SemanticCluster[] = cf.clusters
    .map((c) => {
      const all = clusterMembers(lib, idx, cf, c.id);
      const folderAgg = new Map<string, { root: string; folder: string; count: number }>();
      const rootAgg = new Map<string, number>();
      for (const m of all) {
        const k = `${m.root}\0${m.folder}`;
        const e = folderAgg.get(k) ?? { root: m.root, folder: m.folder, count: 0 };
        e.count++;
        folderAgg.set(k, e);
        rootAgg.set(m.root, (rootAgg.get(m.root) ?? 0) + 1);
      }
      let h = 0;
      for (const e of folderAgg.values()) {
        const p = e.count / (all.length || 1);
        h -= p * Math.log(p);
      }
      return {
        id: c.id,
        name: c.name ?? (c.terms.length ? c.terms.slice(0, 3).join(' · ') : 'Untitled files'),
        named: !!c.name,
        terms: c.terms,
        size: all.length,
        roots: [...rootAgg].map(([key, count]) => ({ key, label: lib.rootLabels.get(key) ?? key, count })).sort((a, b) => b.count - a.count),
        folders: [...folderAgg.values()].sort((a, b) => b.count - a.count).slice(0, 12),
        spread: Math.round(Math.exp(h) * 10) / 10,
        cohesion: Math.round((all.reduce((a, m) => a + m.sim, 0) / (all.length || 1)) * 1000) / 1000,
        members: all.slice(0, MEMBERS_SHOWN),
      };
    })
    .filter((c) => c.size > 0);
  return { builtAt: new Date(cf.builtAt).toISOString(), docs: idx.ids.length, clusters };
}

/** The `n` nearest documents to row `id`. */
export async function related(id: string, n = 12): Promise<RelatedResponse> {
  const [lib, idx] = await Promise.all([getLibrary(), loadIndex()]);
  if (!lib || !idx) throw new HttpError('The Phase 2 index is not built yet.', 409);
  const p = idx.pos.get(id);
  if (p === undefined) throw new HttpError('This document is not in the Phase 2 index yet (added since the last build).', 404);
  const qv = idx.vecs.subarray(p * idx.dim, (p + 1) * idx.dim);
  const top: { i: number; s: number }[] = [];
  for (let i = 0; i < idx.ids.length; i++) {
    if (i === p) continue;
    const s = dot(qv, idx.vecs, i * idx.dim, idx.dim);
    if (top.length < n) {
      top.push({ i, s });
      top.sort((a, b) => b.s - a.s);
    } else if (s > top[n - 1].s) {
      top[n - 1] = { i, s };
      top.sort((a, b) => b.s - a.s);
    }
  }
  return { id, related: top.map((t) => member(lib, idx.ids[t.i], t.s)).filter((m): m is SemanticMember => !!m) };
}

export async function phase2Status(): Promise<Phase2Status> {
  const cfg = loadConfig().phase2;
  const [embedder, idx, lib] = await Promise.all([embedderHealth(), loadIndex(), getLibrary({ waitMs: 0 })]);
  const cf = idx ? await loadClusters(idx) : null;
  let crossFolder = 0;
  if (cf && idx) {
    const folders = new Map<number, Set<string>>();
    cf.assign.forEach((c, i) => {
      const r = lib?.byId.get(idx.ids[i]);
      if (r) (folders.get(c) ?? folders.set(c, new Set()).get(c)!).add(`${r.root}/${r.folder}`);
    });
    crossFolder = [...folders.values()].filter((s) => s.size >= 3).length;
  }
  const missing = lib && idx ? lib.rows.filter((r) => !idx.pos.has(r.id)).length : (lib?.rows.length ?? 0);
  const built = !!idx;
  const note = built
    ? `Semantic search and threads are on: ${idx.ids.length.toLocaleString()} documents embedded with ${idx.model} (${idx.withSummary.toLocaleString()} with Stage A summaries, ${idx.withText.toLocaleString()} with local text; the rest by title and folder). Nothing was downloaded from iCloud.`
    : 'Not built yet. Build embeds every library row from what is already on this Mac (titles, folders, Stage A summaries, local md/txt) into Windsor. Nothing is downloaded from iCloud.';
  return {
    built,
    note,
    dir: cfg.dir,
    embedder,
    labeler: { task: cfg.labelTask, enabled: !!cfg.labelTask },
    index: idx ? { docs: idx.ids.length, dim: idx.dim, model: idx.model, builtAt: new Date(idx.builtAt).toISOString(), withSummary: idx.withSummary, withText: idx.withText, bytes: idx.bytes } : null,
    missing,
    clusters: cf ? { count: cf.clusters.length, named: cf.clusters.filter((c) => c.name).length, crossFolder } : null,
    job: S.job,
  };
}
