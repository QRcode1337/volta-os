'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { seededRandom } from '@/lib/mock-data';
import { pushToEditorInbox } from '@/lib/editor-inbox';
import { formatUsd } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  ASPECTS,
  BATCH_SIZES,
  MEDIA_MODELS,
  MODEL_BY_ID,
  SEED_GEN_ITEMS,
  hashString,
  headlineFromPrompt,
  wildcardCount,
  type AspectId,
  type GenItem,
  type MediaModelId,
} from './data';
import { GenCard, PendingCard } from './GenCard';
import { Comparator, Lightbox, PromoteDiffModal, type PromoteResult } from './GenModals';
import { MediaKeyframes, MediaTopBar, ToastStack, loadJSON, saveJSON, useToasts } from './ui';

const STORAGE_KEY = 'rubric:generations:v1';
const GEN_MS = 1500;

type Filter = 'all' | 'thumb' | 'animate' | 'wildcard';
const FILTERS: { id: Filter; label: string; tag?: string }[] = [
  { id: 'all', label: 'All Media' },
  { id: 'thumb', label: 'YouTube Thumbnails', tag: '/thumb' },
  { id: 'animate', label: 'Video Animations', tag: '/animate' },
  { id: 'wildcard', label: 'Wildcard Lab', tag: '/wildcard' },
];

function matches(item: GenItem, f: Filter) {
  if (f === 'thumb') return item.mediaType === 'thumbnail';
  if (f === 'animate') return item.mediaType === 'animation';
  if (f === 'wildcard') return item.variant === 'wildcard';
  return true;
}

interface PendingBatch {
  batchId: string;
  prompt: string;
  model: MediaModelId;
  aspect: AspectId;
  slots: { seed: number; variant: GenItem['variant'] }[];
  progress: number;
}

const selectCls =
  'h-9 rounded-md border border-subtle bg-panel-elevated px-2.5 font-mono text-[11px] text-paper outline-none transition-colors hover:border-highlight focus:border-orange';

export function GenerationsApp() {
  const [items, setItems] = useState<GenItem[]>(SEED_GEN_ITEMS);
  const [hydrated, setHydrated] = useState(false);
  const [prompt, setPrompt] = useState('"Claude Skills Explained" creator pointing at glowing terminal');
  const [modelId, setModelId] = useState<MediaModelId>('flux-ultra');
  const [aspect, setAspect] = useState<AspectId>('16:9');
  const [batch, setBatch] = useState<number>(5);
  const [wildcard, setWildcard] = useState(true);
  const [pending, setPending] = useState<PendingBatch | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparatorOpen, setComparatorOpen] = useState(false);
  const [promoting, setPromoting] = useState<Set<string>>(() => new Set());
  const [promoteResult, setPromoteResult] = useState<PromoteResult | null>(null);
  const { toasts, push, dismiss } = useToasts();
  const timerRef = useRef<number | null>(null);
  const promptRef = useRef<HTMLInputElement>(null);

  // hydrate from localStorage (params + seeds only, never pixels)
  useEffect(() => {
    const stored = loadJSON<GenItem[]>(STORAGE_KEY);
    if (Array.isArray(stored) && stored.length && stored.every((i) => i && typeof i.seed === 'number' && i.model in MODEL_BY_ID)) {
      setItems(stored);
    }
    setHydrated(true);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);
  useEffect(() => {
    if (hydrated) saveJSON(STORAGE_KEY, items);
  }, [items, hydrated]);

  const spec = MODEL_BY_ID[modelId];
  const wc = wildcardCount(batch, wildcard);
  const batchCost = batch * spec.costPerItem;
  const visible = useMemo(() => items.filter((i) => matches(i, filter)), [items, filter]);
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, items.filter((i) => matches(i, f.id)).length])) as Record<Filter, number>,
    [items],
  );
  const totalSpend = useMemo(() => items.reduce((s, i) => s + i.cost, 0), [items]);
  const promotedCount = useMemo(() => items.filter((i) => i.promoted).length, [items]);

  const patchItem = useCallback((id: string, patch: Partial<GenItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  // ── generate (simulated) ──
  const generate = useCallback(() => {
    if (pending) return;
    const p = prompt.trim() || 'Untitled /robo thumbnail';
    const nonce = (Date.now() & 0x7fffffff) >>> 0; // event handler, not render
    const rnd = seededRandom((hashString(`${p}|${modelId}|${aspect}`) ^ nonce) >>> 0);
    const order = Array.from({ length: batch }, (_, i) => i).sort(() => rnd() - 0.5);
    const wildSet = new Set(order.slice(0, wc));
    const slots = Array.from({ length: batch }, (_, i) => ({
      seed: 1000 + Math.floor(rnd() * 98_000),
      variant: (wildSet.has(i) ? 'wildcard' : 'standard') as GenItem['variant'],
    }));
    const batchId = `b-${nonce.toString(36)}`;
    const job: PendingBatch = { batchId, prompt: p, model: modelId, aspect, slots, progress: 0 };
    setPending(job);
    const start = performance.now();
    timerRef.current = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - start) / GEN_MS);
      if (progress < 1) {
        setPending((cur) => (cur ? { ...cur, progress } : cur));
        return;
      }
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      const m = MODEL_BY_ID[job.model];
      const createdAt = new Date().toISOString();
      const fresh: GenItem[] = job.slots.map((slot, i) => ({
        id: `${batchId}-${i + 1}`,
        batchId,
        prompt: job.prompt,
        model: job.model,
        aspect: job.aspect,
        seed: slot.seed,
        variant: slot.variant,
        mediaType: m.kind === 'video' ? 'animation' : 'thumbnail',
        cost: m.costPerItem,
        createdAt,
      }));
      setItems((prev) => [...fresh, ...prev]);
      setPending(null);
      const wild = fresh.filter((f) => f.variant === 'wildcard').length;
      push({
        tone: 'ok',
        message: `${fresh.length} ${m.kind === 'video' ? 'animations' : 'images'} from ${m.label} · ${fresh.length - wild} standard + ${wild} wildcard · ${formatUsd(fresh.length * m.costPerItem)}`,
      });
    }, 50);
  }, [pending, prompt, modelId, aspect, batch, wc, push]);

  // ── promote ──
  const promote = useCallback(
    async (item: GenItem) => {
      if (item.promoted) return;
      setPromoting((s) => new Set(s).add(item.id));
      try {
        const res = await fetch('/api/media/promote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.id,
            prompt: item.prompt,
            model: item.model,
            aspect: item.aspect,
            seed: item.seed,
            variant: item.variant,
            mediaType: item.mediaType,
            cost: item.cost,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as Partial<PromoteResult> & { error?: string };
        if (!res.ok || typeof data.after !== 'string') throw new Error(data.error ?? `HTTP ${res.status}`);
        patchItem(item.id, { promoted: true });
        setPromoteResult({ item, path: data.path ?? 'workspace/skills/thumb/SKILL.md', before: data.before ?? '', after: data.after, created: data.created });
      } catch (err) {
        push({ tone: 'error', message: `Promote failed — ${(err as Error).message}. Gallery is unchanged.` }, 6000);
      } finally {
        setPromoting((s) => {
          const n = new Set(s);
          n.delete(item.id);
          return n;
        });
      }
    },
    [patchItem, push],
  );

  // ── send to editor ──
  const sendToEditor = useCallback(
    (item: GenItem) => {
      const m = MODEL_BY_ID[item.model];
      const waiting = pushToEditorInbox({
        id: `gen-${item.id}-${Date.now().toString(36)}`,
        title: `${headlineFromPrompt(item.prompt)}${item.variant === 'wildcard' ? ' (Wildcard)' : ''}`,
        kind: item.mediaType === 'animation' ? 'ANIMATION' : 'A-ROLL CUT',
        durationSec: item.mediaType === 'animation' ? (m.clipSec ?? 5) : 3,
        source: 'generations',
        sceneKey: 'title-reveal',
        createdAt: new Date().toISOString(),
      });
      patchItem(item.id, { sentToEditor: true });
      push({ tone: 'ok', message: `Sent “${headlineFromPrompt(item.prompt)}” to the VOLTA Editor inbox (${waiting} waiting).`, href: '/apps/editor', hrefLabel: 'Open VOLTA Editor' });
    },
    [patchItem, push],
  );

  // ── compare ──
  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-2)));
  }, []);
  const autoPair = () => {
    const std = visible.find((i) => i.variant === 'standard') ?? items.find((i) => i.variant === 'standard');
    const wild = visible.find((i) => i.variant === 'wildcard') ?? items.find((i) => i.variant === 'wildcard');
    if (std && wild) {
      setCompareIds([std.id, wild.id]);
      setComparatorOpen(true);
    }
  };
  const pair = useMemo(() => {
    const a = items.find((i) => i.id === compareIds[0]);
    const b = items.find((i) => i.id === compareIds[1]);
    return a && b ? ([a, b] as [GenItem, GenItem]) : null;
  }, [items, compareIds]);

  // ── lightbox nav ──
  const lightboxItem = useMemo(() => items.find((i) => i.id === lightboxId) ?? null, [items, lightboxId]);
  const step = useCallback(
    (dir: 1 | -1) => {
      if (!lightboxId || !visible.length) return;
      const idx = visible.findIndex((i) => i.id === lightboxId);
      const next = visible[(idx + dir + visible.length) % visible.length];
      setLightboxId(next.id);
    },
    [lightboxId, visible],
  );
  const closeLightbox = useCallback(() => setLightboxId(null), []);
  const prev = useCallback(() => step(-1), [step]);
  const next = useCallback(() => step(1), [step]);

  // keyboard: "/" focuses prompt, "c" toggles compare
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (typing || lightboxId || comparatorOpen || promoteResult) return;
      if (e.key === '/') {
        e.preventDefault();
        promptRef.current?.focus();
      } else if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey) {
        setCompareMode((v) => !v);
      } else if (e.key === 'Escape' && compareMode) {
        setCompareMode(false);
        setCompareIds([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxId, comparatorOpen, promoteResult, compareMode]);

  const resetGallery = () => {
    setItems(SEED_GEN_ITEMS);
    setCompareIds([]);
    push({ tone: 'info', message: 'Gallery reset to the 16 seed generations.' });
  };

  const pendingKind = pending ? MODEL_BY_ID[pending.model].kind : null;
  const showPending =
    !!pending &&
    (filter === 'all' ||
      (filter === 'wildcard' && pending.slots.some((s) => s.variant === 'wildcard')) ||
      (filter === 'thumb' && pendingKind === 'image') ||
      (filter === 'animate' && pendingKind === 'video'));

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <MediaKeyframes />
      <MediaTopBar
        title="Generations"
        accent="LAB"
        subtitle="Direct image & video model gallery"
        right={
          <>
            <span className="hud-label hidden lg:inline">
              {items.length} assets · <span className="text-green">{formatUsd(totalSpend)}</span> spent · <span className="text-amber">{promotedCount} ★</span>
            </span>
            <button type="button" onClick={resetGallery} className="h-7 rounded-full border border-subtle px-3 font-mono text-[10px] uppercase tracking-[0.06em] text-muted hover:text-paper">
              ↺ Reset
            </button>
          </>
        }
      />

      {/* ── prompt bar ── */}
      <section className="shrink-0 border-b border-subtle bg-panel px-4 py-3">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            generate();
          }}
        >
          <div className="relative min-w-[280px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-orange">›</span>
            <input
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='Describe the asset — put the headline in "quotes"'
              className="h-9 w-full rounded-md border border-subtle bg-obsidian pl-7 pr-12 text-[13px] text-paper outline-none placeholder:text-muted focus:border-orange"
              maxLength={300}
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-subtle px-1.5 font-mono text-[9px] text-muted">/</kbd>
          </div>
          <select aria-label="Model" value={modelId} onChange={(e) => setModelId(e.target.value as MediaModelId)} className={selectCls}>
            {MEDIA_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.kind === 'video' ? `video ${m.clipSec}s` : 'image'} · {formatUsd(m.costPerItem)}
              </option>
            ))}
          </select>
          <select aria-label="Aspect ratio" value={aspect} onChange={(e) => setAspect(e.target.value as AspectId)} className={selectCls}>
            {ASPECTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <select aria-label="Batch size" value={batch} onChange={(e) => setBatch(Number(e.target.value))} className={selectCls}>
            {BATCH_SIZES.map((b) => (
              <option key={b} value={b}>
                ×{b} batch
              </option>
            ))}
          </select>
          <button
            type="button"
            role="switch"
            aria-checked={wildcard}
            onClick={() => setWildcard((v) => !v)}
            className={cn(
              'flex h-9 items-center gap-2 rounded-md border px-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.04em] transition-colors',
              wildcard ? 'border-purple/60 bg-purple/10 text-paper' : 'border-subtle bg-panel-elevated text-muted',
            )}
            title="80% brand-aligned (/thumb + /robo), 20% radically different"
          >
            <span className={cn('relative h-4 w-7 rounded-full transition-colors', wildcard ? 'bg-purple' : 'bg-highlight')}>
              <span className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-paper transition-all', wildcard ? 'left-3.5' : 'left-0.5')} />
            </span>
            <span>
              [{wildcard ? '●' : '○'}] Include 20% /wildcard Variations
            </span>
          </button>
          <button
            type="submit"
            disabled={!!pending}
            className={cn(
              'relative flex h-9 min-w-[150px] items-center justify-center gap-2 overflow-hidden rounded-md border border-orange bg-orange px-4 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-obsidian transition-[filter]',
              pending ? 'cursor-wait' : 'robo-pulse hover:brightness-110',
            )}
          >
            {pending && <span className="absolute inset-y-0 left-0 bg-black/20" style={{ width: `${pending.progress * 100}%` }} />}
            <span className="relative">{pending ? `Rendering ${Math.round(pending.progress * 100)}%` : '⚡ Generate'}</span>
          </button>
        </form>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.05em] text-muted">
          <span>
            Batch plan: <span className="text-orange">{batch - wc} STANDARD (/robo)</span> + <span className="text-purple">{wc} 🃏 WILDCARD</span>
            {wildcard && wc === 0 && <span className="text-amber"> · batch too small for a 20% slot</span>}
          </span>
          <span>
            {spec.kind === 'video' ? `→ ${batch} looping animation${batch > 1 ? 's' : ''} (${spec.clipSec}s)` : `→ ${batch} still${batch > 1 ? 's' : ''}`} · est.{' '}
            <span className="text-green">{formatUsd(batchCost)}</span>
          </span>
          <span className="hidden md:inline">Simulated locally · procedural renderer · no external API calls</span>
        </div>
      </section>

      {/* ── toolbar ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-subtle px-4 py-2">
        <nav className="flex flex-wrap gap-1" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors',
                filter === f.id ? 'border-orange bg-orange/10 text-paper' : 'border-transparent text-secondary hover:border-subtle hover:text-paper',
              )}
            >
              {f.label}
              {f.tag && <span className={cn('font-mono text-[10px]', filter === f.id ? 'text-orange' : 'text-muted')}>({f.tag})</span>}
              <span className="rounded-full bg-panel-elevated px-1.5 font-mono text-[10px] text-muted">{counts[f.id]}</span>
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {compareMode && (
            <span className="font-mono text-[10px] uppercase text-muted">
              Pick two · <span className="text-orange">{compareIds.length}/2</span>
            </span>
          )}
          <button type="button" onClick={autoPair} className="h-8 rounded-full border border-subtle px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-secondary hover:border-highlight hover:text-paper">
            Auto-pair Std vs Wild
          </button>
          <button
            type="button"
            onClick={() => {
              setCompareMode((v) => !v);
              if (compareMode) setCompareIds([]);
            }}
            className={cn(
              'h-8 rounded-full border px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors',
              compareMode ? 'border-orange bg-orange text-obsidian' : 'border-subtle text-secondary hover:border-highlight hover:text-paper',
            )}
          >
            ⇄ Compare mode {compareMode ? 'ON' : ''}
          </button>
        </div>
      </div>

      {/* ── gallery ── */}
      <main className="hud-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4">
        {visible.length === 0 && !showPending ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="font-doto text-4xl text-orange">0</p>
            <p className="text-secondary">Nothing in this lane yet. Generate a batch{filter === 'wildcard' ? ' with the 20% wildcard toggle on' : ''}.</p>
          </div>
        ) : (
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 2xl:columns-4">
            {showPending &&
              pending.slots
                .filter((s) => filter !== 'wildcard' || s.variant === 'wildcard')
                .map((s, i) => <PendingCard key={`${pending.batchId}-${i}`} aspect={pending.aspect} variant={s.variant} seed={s.seed} progress={pending.progress} index={i} />)}
            {visible.map((item) => (
              <GenCard
                key={item.id}
                item={item}
                playing={hoverId === item.id && item.mediaType === 'animation'}
                compareMode={compareMode}
                compareSlot={compareIds.indexOf(item.id)}
                promoting={promoting.has(item.id)}
                onHover={setHoverId}
                onOpen={setLightboxId}
                onToggleCompare={toggleCompare}
                onPromote={promote}
                onSend={sendToEditor}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── compare tray ── */}
      {compareMode && (
        <div className="fixed bottom-14 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-orange/50 bg-panel-elevated/95 px-4 py-2 shadow-[0_16px_50px_rgba(0,0,0,0.6)] backdrop-blur">
          {[0, 1].map((slot) => {
            const it = items.find((i) => i.id === compareIds[slot]);
            return (
              <span key={slot} className="flex items-center gap-2 font-mono text-[10px] uppercase">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange font-doto text-sm text-obsidian">{slot === 0 ? 'A' : 'B'}</span>
                <span className={cn('max-w-[160px] truncate', it ? 'text-paper' : 'text-muted')}>{it ? headlineFromPrompt(it.prompt) : 'click a card'}</span>
                {it && <span className={it.variant === 'wildcard' ? 'text-purple' : 'text-orange'}>{it.variant === 'wildcard' ? '🃏' : 'STD'}</span>}
              </span>
            );
          })}
          <button
            type="button"
            disabled={!pair}
            onClick={() => setComparatorOpen(true)}
            className={cn('h-7 rounded-full px-3 font-mono text-[10px] font-bold uppercase', pair ? 'bg-orange text-obsidian hover:brightness-110' : 'bg-panel text-muted')}
          >
            Open comparator →
          </button>
        </div>
      )}

      <Lightbox item={lightboxItem} onClose={closeLightbox} onPrev={prev} onNext={next} onPromote={promote} onSend={sendToEditor} promoting={!!lightboxItem && promoting.has(lightboxItem.id)} />
      {comparatorOpen && (
        <Comparator
          pair={pair}
          onClose={() => setComparatorOpen(false)}
          onSwap={() => setCompareIds((ids) => [...ids].reverse())}
          onPromote={promote}
        />
      )}
      <PromoteDiffModal result={promoteResult} onClose={() => setPromoteResult(null)} />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

export default GenerationsApp;
