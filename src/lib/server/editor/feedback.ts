import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { EditorClipStatus, EditorEpisodeRef, EditorEpisodeTag, EditorFeedbackDoc, EditorFeedbackResponse, EditorMediaItem, EditorPinRecord, EditorSkillTag } from '@/types/editor';
import { HttpError } from '../http-error';
import { WINDSOR_VOLTA, isWindsorMounted, writeAtomic } from '../storage';
import { parseBinId } from '@/lib/media-ids';

// Per-file review pins live on the Windsor drive, never on the boot disk:
//   <WINDSOR_VOLTA>/editor/feedback/<fileKey>.json   (timestamps are local to the file)

export const FEEDBACK_DIR = path.join(WINDSOR_VOLTA, 'editor', 'feedback');
/** Pins saved per file (one feedback JSON). Apply & Teach takes pins across every open file: see MAX_PINS_PER_APPLY. */
export const MAX_PINS = 300;
/** Apply & Teach submits the unresolved pins of all open files at once, so its cap is an aggregate, not per file. */
export const MAX_PINS_PER_APPLY = 500;
export const SKILLS = new Set<string>(['/animate', '/cut', 'audio', '/robo']);
/** File-local pin time bound (seconds): 0..24 h. */
export const MAX_TIMESTAMP_SEC = 86_400;
const STATUSES = new Set<string>(['NEEDS REVIEW', 'CHANGES REQUESTED', 'APPROVED']);

export function validFileKey(key: unknown): key is string {
  return parseBinId(key) !== null;
}
/** A Studio / Generations / music file id in canonical form (lower-case prefix), else 400. */
export function requireFileKey(key: unknown): string {
  const p = parseBinId(key);
  if (!p) throw new HttpError('Bad file id.', 400);
  return p.id;
}

const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

export function validateStatus(raw: unknown): EditorClipStatus {
  return typeof raw === 'string' && STATUSES.has(raw) ? (raw as EditorClipStatus) : 'NEEDS REVIEW';
}

/** The fields every pin carries, wherever it is submitted (notes save or Apply & Teach). Throws 400 naming `pins[i]`. */
export function validatePin(raw: unknown, i: number): { q: Record<string, unknown>; timestampSec: number; skill: EditorSkillTag; commentText: string } {
  const q = raw as Record<string, unknown>;
  if (!q || typeof q !== 'object') throw new HttpError(`pins[${i}] must be an object.`, 400);
  const ts = num(q.timestampSec, 0, MAX_TIMESTAMP_SEC);
  if (ts === null) throw new HttpError(`pins[${i}].timestampSec must be a number in 0..${MAX_TIMESTAMP_SEC}.`, 400);
  const text = typeof q.commentText === 'string' ? q.commentText.trim() : '';
  if (!text) throw new HttpError(`pins[${i}].commentText must be a non-empty string.`, 400);
  const skill = typeof q.skill === 'string' && SKILLS.has(q.skill) ? (q.skill as EditorSkillTag) : null;
  if (!skill) throw new HttpError(`pins[${i}].skill must be one of ${[...SKILLS].join(', ')}.`, 400);
  return { q, timestampSec: ts, skill, commentText: text.slice(0, 2000) };
}

/** Strict validation: the client is never trusted to shape what lands on disk. */
export function validatePins(raw: unknown): EditorPinRecord[] {
  if (!Array.isArray(raw)) throw new HttpError('`pins` must be an array.', 400);
  if (raw.length > MAX_PINS) throw new HttpError(`Too many pins (max ${MAX_PINS}).`, 413);
  const seen = new Set<string>();
  return raw.map((p, i) => {
    const { q, timestampSec, skill, commentText } = validatePin(p, i);
    const id = typeof q.id === 'string' && /^[\w.-]{1,80}$/.test(q.id) ? q.id : null;
    if (!id || seen.has(id)) throw new HttpError(`pins[${i}].id must be a unique short id.`, 400);
    seen.add(id);
    const x = num(q.xPercent, 0, 100);
    const y = num(q.yPercent, 0, 100);
    if (x === null || y === null) throw new HttpError(`pins[${i}] needs xPercent/yPercent (0..100).`, 400);
    const rec: EditorPinRecord = {
      id,
      number: Math.max(1, Math.min(9999, Math.round(num(q.number, 0, 1e6) ?? i + 1))),
      timestampSec: round(timestampSec),
      xPercent: round(x, 2),
      yPercent: round(y, 2),
      commentText,
      skill,
      resolved: q.resolved === true,
    };
    const r = q.region as Record<string, unknown> | undefined;
    if (r && typeof r === 'object') {
      const rx = num(r.x, 0, 100);
      const ry = num(r.y, 0, 100);
      const rw = num(r.w, 0, 100);
      const rh = num(r.h, 0, 100);
      if (rx !== null && ry !== null && rw !== null && rh !== null) rec.region = { x: round(rx, 2), y: round(ry, 2), w: round(rw, 2), h: round(rh, 2) };
    }
    if (typeof q.scriptLine === 'string' && q.scriptLine.trim()) rec.scriptLine = q.scriptLine.trim().slice(0, 400);
    return rec;
  });
}

const EP_KEY = /^ep\d{1,3}$/;
const NOTION_URL = /^https:\/\/www\.notion\.so\/[0-9a-f]{32}$/;

/** `undefined` = leave the stored tag alone, `null` = clear it, object = tag with this episode (and outline part). */
export function validateEpisodeTag(raw: unknown): EditorEpisodeTag | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const q = raw as Record<string, unknown>;
  if (typeof raw !== 'object' || typeof q.key !== 'string' || !EP_KEY.test(q.key)) throw new HttpError('`episode.key` must look like "ep3".', 400);
  const section = typeof q.section === 'string' && q.section.trim() ? q.section.trim().slice(0, 200) : null;
  return { key: q.key, section };
}

/** A stored episode ref is data from disk: keep only well-formed fields (null when unusable). */
export function sanitizeEpisode(raw: unknown): EditorEpisodeRef | null {
  const q = raw as Record<string, unknown> | null;
  if (!q || typeof q !== 'object' || typeof q.key !== 'string' || !EP_KEY.test(q.key)) return null;
  const str = (v: unknown, max: number) => (typeof v === 'string' && v ? v.slice(0, max) : null);
  const url = (v: unknown) => (typeof v === 'string' && NOTION_URL.test(v) ? v : null);
  return {
    key: q.key,
    number: Number(q.key.slice(2)),
    title: str(q.title, 200) ?? q.key,
    section: str(q.section, 200),
    outlineId: typeof q.outlineId === 'string' && /^[0-9a-f]{32}$/.test(q.outlineId) ? q.outlineId : null,
    outlineTitle: str(q.outlineTitle, 300),
    outlineUrl: url(q.outlineUrl),
    ledgerUrl: url(q.ledgerUrl),
    taggedAt: str(q.taggedAt, 40) ?? new Date(0).toISOString(),
  };
}

const unmounted = 'The Windsor drive is not mounted, so review notes cannot be read or saved. Plug it in (nothing is written to the boot disk).';

export async function readFeedback(rawKey: string): Promise<EditorFeedbackResponse> {
  const fileKey = requireFileKey(rawKey);
  if (!(await isWindsorMounted())) return { doc: null, available: false, reason: unmounted };
  try {
    const text = await fs.readFile(path.join(FEEDBACK_DIR, `${fileKey}.json`), 'utf8');
    const j = JSON.parse(text) as EditorFeedbackDoc;
    if (j?.v !== 1 || j.fileKey !== fileKey || !Array.isArray(j.pins)) throw new Error('unexpected shape');
    return { doc: { ...j, status: validateStatus(j.status), pins: validatePins(j.pins), episode: sanitizeEpisode(j.episode) }, available: true, reason: null };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { doc: null, available: true, reason: null };
    throw new HttpError(`Saved notes for this file are unreadable: ${(err as Error).message}`, 500);
  }
}

export async function writeFeedback(item: EditorMediaItem, pins: EditorPinRecord[], status: EditorClipStatus, episode: EditorEpisodeRef | null = null): Promise<EditorFeedbackDoc> {
  const fileKey = requireFileKey(item.id);
  if (!(await isWindsorMounted())) throw new HttpError(unmounted, 507);
  const doc: EditorFeedbackDoc = {
    v: 1,
    fileKey,
    file: { name: item.name, path: item.path, projectId: item.projectId, projectName: item.groupName, media: item.media, durationSec: item.durationSec, fps: item.fps },
    savedAt: new Date().toISOString(),
    status,
    pins,
    episode,
  };
  try {
    await writeAtomic(path.join(FEEDBACK_DIR, `${fileKey}.json`), `${JSON.stringify(doc, null, 2)}\n`);
  } catch (err) {
    throw new HttpError(`Could not save notes: ${(err as Error).message}`, 500);
  }
  return doc;
}
