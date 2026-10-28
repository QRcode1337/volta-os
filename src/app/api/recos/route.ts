// GET /api/recos[?refresh=1]  weekly improvement cards from real signals (Video Production playbooks, failing routines,
// Systems attention items, Pieces-Vault backlog). Read-only; each card carries its source link.
import { getRecos } from '@/lib/server/recos';
import { refreshOpts, notionHttp } from '@/lib/server/notion/route';
import { route } from '@/lib/server/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(({ req }) => getRecos(refreshOpts(req)).catch(notionHttp), { tag: 'volta notion api' });
