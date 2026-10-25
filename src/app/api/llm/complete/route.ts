import { NextResponse } from 'next/server';
import { rejectNonLocalMutation } from '@/lib/server/local-only';
import { complete, completeStream, TaskError } from '@/lib/server/llm';
import type { CompleteRequest } from '@/lib/server/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };

function fail(err: unknown) {
  if (err instanceof TaskError) {
    const status = err.code === 'unknown_task' || err.code === 'bad_request' ? 400 : 502;
    return NextResponse.json({ error: err.message, code: err.code, attempts: err.attempts }, { status, headers: NO_STORE });
  }
  console.error('[volta api] /api/llm/complete', err instanceof Error ? err.message : 'failed');
  return NextResponse.json({ error: 'LLM request failed', code: 'internal' }, { status: 500, headers: NO_STORE });
}

/**
 * POST /api/llm/complete  { task, messages: [{role, content}], maxTokens?, temperature?, timeoutMs?, stream? }
 * Routes the task through OmniRoute combos (config/llm-routes.json) with LM Studio as the last resort.
 * JSON reply: { task, text, route: {target, via, model, provider, …}, usage, latencyMs, webGrounded, attempts }.
 * stream:true replies as Server-Sent Events: `meta`, `delta`*, `done` (or a final `error`) as JSON data lines.
 */
export async function POST(req: Request) {
  const denied = rejectNonLocalMutation(req);
  if (denied) return denied;

  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request body too large.' }, { status: 413 });

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request body too large.' }, { status: 413 });
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 });
  }
  if (typeof body.task !== 'string' || !body.task) return NextResponse.json({ error: 'task is required.' }, { status: 400 });

  const request: CompleteRequest = {
    task: body.task,
    messages: body.messages as CompleteRequest['messages'],
    maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : undefined,
    temperature: typeof body.temperature === 'number' && body.temperature >= 0 && body.temperature <= 2 ? body.temperature : undefined,
    timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
    signal: req.signal,
  };

  if (body.stream === true) {
    const gen = completeStream(request);
    // Pull the first event before answering so a bad request / total failure is a proper HTTP error, not a 200 stream.
    let first: IteratorResult<Awaited<ReturnType<typeof gen.next>>['value']>;
    try {
      first = await gen.next();
    } catch (err) {
      return fail(err);
    }
    const enc = new TextEncoder();
    const line = (o: unknown) => enc.encode(`data: ${JSON.stringify(o)}\n\n`);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          let r = first;
          while (!r.done) {
            controller.enqueue(line(r.value));
            r = await gen.next();
          }
        } catch (err) {
          const msg = err instanceof TaskError ? err.message : 'stream failed';
          controller.enqueue(line({ type: 'error', error: msg, attempts: err instanceof TaskError ? err.attempts : undefined }));
        } finally {
          controller.close();
        }
      },
      cancel() {
        void gen.return(undefined);
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' } });
  }

  try {
    return NextResponse.json(await complete(request), { headers: NO_STORE });
  } catch (err) {
    return fail(err);
  }
}
