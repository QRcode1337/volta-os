import { NextResponse } from 'next/server';
import { RECOMMENDATIONS } from '@/lib/mock-data';
import { appendWorkspaceFile, readWorkspaceFile, writeWorkspaceFile } from '@/lib/server/workspace';
import { rejectNonLocalMutation } from '@/lib/server/local-only';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADING = '## Applied Recos';

interface ApplyResult {
  id: string;
  files: string[];
  summary: string;
}

/**
 * Add `entry` under the file's `## Applied Recos` section, creating the section (and file) if needed.
 * Every write goes through the workspace helpers, which refuse paths outside ./workspace.
 */
async function logToFile(rel: string, entry: string): Promise<'created' | 'updated'> {
  const before = await readWorkspaceFile(rel);
  const hasSection = before !== null && (before.startsWith(HEADING) || before.includes(`\n${HEADING}`));
  if (before === null || !hasSection) {
    const prefix = before === null || before.trim() === '' ? '' : '\n';
    await appendWorkspaceFile(rel, `${prefix}${HEADING}\n\n${entry}`);
    return before === null ? 'created' : 'updated';
  }
  // Section exists: insert at the end of it (before the next "## " heading, if any).
  const start = before.indexOf(HEADING);
  const rest = before.slice(start + HEADING.length);
  const nextIdx = rest.search(/\n## (?!#)/);
  if (nextIdx === -1) {
    await appendWorkspaceFile(rel, `\n${entry}`);
  } else {
    const cut = start + HEADING.length + nextIdx + 1;
    const head = before.slice(0, cut).replace(/\n*$/, '\n\n');
    await writeWorkspaceFile(rel, `${head}${entry}\n${before.slice(cut)}`);
  }
  return 'updated';
}

export async function POST(req: Request) {
  const denied = rejectNonLocalMutation(req);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON: { ids: string[] }' }, { status: 400 });
  }
  const raw = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every((x) => typeof x === 'string')) {
    return NextResponse.json({ error: '`ids` must be a non-empty string array' }, { status: 400 });
  }
  const ids = [...new Set(raw as string[])];
  const unknown = ids.filter((id) => !RECOMMENDATIONS.some((r) => r.id === id));
  if (unknown.length > 0) {
    return NextResponse.json({ error: `Unknown recommendation id(s): ${unknown.join(', ')}` }, { status: 400 });
  }

  const now = new Date();
  const stamp = now.toISOString();
  const date = stamp.slice(0, 10);
  const results: ApplyResult[] = [];

  // Sequential on purpose: several recos touch the same file (CLAUDE.md, MEMORY.md).
  for (const id of ids) {
    const reco = RECOMMENDATIONS.find((r) => r.id === id)!;
    const entry = [
      `### ${date} · ${reco.id} · ${reco.title}`,
      `- Applied: ${stamp}`,
      `- Source: VOLTA Recos (/apps/recos) · ${reco.bucket}${reco.priority ? ' · priority' : ''}`,
      `- Expected impact: ${reco.savingsLabel}`,
      `- Change: ${reco.promptPayload}`,
      '',
    ].join('\n');

    const files: string[] = [];
    let created = 0;
    const failed: string[] = [];
    for (const rel of reco.filesTouched) {
      try {
        if ((await logToFile(rel, entry)) === 'created') created += 1;
        files.push(`workspace/${rel}`);
      } catch (err) {
        failed.push(`${rel} (${(err as Error).message})`);
      }
    }
    const parts = [`Logged "${reco.title}" in ${files.length} file${files.length === 1 ? '' : 's'}`];
    if (created > 0) parts.push(`${created} created`);
    if (failed.length > 0) parts.push(`failed: ${failed.join('; ')}`);
    results.push({ id, files, summary: parts.join(' · ') });
  }

  if (results.every((r) => r.files.length === 0)) {
    return NextResponse.json({ error: 'No workspace files could be written', results }, { status: 500 });
  }
  return NextResponse.json({ appliedAt: stamp, results });
}
