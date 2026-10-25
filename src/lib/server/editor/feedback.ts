import 'server-only';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { EditorClipStatus, EditorFeedbackDoc, EditorFeedbackResponse, EditorMediaItem, EditorPinRecord, EditorSkillTag } from '@/types/editor';
import { StudioError, windsorMounted } from '../studio/storage';

// Per-file review pins live on the Windsor drive, never on the boot disk:
//   /Volumes/Windsor/VOLTA/editor/feedback/<fileKey>.json   (timestamps are local to the file)

export const FEEDBACK_DIR = '/Volumes/Windsor/VOLTA/editor/feedback';
const MAX_PINS = 300;
const SKILLS = new Set<string>(['/animate', '/cut', 'audio', '/robo']);
const STATUSES = new Set<string>(['NEEDS REVIEW', 'CHANGES REQUESTED', 'APPROVED']);
const KEY_RE = /^(?:o_[0-9a-f]{16}|g_[a-z0-9-]{6,40})$/i;

export function validFileKey(key: unknown): key is string {
  return typeof key === 'string' && KEY_RE.test(key);
}
export function requireFileKey(key: unknown): string {
  if (!validFileKey(key)) throw new StudioError('Bad file id.', 400);
  return key;
}

const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

export function validateStatus(raw: unknown): EditorClipStatus {
  return typeof raw === 'string' && STATUSES.has(raw) ? (raw as EditorClipStatus) : 'NEEDS REVIEW';
}

/** Strict validation: the client is never trusted to shape what lands on disk. */
export function validatePins(raw: unknown): EditorPinRecord[] {
  if (!Array.isArray(raw)) throw new StudioError('`pins` must be an array.', 400);
  if (raw.length > MAX_PINS) throw new StudioError(`Too many pins (max ${MAX_PINS}).`, 413);
  const seen = new Set<string>();
  return raw.map((p, i) => {
    const q = p as Record<string, unknown>;
    if (!q || typeof q !== 'object') throw new StudioError(`pins[${i}] must be an object.`, 400);
    const id = typeof q.id === 'string' && /^[\w.-]{1,80}$/.test(q.id) ? q.id : null;
    if (!id || seen.has(id)) throw new StudioError(`pins[${i}].id must be a unique short id.`, 400);
    seen.add(id);
    const ts = num(q.timestampSec, 0, 86_400);
    const x = num(q.xPercent, 0, 100);
    const y = num(q.yPercent, 0, 100);
    if (ts === null || x === null || y === null) throw new StudioError(`pins[${i}] needs timestampSec (0..86400) and xPercent/yPercent (0..100).`, 400);
    const text = typeof q.commentText === 'string' ? q.commentText.trim() : '';
    if (!text) throw new StudioError(`pins[${i}].commentText must be a non-empty string.`, 400);
    const skill = typeof q.skill === 'string' && SKILLS.has(q.skill) ? (q.skill as EditorSkillTag) : null;
    if (!skill) throw new StudioError(`pins[${i}].skill must be one of ${[...SKILLS].join(', ')}.`, 400);
    const rec: EditorPinRecord = {
      id,
      number: Math.max(1, Math.min(9999, Math.round(num(q.number, 0, 1e6) ?? i + 1))),
      timestampSec: round(ts),
      xPercent: round(x, 2),
      yPercent: round(y, 2),
      commentText: text.slice(0, 2000),
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

const unmounted = 'The Windsor drive is not mounted, so review notes cannot be read or saved. Plug it in (nothing is written to the boot disk).';

export async function readFeedback(fileKey: string): Promise<EditorFeedbackResponse> {
  requireFileKey(fileKey);
  if (!(await windsorMounted())) return { doc: null, available: false, reason: unmounted };
  try {
    const text = await fs.readFile(path.join(FEEDBACK_DIR, `${fileKey}.json`), 'utf8');
    const j = JSON.parse(text) as EditorFeedbackDoc;
    if (j?.v !== 1 || j.fileKey !== fileKey || !Array.isArray(j.pins)) throw new Error('unexpected shape');
    return { doc: { ...j, status: validateStatus(j.status), pins: validatePins(j.pins) }, available: true, reason: null };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { doc: null, available: true, reason: null };
    throw new StudioError(`Saved notes for this file are unreadable: ${(err as Error).message}`, 500);
  }
}

export async function writeFeedback(item: EditorMediaItem, pins: EditorPinRecord[], status: EditorClipStatus): Promise<EditorFeedbackDoc> {
  const fileKey = requireFileKey(item.id);
  if (!(await windsorMounted())) throw new StudioError(unmounted, 507);
  const doc: EditorFeedbackDoc = {
    v: 1,
    fileKey,
    file: { name: item.name, path: item.path, projectId: item.projectId, projectName: item.groupName, media: item.media, durationSec: item.durationSec, fps: item.fps },
    savedAt: new Date().toISOString(),
    status,
    pins,
  };
  await fs.mkdir(FEEDBACK_DIR, { recursive: true });
  const dest = path.join(FEEDBACK_DIR, `${fileKey}.json`);
  const tmp = path.join(FEEDBACK_DIR, `.${fileKey}.${randomBytes(4).toString('hex')}.tmp`);
  try {
    await fs.writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    await fs.rename(tmp, dest);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw new StudioError(`Could not save notes: ${(err as Error).message}`, 500);
  }
  return doc;
}
