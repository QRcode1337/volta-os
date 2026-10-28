import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import type { WorkspaceFileResponse } from '@/types/os';
import { BRAIN_NODES, SKILLS } from '@/lib/mock-data';
import { resolveWorkspacePath, writeWorkspaceFile } from '@/lib/server/workspace';
import { HttpError, NO_STORE, route } from '@/lib/server/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_READ_BYTES = 1_000_000;
const MAX_WRITE_CHARS = 512_000;
const MAX_PATH_CHARS = 512;
const WRITABLE_EXT = /\.(md|markdown|txt|html|json|ya?ml|csv|css|tsx?|jsx?)$/i;

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

/** GET /api/files?path=skills/tone/SKILL.md → WorkspaceFileResponse (404 with `exists: false` when there is no file or seed). */
export const GET = route(async ({ url }) => {
  const v = validatePath(url.searchParams.get('path'));
  if ('error' in v) throw new HttpError(v.error, 400);
  const abs = resolveWorkspacePath(v.rel);

  try {
    const stat = await fs.stat(abs);
    if (stat.isDirectory()) throw new HttpError('`path` is a directory', 400);
    if (stat.size > MAX_READ_BYTES) throw new HttpError(`File exceeds ${MAX_READ_BYTES} bytes`, 413);
    const content = await fs.readFile(abs, 'utf8');
    const res: WorkspaceFileResponse = { path: v.rel, content, exists: true };
    return res;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') throw new HttpError(`Could not read file (${code ?? 'unknown error'})`, 500);
  }

  const fallback = fallbackContent(v.rel);
  const res: WorkspaceFileResponse = { path: v.rel, content: fallback ?? '', exists: false };
  return NextResponse.json(res, { status: fallback === null ? 404 : 200, headers: NO_STORE });
});

/** PUT /api/files { path, content } → WorkspaceFileResponse (writes via writeWorkspaceFile). */
export const PUT = route(
  async ({ body }) => {
    const { path: rawPath, content } = body as { path?: unknown; content?: unknown };

    const v = validatePath(rawPath);
    if ('error' in v) throw new HttpError(v.error, 400);
    if (!WRITABLE_EXT.test(v.rel)) throw new HttpError('Only text files (md, txt, html, json, yaml, csv, css, ts/tsx, js/jsx) are writable', 400);
    if (typeof content !== 'string') throw new HttpError('`content` must be a string', 400);
    if (content.length > MAX_WRITE_CHARS) throw new HttpError(`\`content\` exceeds ${MAX_WRITE_CHARS} characters`, 413);

    const abs = resolveWorkspacePath(v.rel);
    try {
      const stat = await fs.stat(abs);
      if (stat.isDirectory()) throw new HttpError('`path` is a directory', 400);
    } catch (e) {
      if (e instanceof HttpError) throw e;
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw new HttpError(`Could not stat file (${code ?? 'unknown error'})`, 500);
      // ENOENT → creating a new file
    }

    try {
      await writeWorkspaceFile(v.rel, content);
    } catch (e) {
      throw new HttpError(`Could not write file (${(e as NodeJS.ErrnoException).code ?? (e as Error).message})`, 500);
    }
    const res: WorkspaceFileResponse = { path: v.rel, content, exists: true };
    return res;
  },
  // JSON-escaped content can take up to 6 bytes per character; the character cap above is the real limit.
  { json: true, maxBytes: MAX_WRITE_CHARS * 6 + 4096 },
);
