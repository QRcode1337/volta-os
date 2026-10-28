// POST /api/media/quote — validate a generation request and return an est. cost + short-lived quote id.
// Spends nothing. POST /api/media/generate {quoteId} is the only route that spends.
import { route } from '@/lib/server/route-helpers';
import { toHttpError } from '@/lib/server/media/config';
import { createQuote } from '@/lib/server/media/quotes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(
  async ({ body }) => {
    try {
      return await createQuote(body);
    } catch (err) {
      throw toHttpError(err);
    }
  },
  { json: true, maxBytes: 256 * 1024 },
);
