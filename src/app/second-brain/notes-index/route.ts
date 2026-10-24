import { localJson } from '@/lib/server/route-helpers';
import { getRecentNotes } from '@/lib/server/sources/notes';

// Compact index of every note across the registered Obsidian vaults (title/path/mtime only, no bodies),
// so the Second Brain search can reach notes outside the capped graph. Localhost-only, read-only.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = localJson(async () => {
  const notes = await getRecentNotes(1_000_000);
  const vaultIds: string[] = [];
  const vaultIndex = new Map<string, number>();
  const rows = notes.map((n): [number, string, number] => {
    let vi = vaultIndex.get(n.vaultId);
    if (vi === undefined) {
      vi = vaultIds.length;
      vaultIds.push(n.vaultId);
      vaultIndex.set(n.vaultId, vi);
    }
    return [vi, n.relPath, Math.round(Date.parse(n.mtime) / 1000)];
  });
  return { vaultIds, notes: rows, total: rows.length };
});
