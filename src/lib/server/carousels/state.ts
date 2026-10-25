import 'server-only';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { StudioError, windsorMounted } from '../studio/storage';

// Review state (approvals, comment pins, copy edits, layout switches) lives on the Windsor drive only:
//   /Volumes/Windsor/VOLTA/carousels/state.json
// Nothing is ever written to Notion, and nothing to the boot disk.

export const STATE_DIR = '/Volumes/Windsor/VOLTA/carousels';
export const STATE_FILE = path.join(STATE_DIR, 'state.json');

export type DeckStatus = 'DRAFT' | 'APPROVED' | 'REVISION REQUESTED';
const STATUSES = new Set<string>(['DRAFT', 'APPROVED', 'REVISION REQUESTED']);
const FIELDS = ['kicker', 'headline', 'body'] as const;

export interface StoredPin {
  id: string;
  n: number;
  slideId: string;
  x: number;
  y: number;
  text: string;
}
export interface StoredDeckState {
  status: DeckStatus;
  edits: Record<string, Partial<Record<(typeof FIELDS)[number], string>>>;
  wildcard: Record<string, boolean>;
  pins: StoredPin[];
  /** Fingerprint of the Notion text the review was made against (client-computed). */
  rev?: string;
  updatedAt: string;
}
export interface StateDoc {
  v: 1;
  savedAt: string;
  decks: Record<string, StoredDeckState>;
}

const ID = /^[\w-]{1,80}$/;
const MAX_PINS = 300;
const clamp = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Strict validation: the browser is never trusted to shape what lands on disk. */
export function validateDeckState(raw: unknown): Omit<StoredDeckState, 'updatedAt'> {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof raw !== 'object' || raw === null) throw new StudioError('`state` must be an object.', 400);
  const status = typeof r.status === 'string' && STATUSES.has(r.status) ? (r.status as DeckStatus) : 'DRAFT';
  const edits: StoredDeckState['edits'] = {};
  for (const [slideId, e] of Object.entries((r.edits ?? {}) as Record<string, unknown>)) {
    if (!ID.test(slideId) || typeof e !== 'object' || !e) continue;
    const o: Partial<Record<(typeof FIELDS)[number], string>> = {};
    for (const f of FIELDS) if (typeof (e as Record<string, unknown>)[f] === 'string') o[f] = text((e as Record<string, unknown>)[f], 2000);
    if (Object.keys(o).length) edits[slideId] = o;
  }
  const wildcard: Record<string, boolean> = {};
  for (const [slideId, v] of Object.entries((r.wildcard ?? {}) as Record<string, unknown>)) if (ID.test(slideId) && v === true) wildcard[slideId] = true;
  const rawPins = Array.isArray(r.pins) ? r.pins : [];
  if (rawPins.length > MAX_PINS) throw new StudioError(`Too many pins (max ${MAX_PINS}).`, 413);
  const pins: StoredPin[] = [];
  for (const p of rawPins as Record<string, unknown>[]) {
    const x = clamp(p?.x, 0, 1);
    const y = clamp(p?.y, 0, 1);
    const n = clamp(p?.n, 1, 9999);
    if (typeof p?.id !== 'string' || !ID.test(p.id) || typeof p.slideId !== 'string' || !ID.test(p.slideId) || x === null || y === null || n === null) continue;
    pins.push({ id: p.id, n: Math.round(n), slideId: p.slideId, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, text: text(p.text, 2000) });
  }
  const rev = typeof r.rev === 'string' && /^[\w-]{1,24}$/.test(r.rev) ? r.rev : undefined;
  return { status, edits, wildcard, pins, ...(rev ? { rev } : {}) };
}

const unmounted = 'The Windsor drive is not mounted, so approvals and comments cannot be saved. Plug it in (nothing is written to the boot disk).';

export async function readState(): Promise<{ doc: StateDoc | null; available: boolean; reason: string | null }> {
  if (!(await windsorMounted())) return { doc: null, available: false, reason: unmounted };
  try {
    const j = JSON.parse(await fs.readFile(STATE_FILE, 'utf8')) as StateDoc;
    if (j?.v !== 1 || typeof j.decks !== 'object' || !j.decks) throw new Error('unexpected shape');
    const decks: StateDoc['decks'] = {};
    for (const [id, d] of Object.entries(j.decks)) if (ID.test(id)) decks[id] = { ...validateDeckState(d), updatedAt: typeof d?.updatedAt === 'string' ? d.updatedAt : j.savedAt };
    return { doc: { v: 1, savedAt: j.savedAt, decks }, available: true, reason: null };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { doc: null, available: true, reason: null };
    throw new StudioError(`Saved carousel state is unreadable: ${(err as Error).message}`, 500);
  }
}

let chain: Promise<unknown> = Promise.resolve();

/** Merge one deck's state into the file (read-modify-write, serialised so two quick saves cannot clobber each other). */
export function writeDeckState(deckId: string, raw: unknown): Promise<{ savedAt: string }> {
  if (!ID.test(deckId)) throw new StudioError('Bad deck id.', 400);
  const state = validateDeckState(raw);
  const run = async () => {
    if (!(await windsorMounted())) throw new StudioError(unmounted, 507);
    const cur = (await readState()).doc ?? { v: 1 as const, savedAt: new Date().toISOString(), decks: {} };
    const savedAt = new Date().toISOString();
    cur.decks[deckId] = { ...state, updatedAt: savedAt };
    cur.savedAt = savedAt;
    await fs.mkdir(STATE_DIR, { recursive: true });
    const tmp = path.join(STATE_DIR, `.state.${randomBytes(4).toString('hex')}.tmp`);
    try {
      await fs.writeFile(tmp, `${JSON.stringify(cur, null, 2)}\n`, 'utf8');
      await fs.rename(tmp, STATE_FILE);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw new StudioError(`Could not save: ${(err as Error).message}`, 500);
    }
    return { savedAt };
  };
  const next = chain.then(run, run);
  chain = next.catch(() => undefined);
  return next;
}
