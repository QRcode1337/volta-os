// POST /api/editor/apply-feedback — VOLTA Editor "Apply & Teach Locally".
// Derives RL rules from the submitted pins (server-side, never trusting client-written rules) and inserts
// a dated entry under `## Learned Preferences (RL Log)` in skills/cut|animate/SKILL.md inside ./workspace.
import { NextResponse } from 'next/server';
import { readWorkspaceFile, writeWorkspaceFile } from '@/lib/server/workspace';
import { rejectNonLocalMutation } from '@/lib/server/local-only';
import { RL_HEADING, deriveLesson, insertUnderHeading, lessonMarkdown, type RlPinInput, type TeachSkill } from '@/components/editor/rl-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SKILLS = new Set(['/animate', '/cut', 'audio', '/robo']);
const MAX_PINS = 500;

interface ApplyBody {
  project: string;
  teach: { cut: boolean; animate: boolean };
  pins: RlPinInput[];
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
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

function titleFor(skill: TeachSkill): string {
  return `# ${skill} — SKILL\n\nSkill file managed by VOLTA Agentic OS. VOLTA Editor appends learned preferences below.\n\n${RL_HEADING}\n`;
}

export async function POST(req: Request) {
  const denied = rejectNonLocalMutation(req);
  if (denied) return denied;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return bad('Invalid JSON body.');
  }
  const body = validate(raw);
  if (typeof body === 'string') return bad(body);
  const wanted: TeachSkill[] = [...(body.teach.animate ? (['/animate'] as const) : []), ...(body.teach.cut ? (['/cut'] as const) : [])];
  if (!wanted.length) return bad('Enable "Teach my /cut" or "Teach my /animate" first.');

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
      const existing = await readWorkspaceFile(lesson.file);
      const before = existing ?? '';
      const base = existing ?? titleFor(skill);
      const after = insertUnderHeading(base, lessonMarkdown(lesson, date, body.project));
      await writeWorkspaceFile(lesson.file, after);
      files.push({ path: `workspace/${lesson.file}`, before, after });
    }
  } catch (err) {
    return bad(`Failed to write skill files: ${(err as Error).message}`, 500);
  }
  if (!files.length) return bad(`No unresolved pins tagged ${skipped.join(' or ')} — nothing to teach.`, 422);
  return NextResponse.json({ files, skipped });
}
