// POST /api/editor/nle/hyperframes {sequence} → { html, fileName }  a HyperFrames composition of the sequence
import { route } from '@/lib/server/route-helpers';
import { MAX_SEQUENCE_BYTES } from '@/lib/server/editor/nle/projects';
import { sequenceToHyperframes } from '@/lib/server/editor/nle/hyperframes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(({ body }) => sequenceToHyperframes(body.sequence), { json: true, maxBytes: MAX_SEQUENCE_BYTES + 4096 });
