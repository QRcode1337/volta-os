// POST /api/editor/apply-feedback — VOLTA Editor "Apply & Teach Locally".
// Derives RL rules from the submitted pins (server-side, never trusting client-written rules) and inserts
// a dated entry under `## Learned Preferences (RL Log)` in skills/cut|animate/SKILL.md inside ./workspace.
// NOTE: those are VOLTA's own WORKSPACE COPY, not the user's live skills in ~/.claude/skills. The compiled prompt
// (Copy All Comments) carries the directive that targets the live skills; the response says so (`scope`).
import { HttpError, route } from '@/lib/server/route-helpers';
import { serialised } from '@/lib/server/storage';
import { readWorkspaceFile, resolveWorkspacePath, writeWorkspaceFile } from '@/lib/server/workspace';
import { MAX_PINS_PER_APPLY, validatePin } from '@/lib/server/editor/feedback';
import { RL_HEADING, deriveLesson, insertUnderHeading, lessonMarkdown, type RlPinInput, type TeachSkill } from '@/components/editor/rl-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** MAX_PINS_PER_APPLY pins × ≤ 2000-char comments plus JSON overhead. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

interface ApplyBody {
  project: string;
  teach: { cut: boolean; animate: boolean };
  pins: RlPinInput[];
}

/** Pins here span every open file (timestamps stay file-local), so the cap is the aggregate MAX_PINS_PER_APPLY, not the per-file MAX_PINS. */
function validate(raw: unknown): ApplyBody {
  if (!raw || typeof raw !== 'object') throw new HttpError('Body must be a JSON object.', 400);
  const o = raw as Record<string, unknown>;
  const project = typeof o.project === 'string' ? o.project.slice(0, 200) : 'VOLTA Editor';
  const teach = o.teach as Record<string, unknown> | undefined;
  if (!teach || typeof teach.cut !== 'boolean' || typeof teach.animate !== 'boolean') throw new HttpError('`teach` must be { cut: boolean, animate: boolean }.', 400);
  if (!Array.isArray(o.pins)) throw new HttpError('`pins` must be an array.', 400);
  if (o.pins.length > MAX_PINS_PER_APPLY) throw new HttpError(`Too many pins (max ${MAX_PINS_PER_APPLY}).`, 400);
  const pins = (o.pins as unknown[]).map((p, i): RlPinInput => {
    const { q, timestampSec, skill, commentText } = validatePin(p, i);
    if (typeof q.number !== 'number' || !Number.isFinite(q.number)) throw new HttpError(`pins[${i}].number must be a number.`, 400);
    return {
      number: Math.round(q.number),
      clipNumber: typeof q.clipNumber === 'number' ? Math.round(q.clipNumber) : 0,
      clipTitle: typeof q.clipTitle === 'string' ? q.clipTitle.slice(0, 120).replace(/[\r\n]+/g, ' ') : 'Unknown clip',
      timestampSec,
      skill,
      commentText: commentText.replace(/[\r\n]+/g, ' '),
    };
  });
  return { project: project.replace(/[\r\n]+/g, ' '), teach: { cut: teach.cut, animate: teach.animate }, pins };
}

function titleFor(skill: TeachSkill): string {
  return `# ${skill} — SKILL\n\nSkill file managed by VOLTA Agentic OS. VOLTA Editor appends learned preferences below.\n\n${RL_HEADING}\n`;
}

export const POST = route(async ({ body: raw }) => {
  const body = validate(raw);
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
      // Serialised per file: concurrent submits read-modify-write the same SKILL.md one after another, so no lesson is lost.
      const { before, after } = await serialised(resolveWorkspacePath(lesson.file), async () => {
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
