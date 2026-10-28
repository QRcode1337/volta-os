'use client';
import { useState } from 'react';
import { Check, Copy, Rss } from 'lucide-react';
import { copyText } from '@/components/elements/kit/clipboard';
import { api } from './podcast-client';

/** Shows the private feed URL with the token masked; the Copy button fetches the real URL from the local-only route. */
export function SubscribeCard({ baseUrl, tokenOk, externalUrl, onError }: { baseUrl: string; tokenOk: boolean; externalUrl?: string | null; onError: (m: string) => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      const r = await api<{ configured: boolean; url: string | null }>('/api/podcast/subscribe');
      if (!r.url) return onError('PODCAST_FEED_TOKEN is not set in .env.local.');
      const ok = await copyText(r.url);
      setCopied(ok);
      if (!ok) onError('Copy failed.');
      window.setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      onError((e as Error).message);
    }
  };
  return (
    <section className="rounded-lg border border-subtle bg-panel p-4">
      <h2 className="hud-label flex items-center gap-1.5 !text-orange">
        <Rss className="h-3 w-3" /> Subscribe on iPhone
      </h2>
      <p className="mt-2 break-all rounded-md border border-subtle/60 bg-obsidian px-2.5 py-2 font-mono text-[10.5px] text-secondary">
        {externalUrl ?? <>{baseUrl}/api/podcast/feed.xml?token=<span className="text-orange">{tokenOk ? '••••••••' : 'NOT SET'}</span></>}
      </p>
      <button
        type="button"
        disabled={!tokenOk && !externalUrl}
        onClick={() => void copy()}
        className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-full border border-subtle px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-secondary transition-colors hover:border-highlight hover:text-paper disabled:opacity-40"
      >
        {copied ? <Check className="h-3 w-3 text-green" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Copied' : 'Copy private feed URL'}
      </button>
      <p className="mt-2.5 text-[11px] leading-snug text-muted">
        Apple Podcasts: Library, then the ••• menu, then Follow a Show by URL. The iPhone must be on your tailnet. Anyone holding this URL can listen: treat it like a password.
      </p>
    </section>
  );
}
