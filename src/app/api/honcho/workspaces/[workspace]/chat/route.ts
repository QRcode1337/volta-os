import { NextResponse } from 'next/server';
import { HttpError, NO_STORE, route } from '@/lib/server/route-helpers';
import { peerChat, peerChatStream, workspaceChat, workspaceChatStream } from '@/lib/server/honcho';
import { redactSecrets } from '@/lib/server/redact';
import { fromHoncho, idOf, optId, textOf } from '@/app/api/honcho/_shared';
import { HONCHO_REASONING_LEVELS, type HonchoChatResponse, type HonchoReasoningLevel } from '@/types/honcho';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const maxDuration = 200;

/**
 * Dialectic chat ("Ask Honcho"). Body: {query, peer?, target?, session?, reasoning_level?}.
 * With peer → peer chat (optionally about target); without → workspace chat.
 * Aborting the browser request aborts the upstream call.
 * With `stream: true` the answer is relayed as SSE: `data: {"delta":"…"}` frames, then
 * `data: {"done":true,"elapsedMs":n}` (or `data: {"error":"…"}`), redacted chunk by chunk.
 */

/** Streaming secret masker. Holds back the trailing partial word (after the last whitespace) so a
 *  token split across two upstream chunks is masked whole; best effort for multi-word patterns. */
function makeRedactor() {
  let tail = '';
  return {
    push(chunk: string): string {
      const text = tail + chunk;
      const cut = Math.max(text.lastIndexOf(' '), text.lastIndexOf('\n'), text.lastIndexOf('\t')) + 1;
      // Never hold back an unbounded run with no whitespace; 256 chars covers any key format.
      const keepFrom = text.length - cut > 256 ? text.length : cut;
      tail = text.slice(keepFrom);
      return redactSecrets(text.slice(0, keepFrom));
    },
    flush(): string {
      const out = redactSecrets(tail);
      tail = '';
      return out;
    },
  };
}

function relayStream(upstream: Response, t0: number, signal: AbortSignal): NextResponse {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const red = makeRedactor();
  const reader = upstream.body!.getReader();
  const frame = (o: unknown) => enc.encode(`data: ${JSON.stringify(o)}\n\n`);
  let buf = '';
  const stream = new ReadableStream<Uint8Array>({
    // pull() is only re-invoked after it enqueued something, so loop until a frame goes out.
    async pull(ctrl) {
      try {
        for (let sent = false; !sent;) {
          const { value, done } = await reader.read();
          if (done) {
            const rest = red.flush();
            if (rest) ctrl.enqueue(frame({ delta: rest }));
            ctrl.enqueue(
              frame({
                done: true,
                elapsedMs: Math.round(performance.now() - t0),
              }),
            );
            ctrl.close();
            return;
          }
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const raw = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const data = raw
              .split('\n')
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).trimStart())
              .join('\n');
            if (!data) continue;
            let ev: { delta?: { content?: string }; done?: boolean } | null = null;
            try {
              ev = JSON.parse(data);
            } catch {
              continue;
            }
            const text = ev?.delta?.content;
            if (text) {
              const safe = red.push(text);
              if (safe) {
                ctrl.enqueue(frame({ delta: safe }));
                sent = true;
              }
            }
          }
        }
      } catch (err) {
        const aborted = signal.aborted || (err as Error)?.name === 'AbortError';
        if (!aborted)
          ctrl.enqueue(
            frame({
              error: redactSecrets((err as Error)?.message ?? 'stream failed'),
            }),
          );
        ctrl.close();
        void reader.cancel().catch(() => {});
      }
    },
    cancel() {
      return reader.cancel().catch(() => {});
    },
  });
  return new NextResponse(stream, {
    headers: {
      ...NO_STORE,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}

export const POST = route<{ workspace: string }>(
  async ({ req, params, body: b }) => {
    const w = idOf(params.workspace, 'workspace');
    const query = textOf(b.query, 'query', 10_000)!;
    const peer = optId(b.peer as string | undefined, 'peer');
    const target = optId(b.target as string | undefined, 'target');
    const session = optId(b.session as string | undefined, 'session');
    const level = (b.reasoning_level ?? 'low') as HonchoReasoningLevel;
    if (!HONCHO_REASONING_LEVELS.includes(level)) throw new HttpError('invalid reasoning_level', 400);
    if (target && !peer) throw new HttpError('target requires peer', 400);

    const t0 = performance.now();
    if (b.stream === true) {
      // fromHoncho maps open errors; the upstream Response itself passes through unmasked (relayStream masks it).
      const up = await fromHoncho(
        peer
          ? peerChatStream(w, peer, { query, target, session, reasoning_level: level, signal: req.signal })
          : workspaceChatStream(w, { query, session, reasoning_level: level, signal: req.signal }),
      );
      return relayStream(up, t0, req.signal);
    }
    const res = await fromHoncho(
      peer
        ? peerChat(w, peer, { query, target, session, reasoning_level: level, signal: req.signal })
        : workspaceChat(w, { query, session, reasoning_level: level, signal: req.signal }),
    );
    const body: HonchoChatResponse = {
      content: res.content,
      mode: peer ? 'peer' : 'workspace',
      elapsedMs: Math.round(performance.now() - t0),
    };
    return body;
  },
  { json: true, maxBytes: 64 * 1024, tag: 'honcho' },
);
