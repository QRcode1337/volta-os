import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isEvicted } from './icloud';
import { mapLimit } from './proc';

// The one directory walk for note folders (Obsidian vaults, research synthesis dirs). readdir + stat only, never
// reads a file, so an iCloud-evicted placeholder is reported (`dataless`) rather than downloaded. Callers keep their
// own skip rules, depth and symlink policy as options, and their own reading/caching on top.

export interface VaultFile {
  /** Root-relative, '/'-separated. */
  rel: string;
  abs: string;
  mtimeMs: number;
  size: number;
  /** iCloud-evicted placeholder: reading it would force a slow download. */
  dataless: boolean;
}

export interface WalkVaultOptions {
  /** Called once per matching file, in walk order (depth-first, readdir order). */
  onFile: (file: VaultFile) => void;
  /** Names (files and folders) to leave out. Default: dot-prefixed. */
  skip?: (name: string) => boolean;
  /** File names to report. Default: `.md`, any case. */
  match?: (name: string) => boolean;
  /** Deepest folder level entered below `root` (root = 0). Default: unlimited. */
  maxDepth?: number;
  /** 'files' (default): symlinked files are reported, symlinked folders are not entered. 'skip': ignore every symlink. */
  symlinks?: 'files' | 'skip';
  /** Parallel stats. Default 16. */
  concurrency?: number;
}

const dotPrefixed = (name: string) => name.startsWith('.');
const isMarkdown = (name: string) => /\.md$/i.test(name);

/** Walks `root` and reports every matching file with its stat. Unreadable folders and vanished files are skipped. */
export async function walkVault(root: string, opts: WalkVaultOptions): Promise<void> {
  const { onFile, skip = dotPrefixed, match = isMarkdown, maxDepth = Infinity, symlinks = 'files', concurrency = 16 } = opts;
  const found: string[] = [];
  const visit = async (dir: string, depth: number): Promise<void> => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(path.join(root, dir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (skip(e.name)) continue;
      if (e.isSymbolicLink() && symlinks === 'skip') continue;
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (depth < maxDepth) await visit(rel, depth + 1);
      } else if ((e.isFile() || e.isSymbolicLink()) && match(e.name)) found.push(rel);
    }
  };
  await visit('', 0);
  const stats = await mapLimit(found, concurrency, async (rel): Promise<VaultFile | null> => {
    const abs = path.join(root, rel);
    try {
      const st = await fs.stat(abs);
      return st.isFile() ? { rel, abs, mtimeMs: st.mtimeMs, size: st.size, dataless: isEvicted(st) } : null;
    } catch {
      return null; // vanished (iCloud eviction etc.)
    }
  });
  for (const f of stats) if (f) onFile(f);
}
