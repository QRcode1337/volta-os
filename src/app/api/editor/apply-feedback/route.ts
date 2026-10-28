// POST /api/editor/apply-feedback — VOLTA Editor "Apply & Teach Locally".
// Derives RL rules from the submitted pins (server-side, never trusting client-written rules) and inserts
// a dated entry under `## Learned Preferences (RL Log)` in skills/cut|animate/SKILL.md inside ./workspace.
// NOTE: those are VOLTA's own WORKSPACE COPY, not the user's live skills in ~/.claude/skills. The compiled prompt
// (Copy All Comments) carries the directive that targets the live skills; the response says so (`scope`).
import { HttpError, route } from '@/lib/server/route-helpers';
import { readWorkspaceFile, writeWorkspaceFile } from '@/lib/server/workspace';
import { RL_HEADING, deriveLesson, insertUnderHeading, lessonMarkdown, type RlPinInput, type TeachSkill } from '@/components/editor/rl-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SKILLS = new Set(['/animate', '/cut', 'audio', '/robo']);
const MAX_PINS = 500;
/** 500 pins × ≤ 2000-char comments plus JSON overhead. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

interface ApplyBody {
  project: string;
  teach: { cut: boolean; animate: boolean };
  pins: RlPinInput[];
}

function validate(raw: unknown): ApplyBody | string {
  if (!raw || typeof raw !== 'object') return 'Body must be a JSON object.';
  const o = raw as Record<string, unknown>;
  const project = typeof o.project === 'string' ? o.project.slice(0, 200) : 'VOLTA Editor';
  const teach = o.teach as Record<string, unknown> | undefined;
  if (!teach || typeof teach.cut !== 'boolean' || typeof teach.animate !== 'boolean') return '`teach` must be { cut: boolean, animate: boolean }.';
  if (!Array.isArray(o.pins)) return '`pins` must be an array.';
  if (o.pins.length > MAX_PINS) return `Too many pins (max ${MAX_PINS}).`;
  const pins: RlPinInput[] = [];
  for (const [i, p] of (o.pins as unknown[]).entries()) {
    const q = p as Record<string, unknown>;
    if (!q || typeof q !== 'object') return `pins[${i}] must be an object.`;
    if (typeof q.number !== 'number' || !Number.isFinite(q.number)) return `pins[${i}].number must be a number.`;
    if (typeof q.timestampSec !== 'number' || !Number.isFinite(q.timestampSec) || q.timestampSec < 0) return `pins[${i}].timestampSec must be a non-negative number.`;
    if (typeof q.skill !== 'string' || !SKILLS.has(q.skill)) return `pins[${i}].skill must be one of ${[...SKILLS].join(', ')}.`;
    if (typeof q.commentText !== 'string' || !q.commentText.trim()) return `pins[${i}].commentText must be a non-empty string.`;
    pins.push({
      number: Math.round(q.number),
      clipNumber: typeof q.clipNumber === 'number' ? Math.round(q.clipNumber) : 0,
      clipTitle: typeof q.clipTitle === 'string' ? q.clipTitle.slice(0, 120).replace(/[\r\n]+/g, ' ') : 'Unknown clip',
      timestampSec: q.timestampSec,
      skill: q.skill,
      commentText: q.commentText.slice(0, 2000).replace(/[\r\n]+/g, ' '),
    });
  }
  return { project: project.replace(/[\r\n]+/g, ' '), teach: { cut: teach.cut, animate: teach.animate }, pins };
}

// Per-file promise chain: concurrent submits read-modify-write the same SKILL.md one after another,
// so neither lesson is lost. The entry is dropped once its tail settles, so the map stays small.
const fileQueues = new Map<string, Promise<unknown>>();

function serialised<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (fileQueues.get(key) ?? Promise.resolve()).then(fn, fn);
  const tail = run.catch(() => undefined);
  fileQueues.set(key, tail);
  void tail.then(() => {
    if (fileQueues.get(key) === tail) fileQueues.delete(key);
  });
  return run;
}

function titleFor(skill: TeachSkill): string {
  return `# ${skill} — SKILL\n\nSkill file managed by VOLTA Agentic OS. VOLTA Editor appends learned preferences below.\n\n${RL_HEADING}\n`;
}

export const POST = route(async ({ body: raw }) => {
  const body = validate(raw);
  if (typeof body === 'string') throw new HttpError(body, 400);
  const wanted: TeachSkill[] = [...(body.teach.animate ? (['/animate'] as const) : []), ...(body.teach.cut ? (['/cut'] as const) : [])];
  if (!wanted.length) throw new HttpError('Enable "Teach my /cut" or "Teach my /animate" first.', 400);

  const date = new Date().toISOString().slice(0, 10);
  const files: { path: string; before: string; after: string }[] = [];
  const skipped: string[] = [];
  try {
    for (const skill of wanted) {
      const lesson = deriveLesson(skill, body.pins);
      if (!lesson) {
        skipped.push(skill);
        continue;
      }
      const { before, after } = await serialised(lesson.file, async () => {
        const existing = await readWorkspaceFile(lesson.file);
        const after = insertUnderHeading(existing ?? titleFor(skill), lessonMarkdown(lesson, date, body.project));
        await writeWorkspaceFile(lesson.file, after);
        return { before: existing ?? '', after };
      });
      files.push({ path: `workspace/${lesson.file}`, before, after });
    }
  } catch (err) {
    throw new HttpError(`Failed to write skill files: ${(err as Error).message}`, 500);
  }
  if (!files.length) throw new HttpError(`No unresolved pins tagged ${skipped.join(' or ')} — nothing to teach.`, 422);
  return {
    files,
    skipped,
    scope: 'workspace-copy',
    note: "Written to VOLTA's ./workspace/skills (a local copy), not to your live ~/.claude/skills.",
  };
}, { json: true, maxBytes: MAX_BODY_BYTES });
