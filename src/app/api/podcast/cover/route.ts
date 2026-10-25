import { authorizeFeedRequest, PRIVATE_HEADERS } from '@/lib/server/podcast/auth';
import { coverPng } from '@/lib/server/podcast/cover';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/podcast/cover?token=…  podcast artwork (1400x1400 PNG, rendered in-process). */
export async function GET(req: Request) {
  const denied = authorizeFeedRequest(req);
  if (denied) return denied;
  return new Response(new Uint8Array(coverPng()), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400', ...PRIVATE_HEADERS } });
}
