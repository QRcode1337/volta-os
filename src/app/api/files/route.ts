import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import type { WorkspaceFileResponse } from '@/types/os';
import { BRAIN_NODES, SKILLS } from '@/lib/mock-data';
import { resolveWorkspacePath, writeWorkspaceFile } from '@/lib/server/workspace';
import { rejectNonLocalMutation, rejectNonLocalRead } from '@/lib/server/local-only';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_READ_BYTES = 1_000_000;
const MAX_WRITE_CHARS = 512_000;
const MAX_PATH_CHARS = 512;
const WRITABLE_EXT = /\.(md|markdown|txt|html|json|ya?ml|csv|css|tsx?|jsx?)$/i;

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** "workspace/skills/x.md" | "/skills/x.md" | "skills/x.md" → "skills/x.md" */
function normalise(p: string): string {
  return p.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/^workspace\//, '');
}

/** Validate a client-supplied path; returns the normalised relative path or an error message. */
function validatePath(raw: unknown): { rel: string } | { error: string } {
  if (typeof raw !== 'string' || !raw.trim()) return { error: '`path` is required' };
  if (raw.length > MAX_PATH_CHARS) return { error: '`path` is too long' };
  if (raw.includes('\0')) return { error: '`path` contains a null byte' };
  const rel = normalise(raw);
  if (!rel || rel.endsWith('/')) return { error: '`path` must point to a file' };
  if (rel.split('/').some((seg) => seg.startsWith('.'))) return { error: 'Hidden files and parent segments are not allowed' };
  try {
    resolveWorkspacePath(rel);
  } catch {
    return { error: 'Path escapes the workspace' };
  }
  return { rel };
}

/** Seed fallback for files that are not on disk yet (skills, graph nodes). */
function fallbackContent(rel: string): string | null {
  const wsPath = `workspace/${rel}`;
  const skill = SKILLS.find((s) => s.filePath === wsPath);
  if (skill) return skill.markdownContent;
  const node = BRAIN_NODES.find((n) => n.filePath === wsPath);
  if (node) {
    if (node.content) return node.content;
    return `# ${node.label}\n\n> ${node.summary ?? 'No summary yet.'}\n\n_This file has not been written to disk yet._\n`;
  }
  return null;
}

/** GET /api/files?path=skills/tone/SKILL.md → WorkspaceFileResponse */
export async function GET(req: Request) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  const v = validatePath(new URL(req.url).searchParams.get('path'));
  if ('error' in v) return err(400, v.error);
  const abs = resolveWorkspacePath(v.rel);

  try {
    const stat = await fs.stat(abs);
    if (stat.isDirectory()) return err(400, '`path` is a directory');
    if (stat.size > MAX_READ_BYTES) return err(413, `File exceeds ${MAX_READ_BYTES} bytes`);
    const content = await fs.readFile(abs, 'utf8');
    const res: WorkspaceFileResponse = { path: v.rel, content, exists: true };
    return NextResponse.json(res, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') return err(500, `Could not read file (${code ?? 'unknown error'})`);
  }

  const fallback = fallbackContent(v.rel);
  const res: WorkspaceFileResponse = { path: v.rel, content: fallback ?? '', exists: false };
  return NextResponse.json(res, { status: fallback === null ? 404 : 200, headers: { 'Cache-Control': 'no-store' } });
}

/** PUT /api/files { path, content } → WorkspaceFileResponse (writes via writeWorkspaceFile). */
export async function PUT(req: Request) {
  const denied = rejectNonLocalMutation(req);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, 'Body must be valid JSON: { path: string, content: string }');
  }
  if (!body || typeof body !== 'object') return err(400, 'Body must be an object');
  const { path: rawPath, content } = body as { path?: unknown; content?: unknown };

  const v = validatePath(rawPath);
  if ('error' in v) return err(400, v.error);
  if (!WRITABLE_EXT.test(v.rel)) return err(400, 'Only text files (md, txt, html, json, yaml, csv, css, ts/tsx, js/jsx) are writable');
  if (typeof content !== 'string') return err(400, '`content` must be a string');
  if (content.length > MAX_WRITE_CHARS) return err(413, `\`content\` exceeds ${MAX_WRITE_CHARS} characters`);

  const abs = resolveWorkspacePath(v.rel);
  try {
    const stat = await fs.stat(abs);
    if (stat.isDirectory()) return err(400, '`path` is a directory');
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') return err(500, `Could not stat file (${code ?? 'unknown error'})`);
    // ENOENT → creating a new file
  }

  try {
    await writeWorkspaceFile(v.rel, content);
  } catch (e) {
    return err(500, `Could not write file (${(e as NodeJS.ErrnoException).code ?? (e as Error).message})`);
  }
  const res: WorkspaceFileResponse = { path: v.rel, content, exists: true };
  return NextResponse.json(res);
}
