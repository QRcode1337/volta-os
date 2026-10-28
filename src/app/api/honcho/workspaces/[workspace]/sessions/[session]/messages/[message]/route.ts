import { route } from '@/lib/server/route-helpers';
import { getMessage } from '@/lib/server/honcho';
import { fromHoncho, idOf } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One message (masked like every proxied body). Used by /apps/honcho deep links that carry only a message id. */
export const GET = route<{ workspace: string; session: string; message: string }>(
  ({ params: p }) => fromHoncho(getMessage(idOf(p.workspace, 'workspace'), idOf(p.session, 'session'), idOf(p.message, 'message'))),
  { tag: 'honcho' },
);
