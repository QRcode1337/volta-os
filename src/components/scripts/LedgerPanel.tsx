'use client';
import { useMemo } from 'react';
import type { NotionPageDoc, VpItem } from '@/types/notion';
import { cn } from '@/lib/cn';
import { parseTables } from '@/lib/notion-md';
import { stripMarkdown } from '@/lib/text';
import { ErrorNotice, ExternalPill, NoAccessNotice, Skeleton, fmtDay } from '@/components/notion/NotionBits';
import { MarkdownView, renderInline, toneFor } from '@/components/notion/MarkdownView';
import type { Remote } from '@/components/notion/useRemote';

interface Claim {
  beat: string;
  claim: string;
  source: string;
  tier: string;
}

/** The first table that has a tier/status/verification column: one row per claim. */
function extractClaims(page: NotionPageDoc): Claim[] {
  for (const s of page.sections) {
    for (const t of parseTables(s.markdown)) {
      const col = (re: RegExp) => t.headers.findIndex((h) => re.test(h));
      const tier = col(/tier|status|verif|confidence/i);
      const claim = col(/claim|item|statement|finding/i);
      if (tier < 0 || claim < 0) continue;
      const beat = col(/beat|part|section|episode|topic/i);
      const source = col(/source|evidence|cite/i);
      return t.rows.map((r) => ({ beat: beat >= 0 ? (r[beat] ?? '') : '', claim: r[claim] ?? '', source: source >= 0 ? (r[source] ?? '') : '', tier: r[tier] ?? '' }));
    }
  }
  return [];
}

const tierGroup = (t: string): 'verified' | 'legend' | 'other' => {
  const x = t.toLowerCase();
  if (/verified|confirmed|approved/.test(x)) return 'verified';
  if (/legend|folklore|speculation|unverified|unproven|contested|rumou?r/.test(x)) return 'legend';
  return 'other';
};

/** Some ledgers use short tier codes and explain them in a "Tiers: VD = verified document · PT = primary text …" line. */
function tierLegend(page: NotionPageDoc): { line: string | null; codes: Map<string, string> } {
  const codes = new Map<string, string>();
  const line = page.markdown.split('\n').find((l) => /^\s*\**Tiers?:?\**\s*\S+\s*=/.test(l)) ?? null;
  if (line) for (const part of stripMarkdown(line).replace(/^Tiers?:?\s*/i, '').split(/\s+[·;]\s+/)) {
    const m = part.match(/^([A-Za-z/]{1,6})\s*=\s*(.+)$/);
    if (m) codes.set(m[1].toUpperCase(), m[2].trim());
  }
  return { line: line ? stripMarkdown(line) : null, codes };
}

/** "VD" -> "verified document"; "SR — verify" -> "secondary reporting — verify"; full words pass through. */
function expandTier(raw: string, codes: Map<string, string>): string {
  const t = stripMarkdown(raw);
  const m = t.match(/^([A-Za-z/]{1,6})(?=$|[\s(—–-])/);
  const full = m ? codes.get(m[1].toUpperCase()) : undefined;
  return full ? `${full}${t.slice(m![1].length)}` : t;
}

/** Right column: the episode's Source Ledger (claims with verification tier, sources, open items). */
export function LedgerPanel({ ledger, evidence, evidenceId, onEvidence, fallbackTitle, fallbackUrl }: { ledger: Remote<NotionPageDoc>; evidence: VpItem[]; evidenceId: string | null; onEvidence: (id: string | null) => void; fallbackTitle: string; fallbackUrl: string | null }) {
  const d = ledger.data;
  const claims = useMemo(() => (d ? extractClaims(d) : []), [d]);
  const legend = useMemo(() => (d ? tierLegend(d) : { line: null, codes: new Map<string, string>() }), [d]);
  const counts = useMemo(() => {
    const c = { verified: 0, legend: 0, other: 0 };
    for (const x of claims) c[tierGroup(expandTier(x.tier, legend.codes))]++;
    return c;
  }, [claims, legend]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {evidence.length > 0 && (
        <div className="flex shrink-0 gap-1.5 border-b border-subtle px-3 py-2" role="tablist" aria-label="Ledger or evidence">
          <button type="button" role="tab" aria-selected={evidenceId === null} onClick={() => onEvidence(null)} className={cn('h-6 rounded-full px-2.5 font-mono text-[10px] font-semibold', evidenceId === null ? 'bg-paper text-obsidian' : 'border border-subtle text-secondary hover:text-paper')}>
            Source ledger
          </button>
          {evidence.map((e) => (
            <button key={e.id} type="button" role="tab" aria-selected={evidenceId === e.id} onClick={() => onEvidence(e.id)} className={cn('h-6 max-w-[180px] truncate rounded-full px-2.5 font-mono text-[10px] font-semibold', evidenceId === e.id ? 'bg-paper text-obsidian' : 'border border-subtle text-secondary hover:text-paper')} title={e.title}>
              Evidence pack
            </button>
          ))}
        </div>
      )}

      {ledger.status === 'error' ? (
        ledger.noAccess ? (
          <NoAccessNotice title={fallbackTitle} url={fallbackUrl ?? undefined} />
        ) : (
          <ErrorNotice message={ledger.error ?? 'Failed to load'} onRetry={() => ledger.reload()} />
        )
      ) : !d ? (
        <Skeleton lines={10} />
      ) : (
        <div className="hud-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-subtle px-4 py-3">
            <p className="text-[13px] font-semibold leading-snug text-paper">{d.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted">
              <span>{d.lastEdited ? `edited ${fmtDay(d.lastEdited)}` : ''}</span>
              <ExternalPill href={d.url} className="ml-auto" />
            </div>
            {claims.length > 0 && (
              <div className="mt-3">
                <div className="flex h-2 overflow-hidden rounded-full bg-panel-hover" role="img" aria-label={`${counts.verified} verified, ${counts.legend} legend or folklore, ${counts.other} other`}>
                  <span className="bg-green" style={{ width: `${(counts.verified / claims.length) * 100}%` }} />
                  <span className="bg-amber" style={{ width: `${(counts.legend / claims.length) * 100}%` }} />
                  <span className="bg-highlight" style={{ width: `${(counts.other / claims.length) * 100}%` }} />
                </div>
                <p className="mt-1.5 font-mono text-[10px] text-muted">
                  {claims.length} claims · <span className="text-green">{counts.verified} verified</span> · <span className="text-amber">{counts.legend} legend / folklore / contested</span>
                  {counts.other > 0 && ` · ${counts.other} other`}
                </p>
              </div>
            )}
          </div>

          {claims.length > 0 && (
            <div className="border-b border-subtle px-3 pt-3">
              {legend.line && <p className="mb-2 rounded border border-subtle bg-obsidian/40 px-2 py-1 font-mono text-[10px] leading-snug text-muted">{legend.line}</p>}
            </div>
          )}
          {claims.length > 0 && (
            <ul className="space-y-2 border-b border-subtle px-3 py-3" aria-label="Claims">
              {claims.map((c, i) => (
                <li key={i} className="rounded-lg border border-subtle bg-obsidian/40 p-2.5">
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-muted">{stripMarkdown(c.beat) || `Claim ${i + 1}`}</span>
                    {c.tier && (
                      <span className={cn('shrink-0 rounded-full border px-2 py-px font-mono text-[9.5px] font-semibold', toneFor(expandTier(c.tier, legend.codes)))} title={expandTier(c.tier, legend.codes)}>
                        {stripMarkdown(c.tier)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12.5px] leading-snug text-paper">{renderInline(c.claim)}</p>
                  {c.source && <p className="mt-1 text-[11.5px] leading-snug text-secondary">{renderInline(c.source)}</p>}
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-1 px-3 py-3">
            {d.sections
              .filter((s) => !(claims.length > 0 && /source ledger/i.test(s.title)))
              .map((s) => (
                <details key={s.id} open={/thesis|open items|overview/i.test(s.title) || s.level === 0} className="group rounded-md border border-subtle">
                  <summary className="cursor-pointer select-none px-2.5 py-1.5 text-[12px] font-semibold text-secondary hover:text-paper">{s.title}</summary>
                  <div className="border-t border-subtle px-2.5 py-2">
                    <MarkdownView md={s.markdown} compact />
                  </div>
                </details>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
