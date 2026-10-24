// POST /api/media/promote — append a promoted generation's metadata + extracted style rules
// under "## Learned Preferences (RL Log)" in workspace/skills/thumb/SKILL.md. → { path, before, after }
import { NextResponse } from 'next/server';
import { readWorkspaceFile, writeWorkspaceFile } from '@/lib/server/workspace';
import { rejectNonLocalMutation } from '@/lib/server/local-only';
import { ASPECT_BY_ID, MODEL_BY_ID, headlineFromPrompt, type AspectId, type GenItem, type MediaModelId } from '@/components/media/data';
import { styleProfile } from '@/components/media/style';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REL_PATH = 'skills/thumb/SKILL.md';
const HEADING = '## Learned Preferences (RL Log)';

const FALLBACK_DOC = `# /thumb — YouTube Thumbnail Reference Database

Database skill: winning thumbnail layouts, palettes and CTR notes. Read before generating any thumbnail.

${HEADING}
`;

interface PromoteBody {
  id: string;
  prompt: string;
  model: MediaModelId;
  aspect: AspectId;
  seed: number;
  variant: GenItem['variant'];
  mediaType: GenItem['mediaType'];
  cost?: number;
}

function validate(raw: unknown): { ok: true; body: PromoteBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Body must be a JSON object' };
  const b = raw as Record<string, unknown>;
  if (typeof b.id !== 'string' || !/^[\w-]{1,64}$/.test(b.id)) return { ok: false, error: 'id must be a short slug' };
  if (typeof b.prompt !== 'string' || !b.prompt.trim() || b.prompt.length > 400)
    return { ok: false, error: 'prompt must be 1–400 chars' };
  if (typeof b.model !== 'string' || !(b.model in MODEL_BY_ID)) return { ok: false, error: 'unknown model' };
  if (typeof b.aspect !== 'string' || !(b.aspect in ASPECT_BY_ID)) return { ok: false, error: 'unknown aspect' };
  if (typeof b.seed !== 'number' || !Number.isInteger(b.seed) || b.seed < 0 || b.seed > 0xffffffff)
    return { ok: false, error: 'seed must be a uint32' };
  if (b.variant !== 'standard' && b.variant !== 'wildcard') return { ok: false, error: 'variant must be standard|wildcard' };
  if (b.mediaType !== 'thumbnail' && b.mediaType !== 'animation') return { ok: false, error: 'mediaType must be thumbnail|animation' };
  if (b.cost !== undefined && (typeof b.cost !== 'number' || b.cost < 0 || b.cost > 100)) return { ok: false, error: 'bad cost' };
  return { ok: true, body: b as unknown as PromoteBody };
}

/** Insert `entry` at the end of the RL Log section (before the next "## " heading); create the heading if missing. */
function insertUnderHeading(doc: string, entry: string): string {
  const lines = doc.split('\n');
  const idx = lines.findIndex((l) => l.trim().toLowerCase() === HEADING.toLowerCase());
  if (idx === -1) {
    const base = doc.trimEnd();
    return `${base}${base ? '\n\n' : ''}${HEADING}\n\n${entry}\n`;
  }
  let end = lines.length;
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  // trim trailing blank lines inside the section
  let insertAt = end;
  while (insertAt > idx + 1 && lines[insertAt - 1].trim() === '') insertAt--;
  const block = ['', ...entry.trimEnd().split('\n'), ...(end < lines.length ? [''] : [])];
  const out = [...lines.slice(0, insertAt), ...block, ...lines.slice(end)];
  const joined = out.join('\n');
  return joined.endsWith('\n') ? joined : `${joined}\n`;
}

export async function POST(req: Request) {
  const denied = rejectNonLocalMutation(req);
  if (denied) return denied;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const v = validate(raw);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const b = v.body;

  // Style rules are re-derived server-side from seed/variant (never trusted from the client).
  const profile = styleProfile(b);
  const spec = MODEL_BY_ID[b.model];
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const safePrompt = b.prompt.replace(/\s+/g, ' ').replace(/"/g, "'").trim();
  const entry = [
    `### ⭐ Promoted ${b.variant === 'wildcard' ? '🃏 WILDCARD' : 'STANDARD (/robo)'} asset \`${b.id}\` — ${stamp}`,
    `- **Prompt:** "${safePrompt}" → headline \`${headlineFromPrompt(b.prompt)}\``,
    `- **Model:** ${spec.label} (${spec.vendor}) · **Type:** ${b.mediaType} · **Aspect:** ${b.aspect} · **Seed:** ${b.seed} · **Cost:** $${(b.cost ?? spec.costPerItem).toFixed(2)}`,
    `- **Style:** ${profile.styleName} · palette ${profile.palette.join(' ')}`,
    `- **Rules learned:**`,
    ...profile.rules.map((r) => `  - ${r}`),
    `- **Source:** Generations app (/apps/generations) · reward +1 (human promote)`,
  ].join('\n');

  try {
    const existing = await readWorkspaceFile(REL_PATH);
    const before = existing ?? '';
    const after = insertUnderHeading(existing ?? FALLBACK_DOC, entry);
    await writeWorkspaceFile(REL_PATH, after);
    return NextResponse.json({ path: `workspace/${REL_PATH}`, before, after, entry, created: existing === null });
  } catch (err) {
    return NextResponse.json({ error: `Write failed: ${(err as Error).message}` }, { status: 500 });
  }
}
