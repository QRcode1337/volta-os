'use client';
import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import type { EpisodeRecord, PodcastConfig, Story } from '@/lib/server/podcast/types';
import { MarkdownView } from '@/components/notion/MarkdownView';
import { cn } from '@/lib/cn';
import { Player } from './Player';
import { ResearchNotice } from './ResearchNotice';
import { api, fileUrl, fmtBytes, fmtDay, fmtSecs, fmtUsd, researchHealth } from './podcast-client';

type Tab = 'notes' | 'stories' | 'transcript' | 'run';
const TABS: { id: Tab; label: string }[] = [
  { id: 'notes', label: 'Show notes' },
  { id: 'stories', label: 'Stories' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'run', label: 'Run details' },
];

const EVIDENCE: Record<Story['evidence'], { label: string; cls: string }> = {
  'verified-web': { label: 'verified', cls: 'border-green/40 text-green' },
  'primary-abstract': { label: 'preprint', cls: 'border-teal/40 text-teal' },
  'feed-summary': { label: 'unverified', cls: 'border-amber/40 text-amber' },
  internal: { label: 'internal', cls: 'border-purple/40 text-purple' },
};

interface Detail {
  episode: EpisodeRecord;
  notes: string;
  script: string;
}

export function EpisodeView({ episode, config, busy, external, onRegenerate }: { episode: EpisodeRecord; config: PodcastConfig; busy: boolean; external: boolean; onRegenerate: (date: string) => void }) {
  const [tab, setTab] = useState<Tab>('notes');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    setDetail(null);
    setErr(null);
    api<Detail>(`/api/podcast/episode?date=${episode.date}`)
      .then((d) => !stop && setDetail(d))
      .catch((e: Error) => !stop && setErr(e.message));
    return () => {
      stop = true;
    };
  }, [episode.date, episode.createdAt]);

  const labelOf = (id: string) => config.topics.find((t) => t.id === id)?.label ?? id;
  const research = researchHealth(episode);

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <Player src={fileUrl(episode.date)} title={episode.title} durationHint={episode.durationSec} />
      {research?.degraded && <ResearchNotice health={research} labelOf={labelOf} />}
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-1" aria-label="Episode sections">
          {(external ? TABS.slice(0, 1) : TABS).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn('h-8 rounded-full border px-3 text-[12px] font-medium transition-colors', tab === t.id ? 'border-orange bg-orange/10 text-paper' : 'border-transparent text-secondary hover:border-subtle hover:text-paper')}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.05em] text-muted">
          {fmtDay(episode.date)} · {Math.round(episode.durationSec / 60)} min · {fmtBytes(episode.bytes)}{external ? '' : ` · ${episode.stories.length} stories`}
        </span>
        {!external && <button
          type="button"
          disabled={busy}
          onClick={() => onRegenerate(episode.date)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-subtle px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-secondary hover:border-highlight hover:text-paper disabled:opacity-40"
        >
          <RefreshCw className="h-3 w-3" /> Regenerate
        </button>}
      </div>

      <div className="rounded-lg border border-subtle bg-panel p-5">
        {err && <p className="font-mono text-[11px] text-[#EF4444]">{err}</p>}
        {!detail && !err && <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Loading...</p>}
        {detail && tab === 'notes' && <MarkdownView md={detail.notes} />}
        {tab === 'stories' && (
          <ul className="space-y-5">
            {episode.stories.map((s) => (
              <li key={s.id} className="border-b border-subtle/60 pb-4 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] text-muted">{s.id}</span>
                  <span className={cn('rounded-full border px-2 py-px font-mono text-[9.5px] uppercase tracking-[0.05em]', EVIDENCE[s.evidence].cls)}>{EVIDENCE[s.evidence].label}</span>
                  <span className="rounded-full border border-subtle px-2 py-px font-mono text-[9.5px] uppercase tracking-[0.05em] text-secondary">{labelOf(s.topic)}</span>
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.05em] text-muted">
                    conf {s.confidence}
                    {s.jev !== null ? ` · jev ${s.jev.toFixed(2)}` : ''} · score {s.score.toFixed(2)}
                  </span>
                </div>
                <p className="mt-1.5 text-[14px] font-semibold text-paper">{s.headline}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-secondary">{s.whatHappened}</p>
                {s.whyItMatters && <p className="mt-1 text-[12.5px] leading-relaxed text-secondary"><span className="text-paper">Why it matters.</span> {s.whyItMatters}</p>}
                <ul className="mt-2 space-y-1">
                  {s.sources.map((x) => (
                    <li key={`${x.url}${x.title}`} className="text-[12px]">
                      {x.url ? (
                        <a href={x.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-orange hover:underline">
                          {x.title || x.url} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-secondary">{x.title}</span>
                      )}
                      {x.publisher && <span className="ml-1.5 text-muted">{x.publisher}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {detail && tab === 'transcript' && (
          <div className="space-y-2">
            {detail.script.split('\n').filter(Boolean).map((l, i) => {
              const at = l.indexOf(':');
              const who = l.slice(0, at);
              const first = who === config.hosts[0].name;
              return (
                <p key={i} className="text-[13px] leading-relaxed text-secondary">
                  <span className={cn('mr-2 font-mono text-[10.5px] font-semibold uppercase', first ? 'text-orange' : 'text-teal')}>{who}</span>
                  {l.slice(at + 1).trim()}
                </p>
              );
            })}
          </div>
        )}
        {tab === 'run' && (
          <div className="space-y-4 text-[12.5px] text-secondary">
            <dl className="grid grid-cols-[130px_1fr] gap-y-1.5">
              <dt className="text-muted">Script</dt>
              <dd className="font-mono text-paper">{episode.words} words · {episode.scriptBackend}</dd>
              <dt className="text-muted">Voices</dt>
              <dd className="font-mono text-paper">{episode.ttsModel}</dd>
              <dt className="text-muted">Audio cost</dt>
              <dd className="font-mono text-paper">{fmtUsd(episode.cost.ttsUsd)} <span className="text-muted">({episode.cost.ttsAudioTokens.toLocaleString()} audio + {episode.cost.ttsInputTokens.toLocaleString()} text tokens)</span></dd>
              <dt className="text-muted">Claude steps</dt>
              <dd className="font-mono text-paper">Max plan, not billed <span className="text-muted">(list-price equivalent {fmtUsd(episode.cost.claudeListUsd)})</span></dd>
              <dt className="text-muted">Research</dt>
              <dd className={cn('font-mono', research?.degraded ? 'text-amber' : 'text-paper')}>
                {research ? `${research.succeeded}/${research.attempted} topics${research.degraded ? ' (limited)' : ''} · ` : ''}
                {fmtSecs(episode.researchMs)} wall clock
              </dd>
              <dt className="text-muted">Ranking</dt>
              <dd className="font-mono text-paper">{episode.jevUsed ? 'JEV + heuristics' : 'heuristics only (JEV unavailable)'}</dd>
              <dt className="text-muted">File</dt>
              <dd className="break-all font-mono text-paper">{episode.file}</dd>
            </dl>
            <table className="w-full text-left">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                  <th className="py-1 font-medium">Stage</th>
                  <th className="py-1 font-medium">Time</th>
                  <th className="py-1 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {episode.timings.map((t) => (
                  <tr key={t.stage} className="border-t border-subtle/60">
                    <td className="py-1.5 font-mono text-paper">{t.stage}</td>
                    <td className="py-1.5 font-mono">{fmtSecs(t.ms)}</td>
                    <td className="py-1.5 text-muted">{t.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {episode.warnings.length > 0 && (
              <ul className="space-y-1 border-t border-subtle/60 pt-3">
                {episode.warnings.map((w) => (
                  <li key={w} className="text-[12px] text-amber">
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
