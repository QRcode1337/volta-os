'use client';
import { useEffect, useMemo } from 'react';
import { ArtCanvas } from './ArtCanvas';
import { ASPECT_BY_ID, MODEL_BY_ID, headlineFromPrompt, type GenItem } from './data';
import { styleProfile, type StyleProfile } from './style';
import { VariantBadge, MediaTypeChip } from './GenCard';
import { Modal, formatStamp } from './ui';
import { cn } from '@/lib/cn';
import { formatUsd } from '@/lib/format';

/** Large preview sized to fit the viewport for any aspect. */
function BigPreview({ item, maxVh = 74 }: { item: GenItem; maxVh?: number }) {
  const a = ASPECT_BY_ID[item.aspect];
  const landscape = a.w > a.h;
  return (
    <div className="mx-auto overflow-hidden rounded-lg border border-subtle bg-obsidian" style={{ width: `min(100%, calc(${maxVh}vh * ${a.w} / ${a.h}))` }}>
      <ArtCanvas item={item} width={landscape ? 1280 : 900} mode={item.mediaType === 'animation' ? 'playing' : 'still'} />
    </div>
  );
}

function Swatches({ colors }: { colors: string[] }) {
  return (
    <div className="flex items-center gap-1">
      {colors.map((c) => (
        <span key={c} title={c} className="h-4 w-4 rounded-[3px] border border-white/10" style={{ background: c }} />
      ))}
    </div>
  );
}

// ───────────────────────── Lightbox ─────────────────────────

export function Lightbox({
  item,
  onClose,
  onPrev,
  onNext,
  onPromote,
  onSend,
  promoting,
}: {
  item: GenItem | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPromote: (item: GenItem) => void;
  onSend: (item: GenItem) => void;
  promoting: boolean;
}) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onPrev, onNext]);
  const profile = useMemo(() => (item ? styleProfile(item) : null), [item]);
  if (!item || !profile) return null;
  const spec = MODEL_BY_ID[item.model];
  return (
    <Modal open onClose={onClose} label="Generation preview" className="flex w-[min(1320px,96vw)] flex-col lg:flex-row">
      <div className="relative flex min-w-0 flex-1 items-center justify-center bg-obsidian p-5">
        <BigPreview item={item} />
        <button type="button" onClick={onPrev} className="absolute left-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full border border-subtle bg-panel/90 text-secondary hover:text-paper" aria-label="Previous">
          ‹
        </button>
        <button type="button" onClick={onNext} className="absolute right-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full border border-subtle bg-panel/90 text-secondary hover:text-paper" aria-label="Next">
          ›
        </button>
      </div>
      <aside className="hud-scroll flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-t border-subtle p-5 lg:max-h-[86vh] lg:w-[340px] lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between">
          <VariantBadge variant={item.variant} size="md" />
          <button type="button" onClick={onClose} className="font-mono text-[11px] text-muted hover:text-paper">
            ESC ✕
          </button>
        </div>
        <div>
          <p className="hud-label mb-1">Prompt</p>
          <p className="selectable text-[14px] leading-snug text-paper">{item.prompt}</p>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            Headline → <span className="text-orange">{headlineFromPrompt(item.prompt)}</span>
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-lg border border-subtle bg-panel-elevated p-3 font-mono text-[10.5px] uppercase">
          <dt className="text-muted">Model</dt>
          <dd className="text-paper">{spec.label}</dd>
          <dt className="text-muted">Vendor</dt>
          <dd className="text-secondary">{spec.vendor}</dd>
          <dt className="text-muted">Type</dt>
          <dd>
            <MediaTypeChip item={item} />
          </dd>
          <dt className="text-muted">Aspect</dt>
          <dd className="text-secondary">{ASPECT_BY_ID[item.aspect].label}</dd>
          <dt className="text-muted">Seed</dt>
          <dd className="font-doto text-[13px] text-paper">{item.seed}</dd>
          <dt className="text-muted">Cost</dt>
          <dd className="text-green">{formatUsd(item.cost)}</dd>
          <dt className="text-muted">Created</dt>
          <dd className="text-secondary">{formatStamp(item.createdAt)}</dd>
        </dl>
        <div>
          <p className="hud-label mb-2">{profile.styleName}</p>
          <Swatches colors={profile.palette} />
          <ul className="mt-2.5 space-y-1.5">
            {profile.rules.map((r) => (
              <li key={r} className="flex gap-2 text-[12px] leading-snug text-secondary">
                <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-orange" />
                {r}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <button
            type="button"
            disabled={item.promoted || promoting}
            onClick={() => onPromote(item)}
            className={cn(
              'h-9 rounded-md border font-mono text-[11px] font-semibold uppercase tracking-[0.06em]',
              item.promoted ? 'border-amber/40 bg-amber/10 text-amber' : 'border-amber bg-amber text-obsidian hover:brightness-110',
            )}
          >
            {item.promoted ? '★ Promoted to /thumb Database' : promoting ? 'Promoting…' : '⭐ Promote to /thumb Database'}
          </button>
          <button type="button" onClick={() => onSend(item)} className="h-9 rounded-md border border-orange bg-orange/10 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-orange hover:bg-orange hover:text-obsidian">
            {item.sentToEditor ? '✓ Sent — Send Again to VOLTA Editor' : 'Send to VOLTA Editor'}
          </button>
        </div>
      </aside>
    </Modal>
  );
}

// ───────────────────────── Comparator ─────────────────────────

const ROWS: { key: keyof StyleProfile; label: string }[] = [
  { key: 'styleName', label: 'Style' },
  { key: 'layout', label: 'Layout' },
  { key: 'typography', label: 'Typography' },
  { key: 'texture', label: 'Texture' },
  { key: 'subject', label: 'Subject' },
];

export function Comparator({
  pair,
  onClose,
  onSwap,
  onPromote,
}: {
  pair: [GenItem, GenItem] | null;
  onClose: () => void;
  onSwap: () => void;
  onPromote: (item: GenItem) => void;
}) {
  const profiles = useMemo(() => (pair ? pair.map((p) => styleProfile(p)) : null), [pair]);
  if (!pair || !profiles) return null;
  return (
    <Modal open onClose={onClose} label="Standard vs Wildcard comparator" className="hud-scroll flex w-[min(1400px,96vw)] flex-col overflow-y-auto" >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-subtle px-5">
        <span className="hud-label">⇄ Side-by-side comparator</span>
        <span className="font-mono text-[10px] uppercase text-muted">A/B the 80% brand lane against the 20% wildcard lane</span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onSwap} className="h-7 rounded-full border border-subtle px-3 font-mono text-[10px] uppercase text-secondary hover:text-paper">
            ⇆ Swap
          </button>
          <button type="button" onClick={onClose} className="h-7 rounded-full border border-subtle px-3 font-mono text-[10px] uppercase text-secondary hover:text-paper">
            Close ✕
          </button>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-px bg-subtle md:grid-cols-2">
        {pair.map((item, i) => (
          <div key={item.id} className="flex flex-col gap-3 bg-panel p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange font-doto text-lg text-obsidian">{i === 0 ? 'A' : 'B'}</span>
              <VariantBadge variant={item.variant} size="md" />
              <span className="ml-auto font-mono text-[10px] uppercase text-muted">
                {MODEL_BY_ID[item.model].label} · seed {item.seed}
              </span>
            </div>
            <div className="flex min-h-[200px] items-center justify-center rounded-lg bg-obsidian p-2">
              <BigPreview item={item} maxVh={44} />
            </div>
            <p className="line-clamp-2 text-[13px] text-paper">{item.prompt}</p>
          </div>
        ))}
      </div>
      <table className="w-full border-t border-subtle text-left">
        <tbody>
          <tr className="border-b border-subtle">
            <th className="w-[140px] px-5 py-2.5 font-mono text-[10px] font-semibold uppercase text-muted">Palette</th>
            {profiles.map((p, i) => (
              <td key={i} className="px-5 py-2.5">
                <Swatches colors={p.palette} />
              </td>
            ))}
          </tr>
          {ROWS.map((r) => (
            <tr key={r.key} className="border-b border-subtle">
              <th className="px-5 py-2.5 font-mono text-[10px] font-semibold uppercase text-muted">{r.label}</th>
              {profiles.map((p, i) => {
                const val = String(p[r.key]);
                const differs = String(profiles[1 - i][r.key]) !== val;
                return (
                  <td key={i} className={cn('px-5 py-2.5 text-[12.5px]', differs ? 'text-paper' : 'text-muted')}>
                    {val}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <th className="px-5 py-3 font-mono text-[10px] font-semibold uppercase text-muted">Verdict</th>
            {pair.map((item) => (
              <td key={item.id} className="px-5 py-3">
                <button
                  type="button"
                  disabled={item.promoted}
                  onClick={() => onPromote(item)}
                  className={cn(
                    'h-8 rounded-md border px-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em]',
                    item.promoted ? 'border-amber/40 text-amber' : 'border-amber bg-amber text-obsidian hover:brightness-110',
                  )}
                >
                  {item.promoted ? '★ Already in /thumb' : '⭐ Promote this one'}
                </button>
                <span className="ml-3 font-mono text-[10px] uppercase text-muted">{formatUsd(item.cost)}</span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </Modal>
  );
}

// ───────────────────────── Promote diff ─────────────────────────

type DiffLine = { kind: 'ctx' | 'add' | 'del' | 'gap'; text: string; n?: number };

export function lineDiff(before: string, after: string, context = 3): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const out: DiffLine[] = [];
  const ctxStart = Math.max(0, pre - context);
  if (ctxStart > 0) out.push({ kind: 'gap', text: `… ${ctxStart} unchanged lines` });
  for (let i = ctxStart; i < pre; i++) out.push({ kind: 'ctx', text: b[i], n: i + 1 });
  for (let i = pre; i < a.length - suf; i++) out.push({ kind: 'del', text: a[i] });
  for (let i = pre; i < b.length - suf; i++) out.push({ kind: 'add', text: b[i], n: i + 1 });
  const tailEnd = Math.min(b.length, b.length - suf + context);
  for (let i = b.length - suf; i < tailEnd; i++) out.push({ kind: 'ctx', text: b[i], n: i + 1 });
  if (tailEnd < b.length) out.push({ kind: 'gap', text: `… ${b.length - tailEnd} unchanged lines` });
  return out;
}

export interface PromoteResult {
  item: GenItem;
  path: string;
  before: string;
  after: string;
  created?: boolean;
}

export function PromoteDiffModal({ result, onClose }: { result: PromoteResult | null; onClose: () => void }) {
  const lines = useMemo(() => (result ? lineDiff(result.before, result.after) : []), [result]);
  if (!result) return null;
  const added = lines.filter((l) => l.kind === 'add').length;
  const removed = lines.filter((l) => l.kind === 'del').length;
  return (
    <Modal open onClose={onClose} label="Promotion diff" className="flex w-[min(860px,94vw)] flex-col">
      <header className="flex items-center gap-3 border-b border-subtle px-5 py-3.5">
        <span className="text-xl">⭐</span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-paper">Promoted to the /thumb database</p>
          <p className="font-mono text-[10.5px] text-muted">
            {result.path} {result.created && <span className="text-amber">(created)</span>} · <span className="text-green">+{added}</span>{' '}
            <span className="text-[#EF4444]">−{removed}</span> · under <span className="text-secondary">## Learned Preferences (RL Log)</span>
          </p>
        </div>
        <button type="button" onClick={onClose} className="ml-auto h-7 rounded-full border border-subtle px-3 font-mono text-[10px] uppercase text-secondary hover:text-paper">
          Done
        </button>
      </header>
      <pre className="hud-scroll selectable max-h-[60vh] overflow-auto bg-obsidian py-3 font-mono text-[11.5px] leading-[1.6]">
        {lines.map((l, i) => (
          <div
            key={i}
            className={cn(
              'flex gap-3 px-4',
              l.kind === 'add' && 'bg-green/10 text-green',
              l.kind === 'del' && 'bg-[#EF4444]/10 text-[#EF4444]',
              l.kind === 'ctx' && 'text-muted',
              l.kind === 'gap' && 'italic text-muted/70',
            )}
          >
            <span className="w-8 shrink-0 select-none text-right opacity-60">{l.n ?? ''}</span>
            <span className="w-3 shrink-0 select-none">{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}</span>
            <span className="whitespace-pre-wrap break-words">{l.text || ' '}</span>
          </div>
        ))}
      </pre>
    </Modal>
  );
}
