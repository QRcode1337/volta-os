'use client';
import { AlertTriangle } from 'lucide-react';
import type { ResearchHealth } from './podcast-client';

/** Amber notice on an episode whose web research mostly failed: how many topics were covered and the real failure reasons. */
export function ResearchNotice({ health, labelOf }: { health: ResearchHealth; labelOf: (id: string) => string }) {
  const { succeeded, attempted, minOk, skipped, failures, legacy } = health;
  return (
    <section role="alert" className="rounded-lg border border-amber/40 bg-amber/5 px-4 py-3 text-[12.5px] text-paper">
      <p className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
        <span>
          <span className="font-semibold">Limited research.</span>{' '}
          {skipped ? `Web research did not run (${skipped}).` : `Only ${succeeded} of ${attempted} topics were researched on the web (at least ${minOk} expected).`}{' '}
          <span className="text-secondary">{succeeded === 0 ? 'Every story came from Notion, arXiv, RSS and Feeds, with no web-verified sources.' : 'Most stories came from Notion, arXiv, RSS and Feeds.'}</span>
        </span>
      </p>
      {failures.length > 0 && (
        <ul className="mt-2 space-y-1.5 pl-6">
          {failures.map((f) => (
            <li key={f.error} className="text-[12px] leading-snug">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-amber">{f.topics.length === attempted && attempted > 1 ? `all ${attempted} topics` : f.topics.map(labelOf).join(', ')}</span>
              <span className="mt-0.5 block break-words font-mono text-[11px] text-secondary">{f.error}</span>
            </li>
          ))}
        </ul>
      )}
      {legacy && <p className="mt-2 pl-6 text-[11.5px] text-muted">This episode was made before research errors were recorded, so the real failure reason was not kept. Regenerating runs research again and records the cause.</p>}
    </section>
  );
}
