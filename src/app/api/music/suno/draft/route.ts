// POST /api/music/suno/draft  { kind: 'style' | 'lyrics' | 'tone' | 'script' | 'sound', brief, current, context }
// "Draft with AI" for the Suno panel through the LLM gateway (long-write route). Returns { text, model }.
// Spends no Suno credits; nothing is sent to Suno.
import { route } from '@/lib/server/route-helpers';
import { draftSuno } from '@/lib/server/music/suno-draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const POST = route(({ body }) => draftSuno(body), { json: true, maxBytes: 32 * 1024, tag: 'music api' });
