import 'server-only';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { LtmSessionNote, ObsidianVault } from '@/types/ltm';
import { cached } from './sources/cache';
import { obsidianUrl, parseFrontmatter } from '@/lib/text';
import { walkVault, type VaultFile } from './vault-walk';

// Read-only view of the user's registered Obsidian vaults and the Pieces-Vault LTM session notes.

const OBSIDIAN_CONFIG = path.join(os.homedir(), 'Library/Application Support/obsidian/obsidian.json');
export const PIECES_VAULT_DIR = process.env.PIECES_VAULT_DIR ?? path.join(os.homedir(), 'Pieces-Vault');

// ── One walker for every vault count ──
// /api/vaults, the note list (/api/notes/recent, notes-index) and the brain graph all read the same cached
// snapshot below, so their totals agree by construction.

/** Folders that are never notes (in addition to anything dot-prefixed). pdf-abstracts holds ~1.8k generated Research notes: Obsidian and Research read them, the brain graph and recent list do not. */
const SKIP_NAMES = new Set(['.obsidian', '.trash', '.git', 'node_modules', '.tools', '_archive', 'pdf-abstracts']);
/** The single skip rule: dot-prefixed files and folders, and the folders above. */
const isSkippedEntry = (name: string) => name.startsWith('.') || SKIP_NAMES.has(name);

/** Every .md note under `root` (readdir + stat only, never reads note bodies). */
async function walkVaultNotes(root: string): Promise<VaultFile[]> {
  const out: VaultFile[] = [];
  await walkVault(root, { onFile: (f) => out.push(f), skip: isSkippedEntry, match: (name) => name.endsWith('.md') });
  return out;
}

interface ObsidianConfig {
  vaults?: Record<string, { path: string; ts?: number; open?: boolean }>;
}

export interface RegisteredVault {
  id: string;
  name: string;
  path: string;
  location: 'icloud' | 'local';
  open: boolean;
}

/** Vaults registered in Obsidian's own config (excluding the built-in Sandbox). Re-read when the file changes, else at most every 30s. */
export function registeredVaults(): Promise<RegisteredVault[]> {
  return cached(
    'obsidian-vaults',
    30_000,
    async () => {
    let cfg: ObsidianConfig = {};
    try {
      cfg = JSON.parse(await fs.readFile(OBSIDIAN_CONFIG, 'utf8')) as ObsidianConfig;
    } catch {
      return [];
    }
    return Object.entries(cfg.vaults ?? {})
      .filter(([, v]) => typeof v?.path === 'string' && !v.path.includes('/Application Support/obsidian/'))
      .map(([id, v]) => ({
        id,
        name: path.basename(v.path),
        path: v.path,
        location: v.path.includes('/Mobile Documents/') ? ('icloud' as const) : ('local' as const),
        open: !!v.open,
      }));
    },
    { mtimeOf: [OBSIDIAN_CONFIG] },
  );
}

export interface VaultSnapshot {
  vaults: { vault: RegisteredVault; files: VaultFile[] }[];
  /** Changes whenever a note is added, removed or edited (count + mtime/size sums per vault). */
  signature: string;
  at: number;
}

const NOTES_TTL_MS = 2 * 60_000;
const FORCE_MIN_MS = 10_000; // ?refresh=1 re-walks at most this often

/** One walk of every registered vault (cached 2 min, stale-while-revalidate). `force` re-walks now (rate-limited). */
export function vaultSnapshot(force = false): Promise<VaultSnapshot> {
  return cached(
    'vault-notes:v3',
    NOTES_TTL_MS,
    async () => {
      const reg = await registeredVaults();
      const vaults = await Promise.all(reg.map(async (vault) => ({ vault, files: await walkVaultNotes(vault.path) })));
      const signature = vaults
        .map(({ vault, files }) => {
          let mt = 0;
          let sz = 0;
          for (const f of files) {
            mt += f.mtimeMs;
            sz += f.size;
          }
          return `${vault.id}:${files.length}:${Math.round(mt)}:${sz}`;
        })
        .join('|');
      return { vaults, signature, at: Date.now() };
    },
    { force, minForceMs: FORCE_MIN_MS },
  );
}

/** Vaults registered in Obsidian with note counts, from the shared snapshot. `force` = re-walk (rate-limited). */
export async function listVaults(force = false): Promise<ObsidianVault[]> {
  const snap = await vaultSnapshot(force);
  const vaults = snap.vaults.map(({ vault: v, files }): ObsidianVault => {
    let latest = 0;
    for (const f of files) if (f.mtimeMs > latest) latest = f.mtimeMs;
    return {
      id: v.id,
      name: v.name,
      path: v.path,
      location: v.location,
      notes: files.length,
      lastEdited: latest ? new Date(latest).toISOString() : null,
      open: v.open,
      obsidianUrl: obsidianUrl(v.id),
    };
  });
  return vaults.sort((a, b) => (b.lastEdited ?? '').localeCompare(a.lastEdited ?? ''));
}

/** Vault id Obsidian uses for the Pieces-Vault folder, if registered. */
async function piecesVaultId(): Promise<string | null> {
  const target = path.resolve(PIECES_VAULT_DIR);
  return (await registeredVaults()).find((v) => path.resolve(v.path) === target)?.id ?? null;
}

/** Capture-id range of an ltm_ingest session note (`source: "ltm:A-B"`); null for day recaps (`ltm:day:…`). */
export function ltmSourceRange(fm: string): { from: number; to: number } | null {
  const m = fm.match(/^source:\s*"?ltm:(\d+)(?:-(\d+))?"?/m);
  return m ? { from: Number(m[1]), to: Number(m[2] ?? m[1]) } : null;
}

/** LTM session notes (written by ltm_ingest) for one day, oldest first. */
export async function listSessionNotes(date: string): Promise<LtmSessionNote[]> {
  const relDir = path.join('ltm', date.slice(0, 7));
  let files: string[];
  try {
    files = (await fs.readdir(path.join(PIECES_VAULT_DIR, relDir))).filter((f) => f.startsWith(date) && f.endsWith('.md'));
  } catch {
    return [];
  }
  const vaultId = await piecesVaultId();
  const notes = await Promise.all(
    files.map(async (f): Promise<LtmSessionNote> => {
      const rel = path.join(relDir, f);
      const src = await fs.readFile(path.join(PIECES_VAULT_DIR, rel), 'utf8');
      const fm = parseFrontmatter(src);
      const { body } = fm;
      const source = ltmSourceRange(fm.block);
      const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? f.replace(/^\d{4}-\d{2}-\d{2}\s+/, '').replace(/\.md$/, '');
      const tldr = body.match(/###\s*\*{0,2}TLDR\*{0,2}\s*\n+([^\n#][^\n]*)/i)?.[1]?.trim() ?? null;
      return {
        file: rel,
        title,
        date,
        timeLabel: body.match(/^Time:\s*(.+)$/m)?.[1]?.trim() ?? null,
        captureFrom: source?.from ?? null,
        captureTo: source?.to ?? null,
        tldr,
        tags: fm.list('tags'),
        apps: fm.list('apps'),
        obsidianUrl: vaultId ? obsidianUrl(vaultId, rel) : null,
      };
    }),
  );
  return notes.sort((a, b) => (a.captureFrom ?? 0) - (b.captureFrom ?? 0));
}
