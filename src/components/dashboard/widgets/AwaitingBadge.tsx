'use client';
// Small dashboard badge: "Awaiting you: N" (items marked [@] in the OpenClaw action pipeline), links to VOLTA Tasks.
// Fetches only the counts (GET /api/actions?counts=1) and re-polls every 60 s while the tab is visible.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

const POLL_MS = 60_000;

export function AwaitingBadge({ className }: { className?: string }) {
  const [n, setN] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let ctl: AbortController | null = null;
    const load = async () => {
      ctl?.abort();
      ctl = new AbortController();
      try {
        const res = await fetch('/api/actions?counts=1', { cache: 'no-store', signal: ctl.signal });
        const body = (await res.json()) as { available?: boolean; counts?: { byStatus?: { awaiting?: number } } };
        if (!alive) return;
        if (!res.ok || body.available === false) throw new Error('unavailable');
        setN(body.counts?.byStatus?.awaiting ?? 0);
        setFailed(false);
      } catch (err) {
        if (alive && (err as Error).name !== 'AbortError') setFailed(true);
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => {
      alive = false;
      ctl?.abort();
      window.clearInterval(timer);
    };
  }, []);

  const hot = n !== null && n > 0;
  return (
    <Link
      href="/apps/tasks"
      title={failed ? 'Could not read the action pipeline' : 'Items waiting on you in the OpenClaw action pipeline'}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors',
        hot ? 'border-orange/60 bg-orange/10 text-orange hover:border-orange' : 'border-subtle text-muted hover:border-highlight hover:text-paper',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', hot ? 'animate-pulse bg-orange' : 'bg-muted')} />
      Awaiting you: {n === null ? (failed ? '?' : '…') : n}
    </Link>
  );
}

export default AwaitingBadge;
