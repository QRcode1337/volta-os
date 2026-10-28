// POST /api/editor/nle/upload   raw body (not JSON / multipart); headers X-File-Name (encodeURIComponent'd) and
// Content-Type video/* | audio/* | image/*  → NleUploadResult. Cap 4 GB; refused (507) when < 3 GiB would remain.
// Guard: loopback + same-origin (route's read guard: no application/json requirement). A non-JSON body is fine here:
// a cross-site page cannot send a video/* body without a CORS preflight, which this server never approves.
import { route } from '@/lib/server/route-helpers';
import { receiveUpload } from '@/lib/server/editor/nle/upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(({ req }) => receiveUpload(req));
