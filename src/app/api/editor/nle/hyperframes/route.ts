// POST /api/editor/nle/hyperframes {sequence} → { html, fileName }  a HyperFrames composition of the sequence
import { nleMutation } from '@/lib/server/editor/nle/http';
import { MAX_SEQUENCE_BYTES } from '@/lib/server/editor/nle/projects';
import { sequenceToHyperframes } from '@/lib/server/editor/nle/hyperframes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = nleMutation((body) => sequenceToHyperframes(body.sequence), MAX_SEQUENCE_BYTES + 4096);
