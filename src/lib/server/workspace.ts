import 'server-only';
import path from 'node:path';
import fs from 'node:fs/promises';

/** Absolute path of the ./workspace ARMS folder. */
export const WORKSPACE_DIR = path.join(process.cwd(), 'workspace');

/**
 * Resolve a workspace-relative path ("skills/cut/SKILL.md" or "workspace/skills/cut/SKILL.md")
 * to an absolute path, refusing anything that escapes ./workspace.
 */
export function resolveWorkspacePath(rel: string): string {
  const cleaned = rel.replace(/^\/+/, '').replace(/^workspace\//, '');
  const abs = path.resolve(WORKSPACE_DIR, cleaned);
  if (abs !== WORKSPACE_DIR && !abs.startsWith(WORKSPACE_DIR + path.sep)) {
    throw new Error(`Path escapes workspace: ${rel}`);
  }
  return abs;
}

export async function readWorkspaceFile(rel: string): Promise<string | null> {
  try {
    return await fs.readFile(resolveWorkspacePath(rel), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeWorkspaceFile(rel: string, content: string): Promise<void> {
  const abs = resolveWorkspacePath(rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf8');
}

/** Append text; creates the file (and parents) if missing. Returns { before, after }. */
export async function appendWorkspaceFile(rel: string, text: string): Promise<{ before: string; after: string }> {
  const before = (await readWorkspaceFile(rel)) ?? '';
  const after = before.endsWith('\n') || before === '' ? before + text : `${before}\n${text}`;
  await writeWorkspaceFile(rel, after);
  return { before, after };
}

/** Recursively list workspace-relative file paths (skips dotfiles). */
export async function listWorkspaceFiles(dir = ''): Promise<string[]> {
  const abs = resolveWorkspacePath(dir || '.');
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listWorkspaceFiles(rel)));
    else out.push(rel);
  }
  return out;
}
