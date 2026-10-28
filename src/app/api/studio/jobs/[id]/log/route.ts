// GET /api/studio/jobs/:id/log[?from=<seq>]   Server-Sent Events: init, log, progress, status, end
// Live jobs replay the in-memory ring buffer then stream; finished jobs that were evicted (or survived a restart)
// are replayed from /Volumes/Windsor/VOLTA/studio/logs/<id>.log.
import { HttpError, route } from '@/lib/server/route-helpers';
import { JOB_ID_RE, getJob, isFinal, readLogFile, subscribe } from '@/lib/server/studio/runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route<{ id: string }>(async ({ req, params: { id }, url }) => {
  if (!JOB_ID_RE.test(id)) throw new HttpError('Bad job id.', 400);
  const job = await getJob(id);
  if (!job) throw new HttpError('Job not found.', 404);
  const from = Math.max(0, Number(url.searchParams.get('from')) || Number(req.headers.get('last-event-id')) || 0);

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let closed = false;
      let unsub = () => {};
      const hb = setInterval(() => {
        if (!closed) ctrl.enqueue(enc.encode(': hb\n\n'));
      }, 15_000);
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(hb);
        unsub();
        try {
          ctrl.close();
        } catch {
          // already closed
        }
      };
      cleanup = close;
      const send = (event: string, data: unknown, evId?: number) => {
        if (closed) return;
        ctrl.enqueue(enc.encode(`${evId !== undefined ? `id: ${evId}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      req.signal.addEventListener('abort', close);

      send('init', job);
      const sub = subscribe(id, from, (ev) => {
        if (ev.type === 'log') send('log', { seq: ev.seq, line: ev.line }, ev.seq);
        else if (ev.type === 'progress') send('progress', { pct: ev.pct, label: ev.label });
        else {
          send('status', ev.job);
          if (isFinal(ev.job.status)) {
            send('end', {});
            close();
          }
        }
      });
      if (!sub) {
        // not live: replay the on-disk log, then end
        const lines = await readLogFile(id);
        lines.forEach((line, i) => i + 1 > from && send('log', { seq: i + 1, line }, i + 1));
        send('status', job);
        send('end', {});
        close();
        return;
      }
      unsub = sub.unsubscribe;
      if (isFinal(sub.job.status)) {
        send('status', sub.job);
        send('end', {});
        close();
      }
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});
