// POST /api/editor/nle/upload   raw body (not JSON / multipart); headers X-File-Name (encodeURIComponent'd) and
// Content-Type video/* | audio/* | image/*  → NleUploadResult. Cap 4 GB; refused (507) when < 3 GiB would remain.
// Guard: loopback + same-origin. A non-JSON body is fine here: a cross-site page cannot send a video/* body without a
// CORS preflight, which this server never approves.
import { NextResponse } from 'next/server';
import { rejectCrossSite, rejectNonLocal } from '@/lib/server/local-only';
import { fail } from '@/lib/server/studio/http';
import { receiveUpload } from '@/lib/server/editor/nle/upload';
import { noStore } from '@/lib/server/editor/nle/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = rejectNonLocal(req) ?? rejectCrossSite(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await receiveUpload(req), { headers: noStore });
  } catch (err) {
    return fail(err);
  }
}
