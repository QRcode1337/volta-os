import { HttpError, route } from '@/lib/server/route-helpers';
import { complete, completeStream, llmHttp, TaskError } from '@/lib/server/llm';
import type { CompleteRequest } from '@/lib/server/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

/**
 * POST /api/llm/complete  { task, messages: [{role, content}], maxTokens?, temperature?, timeoutMs?, stream? }
 * Routes the task through OmniRoute combos (config/llm-routes.json) with LM Studio as the last resort.
 * JSON reply: { task, text, route: {target, via, model, provider, …}, usage, latencyMs, webGrounded, attempts }.
 * stream:true replies as Server-Sent Events: `meta`, `delta`*, `done` (or a final `error`) as JSON data lines.
 */
export const POST = route(
  async ({ req, body }) => {
    if (typeof body.task !== 'string' || !body.task) throw new HttpError('task is required.', 400);

    const request: CompleteRequest = {
      task: body.task,
      messages: body.messages as CompleteRequest['messages'],
      maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : undefined,
      temperature: typeof body.temperature === 'number' && body.temperature >= 0 && body.temperature <= 2 ? body.temperature : undefined,
      timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
      signal: req.signal,
    };

    if (body.stream !== true) return complete(request).catch(llmHttp);

    const gen = completeStream(request);
    // Pull the first event before answering so a bad request / total failure is a proper HTTP error, not a 200 stream.
    const first = await gen.next().catch(llmHttp);
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
  },
  { json: true, maxBytes: 2 * 1024 * 1024 },
);
