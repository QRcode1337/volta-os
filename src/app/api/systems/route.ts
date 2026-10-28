import { route } from '@/lib/server/route-helpers';
import { getSystemsReport, getSystemsSummary } from '@/lib/server/systems';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Live health of services, local models, storage and memory. Read-only; cached 15 s (sizes 10 min).
 * `?summary=1` → counts + attention titles only (for SystemsBadge; skips folder sizes).
 */
export const GET = route(({ url }) => (url.searchParams.get('summary') === '1' ? getSystemsSummary() : getSystemsReport()));
