// Types and tiny pure helpers shared by the VOLTA Research server code and the client UI
// (no 'use client', no server-only).

export type Storage = 'local' | 'icloud' | 'external';
export type FileKind = 'pdf' | 'doc' | 'text' | 'sheet' | 'image' | 'audio' | 'video' | 'archive' | 'book' | 'code' | 'other';
export type Action = 'escalate' | 'monitor' | 'archive' | string;

/** One row of the library: an inventory entry, joined to its Voltamachine Stage A record when the paths match. */
export interface LibraryRow {
  id: string;
  root: string;
  rootLabel: string;
  rel: string;
  /** Absolute path (the Voltamachina mirror path for a Stage A record with no file under ~/Documents). */
  path: string;
  name: string;
  /** Stage A title when there is one, else the file name without its extension. */
  title: string;
  folder: string;
  sub: string;
  ext: string;
  kind: FileKind;
  size: number;
  mtime: number;
  storage: Storage;
  /** `brctl download "<path>"` for an iCloud placeholder, else null. Never run by the app. */
  brctl: string | null;
  sid: string | null;
  tags: string[];
  novelty: number | null;
  action: Action | null;
  contradiction: boolean;
  crossDomain: number | null;
  priority: string | null;
  summary: string | null;
  /** A copy of the file under /Volumes/Voltamachina, when Voltamachine recorded one and it is still there. */
  mirror: { path: string; exists: boolean } | null;
  obsidian: string | null;
  vaultNotes: number;
  score?: number;
}

export interface StageBFacts {
  escalated: boolean;
  model: string | null;
  generatedAt: string | null;
  synthesisSummary: string;
  coreInsight: string;
  whyItMatters: string;
  risk: Record<string, string>;
  crossDomainSynthesis: string[];
  testableHypotheses: string[];
  validationPlan: string[];
  priority: string | null;
  publishRecommendation: string | null;
  escalationReason: string | null;
}

export interface VaultMention {
  rel: string;
  title: string;
  folder: string;
  obsidian: string;
  snippet: string;
}

export interface DocDetail {
  row: LibraryRow;
  stageA: null | {
    sid: string;
    title: string;
    summary: string;
    domainTags: string[];
    keyClaims: string[];
    methods: string[];
    noveltyScore: number | null;
    crossDomainCount: number | null;
    crossDomainLinks: string[];
    hasContradiction: boolean;
    contradictionNotes: string[];
    confidence: number | null;
    recommendedAction: string | null;
    sourcePdf: string;
    matchedBy: 'path' | 'name' | 'none';
    stageB: StageBFacts | null;
  };
  /** The *.stageb.md body (secrets masked); null when there is none or it is an empty stub. */
  stageBText: string | null;
  vaultNotes: VaultMention[];
  concepts: { id: string; label: string; community: number; communityName: string }[];
  related: { id: string; title: string; reason: string }[];
}

export interface SearchResponse {
  total: number;
  offset: number;
  limit: number;
  rows: LibraryRow[];
  rerank: 'off' | 'jev' | 'fallback';
  /** Phase 2 hybrid ranking: 'on' when the query was embedded, 'unavailable' when asked for but no index or embedder. */
  semantic: 'off' | 'on' | 'unavailable';
  inventory: InventoryState;
  facets: Facets;
}

export interface FacetCount {
  key: string;
  label: string;
  count: number;
}
export interface Facets {
  roots: FacetCount[];
  /** Top folders per root: key is the folder name. */
  folders: { root: string; key: string; label: string; count: number }[];
  kinds: FacetCount[];
  storage: FacetCount[];
  tags: FacetCount[];
}

export interface InventoryState {
  ready: boolean;
  building: boolean;
  builtAt: string | null;
  durationMs: number | null;
  files: number;
  fromDisk: boolean;
  persisted: boolean;
  persistPath: string;
  persistError: string | null;
  error: string | null;
}

export interface SynthesisItem {
  id: string;
  source: 'vault' | 'erismorn';
  file: string;
  title: string;
  date: string | null;
  kind: 'batch' | 'topic';
  tags: string[];
  papersReviewed: number | null;
  words: number;
  excerpt: string;
  strippedThinking: boolean;
}
export interface SynthesisDetail extends SynthesisItem {
  markdown: string;
  path: string;
  obsidian: string | null;
}

export interface GraphNode {
  id: string;
  label: string;
  c: number;
  deg: number;
  type: string;
  sid?: string;
}
export interface GraphEdge {
  s: string;
  t: string;
  rel: string;
  conf: string;
}
export interface GraphCommunity {
  id: number;
  name: string;
  size: number;
}
export interface GraphData {
  source: string;
  label: string;
  totals: { nodes: number; edges: number; communities: number };
  sampled: { nodes: number; edges: number };
  nodes: GraphNode[];
  edges: GraphEdge[];
  communities: GraphCommunity[];
  report: string | null;
  builtAt: string | null;
}

export interface ThreadMember {
  label: string;
  /** Stage A id, when the member is a Voltamachine paper. */
  sid?: string;
  /** Library row id, when the paper is also in the file inventory. */
  rowId?: string;
  folder?: string;
  novelty?: number | null;
  action?: string | null;
  count: number;
}
export interface ThreadCluster {
  graph: string;
  id: number;
  name: string;
  size: number;
  concepts: string[];
  members: ThreadMember[];
  folders: string[];
  /** Edges that leave the community, i.e. its bridges to other clusters. */
  bridges: number;
}
export interface DomainNode {
  key: string;
  label: string;
  count: number;
  avgNovelty: number;
}
export interface DomainLink {
  a: string;
  b: string;
  weight: number;
  examples: { sid: string; title: string; bridge: string }[];
}
export interface FolderBridge {
  a: string;
  b: string;
  count: number;
  examples: { from: string; to: string; relation: string }[];
}
export interface Highlight {
  sid: string;
  rowId: string | null;
  title: string;
  folder: string;
  novelty: number | null;
  action: string | null;
  contradiction: boolean;
  crossDomain: number | null;
  priority: string | null;
  storage: Storage | null;
  reasons: string[];
  summary: string | null;
  score: number;
}
export interface ThreadsResponse {
  clusters: ThreadCluster[];
  clusterTotals: { graph: string; label: string; communities: number; shown: number }[];
  domainNetwork: { nodes: DomainNode[]; links: DomainLink[] };
  folderBridges: FolderBridge[];
  highlights: Highlight[];
}

export interface StatsResponse {
  total: number;
  indexed: number;
  domains: { key: string; label: string; docs: number; avgNovelty: number; escalate: number; contradictions: number }[];
  folders: { root: string; rootLabel: string; folder: string; files: number; local: number; icloud: number; indexed: number; bytes: number }[];
  kinds: FacetCount[];
}

export interface AgentStatus {
  label: string;
  plist: boolean;
  loaded: boolean;
  state: string | null;
  runs: number | null;
  lastExit: string | null;
  schedule: string;
}
export interface RootCoverage {
  id: string;
  label: string;
  path: string;
  exists: boolean;
  enabled: boolean;
  files: number;
  local: number;
  icloud: number;
  bytes: number;
  indexed: number;
  excluded: string[];
  truncated: boolean;
  /** What voltamachine's own index-status.json says about the same folder. */
  tracked: { tracked: number; indexed: number } | null;
}
export interface StatusResponse {
  generatedAt: string;
  inventory: InventoryState;
  roots: RootCoverage[];
  stageA: { records: number; matchedByPath: number; matchedByName: number; unmatched: number; stageBFull: number; stageBStubs: number; escalate: number; contradictions: number; errors: string[] };
  indexer: {
    agents: AgentStatus[];
    hold: { active: boolean; reason: string | null; envVar: string; at: string | null };
    lastBatch: { n: number | null; at: string | null; processed: number | null; header: string | null };
    processedDocs: number | null;
    stageBFailed: number | null;
    indexStatusAt: string | null;
    voltamachinaMounted: boolean;
  };
  vault: { path: string; exists: boolean; syntheses: number; notesLocal: number; notesIcloud: number; stripped: number };
  graphs: { id: string; label: string; path: string; local: boolean; nodes: number | null; edges: number | null; communities: number | null; mtime: string | null; error: string | null }[];
  catalog: { path: string; local: boolean | null; note: string };
  phase2: Phase2Status;
  warnings: string[];
}

// ───────────────────────── pure helpers ─────────────────────────

export function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GiB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** Lower-case alphanumerics only: "Quantum Physics", "quantum_physics" and "QuantumPhysics" collapse to one key. */
export const normKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

const TAG_ALIASES: Record<string, string> = { cs: 'computerscience', math: 'mathematics', maths: 'mathematics', ml: 'machinelearning', quantum: 'quantumphysics' };
/** Domain-tag key: normKey plus a few abbreviations folded together (cs = computer science, math = mathematics...). */
export const tagKey = (s: string) => {
  const k = normKey(s);
  return TAG_ALIASES[k] ?? k;
};

/** Display label for a tag key: the most common spelling, preferring one that is not an abbreviation of another key. */
export function bestLabel(variants: Map<string, number>, key: string): string {
  const all = [...variants].sort((a, b) => b[1] - a[1]);
  return (all.find(([v]) => normKey(v) === key) ?? all[0])?.[0] ?? key;
}

// ───────────────────────── Phase 2: embeddings ─────────────────────────

export interface Phase2Job {
  running: boolean;
  stage: 'idle' | 'fulltext' | 'text' | 'embed' | 'cluster' | 'label' | 'done' | 'error';
  done: number;
  total: number;
  /** Vectors carried over from the previous index (same id, same text). */
  reused: number;
  embedded: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

export interface Phase2Status {
  built: boolean;
  note: string;
  dir: string;
  embedder: { url: string; model: string; ok: boolean; error: string | null };
  /** LLM router task that names clusters (titles are sent through it). */
  labeler: { task: string; enabled: boolean };
  index: { docs: number; dim: number; model: string; builtAt: string; withSummary: number; withText: number; bytes: number } | null;
  /** Library rows with no vector yet (new since the last build). */
  missing: number;
  clusters: { count: number; named: number; crossFolder: number } | null;
  job: Phase2Job;
}

export interface SemanticMember {
  id: string;
  title: string;
  root: string;
  folder: string;
  storage: Storage;
  novelty: number | null;
  sid: string | null;
  /** Cosine similarity to the cluster centre (clusters) or to the source document (related). */
  sim: number;
}

export interface SemanticCluster {
  id: number;
  /** LLM name when the label pass reached it, else the top terms. */
  name: string;
  named: boolean;
  terms: string[];
  size: number;
  roots: { key: string; label: string; count: number }[];
  folders: { root: string; folder: string; count: number }[];
  /** Effective number of folders (exp of the folder entropy): 1 = one folder, higher = the thread crosses folders. */
  spread: number;
  /** Mean similarity of the members to the centre: low = a grab-bag (odd file names), high = one subject. */
  cohesion: number;
  members: SemanticMember[];
}

export interface SemanticThreadsResponse {
  builtAt: string;
  docs: number;
  clusters: SemanticCluster[];
}

export interface RelatedResponse {
  id: string;
  related: SemanticMember[];
}
