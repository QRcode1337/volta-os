// GET /api/recos[?refresh=1]  weekly improvement cards from real signals (Video Production playbooks, failing routines,
// Systems attention items, Pieces-Vault backlog). Read-only; each card carries its source link.
import { getRecos } from '@/lib/server/recos';
import { allowForce, notionJson } from '@/lib/server/notion/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = notionJson((req) => getRecos({ force: allowForce(req, 'recos') }));
