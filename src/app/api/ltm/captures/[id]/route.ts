import { HttpError, route } from '@/lib/server/route-helpers';
import { getCapture } from '@/lib/server/ltm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route<{ id: string }>(
  ({ params }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id < 0) throw new HttpError('invalid id', 400);
    const capture = getCapture(id);
    if (!capture) throw new HttpError('not found', 404);
    return capture;
  },
  { tag: 'ltm' },
);
