'use client';
import { useEffect, useMemo, useState } from 'react';
import type { PodcastConfig } from '@/lib/server/podcast/types';
import { cn } from '@/lib/cn';
import { api } from './podcast-client';

/** Per-topic weights (0 = skip, 5 = heaviest) and the story count. Saved into config/podcast.json; used by the next run. */
export function TopicWeights({ config, onSaved, onError }: { config: PodcastConfig; onSaved: (c: PodcastConfig) => void; onError: (m: string) => void }) {
  const initial = useMemo(() => Object.fromEntries(config.topics.map((t) => [t.id, t.weight])), [config]);
  const [w, setW] = useState<Record<string, number>>(initial);
  const [count, setCount] = useState(config.storyCount);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setW(initial);
    setCount(config.storyCount);
  }, [initial, config.storyCount]);
  const dirty = count !== config.storyCount || config.topics.some((t) => w[t.id] !== t.weight);

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await api<PodcastConfig>('/api/podcast/config', { weights: w, storyCount: count }, 'PUT'));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-subtle bg-panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="hud-label !text-orange">Topic weights</h2>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void save()}
          className={cn('h-7 rounded-full px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em]', dirty ? 'bg-orange text-obsidian' : 'border border-subtle text-muted')}
        >
          {saving ? 'Saving' : dirty ? 'Save' : 'Saved'}
        </button>
      </div>
      <ul className="mt-3 space-y-2.5">
        {config.topics.map((t) => (
          <li key={t.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[12.5px] text-paper">
                {t.label}
                {t.focus && <span className="ml-1.5 rounded-full bg-orange/15 px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.05em] text-orange">focus</span>}
              </span>
              <span className="font-mono text-[11px] text-secondary">{w[t.id] === 0 ? 'off' : w[t.id]}</span>
            </div>
            <input type="range" min={0} max={5} step={1} value={w[t.id] ?? 0} onChange={(e) => setW((p) => ({ ...p, [t.id]: Number(e.target.value) }))} aria-label={`${t.label} weight`} className="h-1 w-full cursor-pointer accent-[#FF5500]" />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-subtle/60 pt-3">
        <span className="text-[12.5px] text-paper">Stories per episode</span>
        <span className="flex items-center gap-2">
          <button type="button" className="h-6 w-6 rounded-full border border-subtle text-secondary hover:text-paper" onClick={() => setCount((c) => Math.max(6, c - 1))} aria-label="Fewer stories">
            -
          </button>
          <span className="w-5 text-center font-mono text-[12px] text-paper">{count}</span>
          <button type="button" className="h-6 w-6 rounded-full border border-subtle text-secondary hover:text-paper" onClick={() => setCount((c) => Math.min(10, c + 1))} aria-label="More stories">
            +
          </button>
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted">Weights steer which stories make the cut and how much airtime they get. Every topic above 0 is still researched on the web each day.</p>
    </section>
  );
}
