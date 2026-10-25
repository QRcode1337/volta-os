// GET /api/research/syntheses  the cross-paper syntheses (Obsidian vault Synthesis/ plus ~/ErisMorn/voltamachine/synthesis), newest first.
import { localJson } from '@/lib/server/route-helpers';
import { listSyntheses } from '@/lib/server/research/vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = localJson(async () => {
  const items = await listSyntheses();
  return { total: items.length, vault: items.filter((i) => i.source === 'vault').length, items };
});
