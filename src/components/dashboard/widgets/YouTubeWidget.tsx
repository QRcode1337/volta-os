'use client';

// Not mounted on the home grid yet. Real channel numbers from /api/youtube (YouTube Data API v3, cached 15 min
// server-side); the same snapshot drives the "YouTube" row of /api/sources. Never falls back to mock counts.

import { Play } from 'lucide-react';
import { HudPanel } from '@/components/robo-ui';
import type { YouTubeChannel } from '@/types/youtube';
import { useNow } from './hooks';
import { useSharedJson } from './shared-json';
import { relativeAgo } from './source-facts';

const POLL_MS = 15 * 60_000;
const n = (x: number) => x.toLocaleString('en-US');

export function YouTubeWidget({ className }: { className?: string }) {
  const { data, error, loading } = useSharedJson<{ channel: YouTubeChannel }>('/api/youtube', POLL_MS);
  const now = useNow(60_000);
  const ch = data?.channel;

  return (
    <HudPanel
      title="YOUTUBE STUDIO"
      icon={<Play size={12} strokeWidth={0} fill="currentColor" />}
      actions={ch ? [{ label: 'OPEN', href: ch.url }] : undefined}
      headerExtra={
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
          {ch ? (ch.handle ?? ch.title) : loading ? 'LOADING' : 'NOT CONNECTED'}
        </span>
      }
      className={className}
      bodyClassName="flex flex-col gap-2 px-3 py-2.5"
    >
      {ch ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="SUBS" value={ch.subscribers === null ? 'hidden' : n(ch.subscribers)} />
            <Stat label="VIEWS" value={n(ch.views)} />
            <Stat label="VIDEOS" value={n(ch.videoCount)} />
          </div>
          <ul className="flex flex-col">
            {ch.recent.slice(0, 3).map((v) => (
              <li key={v.id} className="flex items-baseline gap-2 border-t border-subtle py-1 first:border-t-0">
                <a href={v.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[11.5px] text-paper hover:text-orange">
                  {v.title}
                </a>
                <span className="shrink-0 font-mono text-[10px] text-muted">
                  {n(v.views)} · {now ? relativeAgo(v.publishedAt, now.getTime()) : '—'}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <span className="hud-label text-[10px] text-amber">{loading ? 'FETCHING CHANNEL…' : 'NO CHANNEL DATA'}</span>
          {!loading && <p className="selectable text-[11.5px] leading-snug text-secondary">{error?.message ?? 'No response from /api/youtube'}</p>}
        </>
      )}
    </HudPanel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-doto text-[20px] font-bold leading-none text-paper tabular-nums">{value}</span>
      <span className="hud-label mt-1 text-[9px] text-muted">{label}</span>
    </div>
  );
}
