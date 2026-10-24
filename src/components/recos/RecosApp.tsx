'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ShoppingCart, Sparkles } from 'lucide-react';
import { RECOMMENDATIONS } from '@/lib/mock-data';
import { cn } from '@/lib/cn';
import { formatTokens, formatUsd } from '@/lib/format';
import { PixelMascotLogo } from '@/components/robo-ui';
import { CartDrawer } from './CartDrawer';
import { RecoCard } from './RecoCard';
import { ResultsModal, type ApplyResultItem } from './ResultsModal';
import { Toasts, type ToastItem } from './Toasts';
import {
  STORAGE_KEY,
  TABS,
  buildAgentPrompt,
  cartTotals,
  isoWeekLabel,
  matchesTab,
  parsePersisted,
  type PersistedState,
  type RecoStatus,
  type RecoTab,
} from './recos-lib';

const DEFAULT_STATUSES: Record<string, RecoStatus> = Object.fromEntries(RECOMMENDATIONS.map((r) => [r.id, r.status]));
const QUOTA_REMAINING = 32;

const KEYFRAMES = `
@keyframes recos-bump { 0% { transform: scale(1); } 35% { transform: scale(1.45); } 70% { transform: scale(0.92); } 100% { transform: scale(1); } }
@keyframes recos-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes recos-pop { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: none; } }
@keyframes recos-toast { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes recos-card-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.recos-bump { animation: recos-bump 0.45s cubic-bezier(0.34, 1.56, 0.64, 1); }
.recos-fade { animation: recos-fade 0.2s ease-out both; }
.recos-pop { animation: recos-pop 0.28s cubic-bezier(0.22, 1, 0.36, 1) both; }
.recos-toast { animation: recos-toast 0.25s cubic-bezier(0.22, 1, 0.36, 1) both; }
.recos-card-in { animation: recos-card-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both; }
@media (prefers-reduced-motion: reduce) {
  .recos-bump, .recos-fade, .recos-pop, .recos-toast, .recos-card-in { animation: none; }
}
`;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function RecosApp() {
  const [statuses, setStatuses] = useState<Record<string, RecoStatus>>(DEFAULT_STATUSES);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<RecoTab>('priority');
  const [showClosed, setShowClosed] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [results, setResults] = useState<ApplyResultItem[] | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [weekLabel, setWeekLabel] = useState('W—');
  const [bumpKey, setBumpKey] = useState(0);
  const toastSeq = useRef(0);
  const toastTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const prevCartCount = useRef(0);

  // ── Persistence (load after mount → no hydration mismatch) ──
  useEffect(() => {
    let saved: Record<string, RecoStatus> = {};
    try {
      saved = parsePersisted(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      /* storage unavailable: keep defaults */
    }
    setStatuses((s) => ({ ...s, ...saved }));
    setWeekLabel(isoWeekLabel(new Date()));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const payload: PersistedState = { v: 1, statuses };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota / private mode */
    }
  }, [statuses, hydrated]);

  // ── Toasts ──
  const dismissToast = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    const timer = toastTimers.current.get(id);
    if (timer) clearTimeout(timer);
    toastTimers.current.delete(id);
  }, []);

  const pushToast = useCallback(
    (t: Omit<ToastItem, 'id'>, ms = 4500) => {
      const id = ++toastSeq.current;
      setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
      toastTimers.current.set(id, setTimeout(() => dismissToast(id), ms));
    },
    [dismissToast],
  );

  useEffect(() => {
    const timers = toastTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  // ── Derived ──
  const cartItems = useMemo(() => RECOMMENDATIONS.filter((r) => statuses[r.id] === 'in_cart'), [statuses]);
  const cartCount = cartItems.length;
  const isVisible = useCallback(
    (id: string) => {
      const s = statuses[id];
      return showClosed || (s !== 'done' && s !== 'skipped');
    },
    [statuses, showClosed],
  );
  const counts = useMemo(() => {
    const out = {} as Record<RecoTab, number>;
    for (const t of TABS) out[t.id] = RECOMMENDATIONS.filter((r) => matchesTab(r, t.id) && isVisible(r.id)).length;
    return out;
  }, [isVisible]);
  const visible = useMemo(() => {
    const list = RECOMMENDATIONS.filter((r) => matchesTab(r, tab) && isVisible(r.id));
    const closedRank = (id: string) => (statuses[id] === 'done' || statuses[id] === 'skipped' ? 1 : 0);
    return [...list].sort((a, b) => closedRank(a.id) - closedRank(b.id));
  }, [tab, isVisible, statuses]);
  const addable = visible.filter((r) => statuses[r.id] === 'pending');
  const tabTotals = cartTotals(visible.filter((r) => statuses[r.id] === 'pending' || statuses[r.id] === 'in_cart'));
  const doneCount = RECOMMENDATIONS.filter((r) => statuses[r.id] === 'done').length;
  const activeTab = TABS.find((t) => t.id === tab)!;

  useEffect(() => {
    if (cartCount > prevCartCount.current) setBumpKey((k) => k + 1);
    prevCartCount.current = cartCount;
  }, [cartCount]);

  // ── Keyboard: Esc closes topmost overlay ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (results) setResults(null);
      else if (cartOpen) setCartOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [results, cartOpen]);

  // ── Actions ──
  const setStatus = useCallback((id: string, s: RecoStatus) => setStatuses((prev) => ({ ...prev, [id]: s })), []);

  const toggleCart = (id: string) => setStatus(id, statuses[id] === 'in_cart' ? 'pending' : 'in_cart');

  const closeWithUndo = (id: string, next: 'done' | 'skipped') => {
    const prev = statuses[id];
    const reco = RECOMMENDATIONS.find((r) => r.id === id)!;
    setStatus(id, next);
    pushToast(
      {
        tone: next === 'done' ? 'success' : 'info',
        message: `${next === 'done' ? 'Marked done' : 'Skipped'}: ${reco.title}`,
        actionLabel: 'Undo',
        onAction: () => setStatus(id, prev),
      },
      6000,
    );
  };

  const addAll = () => {
    if (addable.length === 0) return;
    setStatuses((prev) => {
      const next = { ...prev };
      for (const r of addable) next[r.id] = 'in_cart';
      return next;
    });
    pushToast({ tone: 'success', message: `Added ${addable.length} upgrade${addable.length === 1 ? '' : 's'} to cart` });
  };

  const clearCart = () =>
    setStatuses((prev) => {
      const next = { ...prev };
      for (const r of cartItems) next[r.id] = 'pending';
      return next;
    });

  const copyPrompt = async () => {
    const prompt = buildAgentPrompt(cartItems, weekLabel, new Date());
    const ok = await copyText(prompt);
    pushToast(
      ok
        ? { tone: 'success', message: `Agent prompt copied — ${cartItems.length} step${cartItems.length === 1 ? '' : 's'}, paste into Claude Code` }
        : { tone: 'error', message: 'Clipboard blocked by the browser — try again or use Execute Upgrades Now' },
    );
  };

  const execute = async () => {
    if (cartItems.length === 0 || executing) return;
    const ids = cartItems.map((r) => r.id);
    setExecuting(true);
    try {
      const res = await fetch('/api/recos/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json().catch(() => ({}))) as { results?: ApplyResultItem[]; error?: string };
      if (!res.ok || !Array.isArray(data.results)) throw new Error(data.error ?? `HTTP ${res.status}`);
      const applied = data.results.filter((r) => r.files.length > 0).map((r) => r.id);
      setStatuses((prev) => {
        const next = { ...prev };
        for (const id of applied) next[id] = 'done';
        return next;
      });
      setCartOpen(false);
      setResults(data.results);
    } catch (err) {
      pushToast({ tone: 'error', message: `Upgrade run failed: ${(err as Error).message}. Your cart is unchanged.` }, 7000);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <style>{KEYFRAMES}</style>

      {/* ── Top bar ── */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-subtle bg-panel/80 px-4 backdrop-blur">
        <Link
          href="/"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-subtle px-2.5 font-mono text-[11px] text-secondary transition-colors hover:border-highlight hover:text-paper"
        >
          <ArrowLeft size={13} /> Back to VOLTA OS
        </Link>
        <div className="ml-1 flex items-center gap-2">
          <PixelMascotLogo size={24} />
          <h1 className="text-[18px] font-bold tracking-tight text-paper">
            VOLTA <span className="font-doto font-bold text-orange">Recos</span>
          </h1>
        </div>
        <span className="hidden rounded-full border border-subtle bg-panel-elevated px-2.5 py-1 font-mono text-[10.5px] text-secondary sm:inline-flex">
          {weekLabel}
        </span>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2 lg:flex">
            <span className="hud-label !text-[10px]">Applied</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-panel-elevated">
              <div
                className="h-full rounded-full bg-green transition-[width] duration-500"
                style={{ width: `${(doneCount / RECOMMENDATIONS.length) * 100}%` }}
              />
            </div>
            <span className="font-mono text-[10.5px] text-secondary">
              {doneCount}/{RECOMMENDATIONS.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className={cn(
              'relative inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-[13px] font-semibold transition-all active:scale-95',
              cartCount > 0
                ? 'border-orange bg-orange text-obsidian hover:brightness-110 hover:shadow-[0_0_20px_rgba(255,85,0,0.4)]'
                : 'border-subtle bg-panel-elevated text-secondary hover:border-highlight hover:text-paper',
            )}
          >
            <ShoppingCart size={15} strokeWidth={2.5} />
            Cart ({cartCount})
            {cartCount > 0 && (
              <span
                key={bumpKey}
                className="recos-bump absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-obsidian bg-paper px-1 font-mono text-[10px] font-bold text-obsidian"
              >
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Sidebar ── */}
        <aside className="hidden w-[220px] shrink-0 flex-col border-r border-subtle bg-panel md:flex">
          <nav className="hud-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-3">
            <span className="hud-label mb-2 px-2 !text-[10px]">Categories</span>
            {TABS.map((t) => {
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] transition-colors',
                    active ? 'bg-panel-hover font-semibold text-paper' : 'text-secondary hover:bg-panel-elevated hover:text-paper',
                  )}
                >
                  {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-orange" />}
                  <span className="w-5 text-center text-[14px]">{t.emoji}</span>
                  <span className="flex-1 truncate">{t.label}</span>
                  <span
                    className={cn(
                      'min-w-6 rounded-full px-1.5 text-center font-mono text-[10.5px] tabular-nums',
                      active ? 'bg-orange text-obsidian' : 'bg-panel-elevated text-muted group-hover:text-secondary',
                    )}
                  >
                    {counts[t.id]}
                  </span>
                </button>
              );
            })}

            <label className="mt-4 flex cursor-pointer items-center justify-between gap-2 rounded-md border border-subtle px-2.5 py-2 text-[12px] text-secondary transition-colors hover:border-highlight hover:text-paper">
              Show done/skipped
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="peer sr-only" />
              <span
                aria-hidden
                className={cn(
                  'relative h-4 w-7 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-orange/60',
                  showClosed ? 'bg-orange' : 'bg-panel-hover',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-3 w-3 rounded-full bg-paper transition-transform duration-200',
                    showClosed ? 'translate-x-3.5' : 'translate-x-0.5',
                  )}
                />
              </span>
            </label>
          </nav>

          <div className="m-3 rounded-lg border border-subtle bg-panel-elevated p-3">
            <span className="hud-label !text-[9.5px]">Telemetry</span>
            <p className="mt-2 text-[11.5px] leading-relaxed text-secondary">
              Weekly Usage Reset: <span className="text-paper">Friday 09:00 AM</span>
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-secondary">
              Remaining Quota: <span className="font-semibold text-amber">{QUOTA_REMAINING}%</span>{' '}
              <span className="text-muted">(Ideal for system upgrades)</span>
            </p>
            <div className="mt-2.5 flex gap-1" aria-label={`${QUOTA_REMAINING}% quota remaining`}>
              {Array.from({ length: 10 }, (_, i) => (
                <span
                  key={i}
                  className={cn('h-2 flex-1 rounded-[2px]', i < Math.round(QUOTA_REMAINING / 10) ? 'bg-amber' : 'bg-panel-hover')}
                />
              ))}
            </div>
          </div>
        </aside>

        {/* ── Main grid ── */}
        <main className="hud-scroll min-h-0 flex-1 overflow-y-auto">
          {/* Mobile tab strip */}
          <div className="hud-scroll flex gap-1.5 overflow-x-auto border-b border-subtle px-4 py-2 md:hidden">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-[12px]',
                  t.id === tab ? 'border-orange bg-orange/15 text-paper' : 'border-subtle text-secondary',
                )}
              >
                {t.emoji} {t.label} ({counts[t.id]})
              </button>
            ))}
          </div>

          <div className="mx-auto max-w-[1400px] px-5 py-5">
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div>
                <h2 className="text-[20px] font-semibold text-paper">
                  {activeTab.emoji} {activeTab.label}
                </h2>
                <p className="mt-0.5 font-mono text-[11px] text-secondary">
                  {visible.length} recommendation{visible.length === 1 ? '' : 's'} · up to{' '}
                  <span className="text-paper">{formatTokens(tabTotals.weeklyTokens)} tok</span> ·{' '}
                  <span className="text-green">{formatUsd(tabTotals.weeklyUsd)}</span> saved / week
                </p>
              </div>
              {addable.length > 1 && (
                <button
                  type="button"
                  onClick={addAll}
                  className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-orange/50 px-3 text-[12px] font-semibold text-orange transition-colors hover:bg-orange/10"
                >
                  <Sparkles size={13} /> Add all {addable.length} to cart
                </button>
              )}
            </div>

            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-subtle py-20 text-center">
                <PixelMascotLogo size={40} color="#22C55E" />
                <p className="mt-4 text-[15px] font-medium text-paper">All clear in {activeTab.label}</p>
                <p className="mt-1 text-[12.5px] text-muted">
                  Nothing pending this week. Toggle <span className="text-secondary">Show done/skipped</span> to review past items.
                </p>
              </div>
            ) : (
              <div key={tab} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visible.map((r, i) => (
                  <div key={r.id} className="recos-card-in flex" style={{ animationDelay: `${i * 40}ms` }}>
                    <div className="flex w-full flex-col [&>article]:flex-1">
                      <RecoCard
                        reco={r}
                        status={statuses[r.id] ?? 'pending'}
                        onToggleCart={() => toggleCart(r.id)}
                        onDone={() => closeWithUndo(r.id, 'done')}
                        onSkip={() => closeWithUndo(r.id, 'skipped')}
                        onRestore={() => setStatus(r.id, 'pending')}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <CartDrawer
        open={cartOpen}
        items={cartItems}
        executing={executing}
        onClose={() => setCartOpen(false)}
        onRemove={(id) => setStatus(id, 'pending')}
        onClear={clearCart}
        onCopyPrompt={copyPrompt}
        onExecute={execute}
      />
      {results && <ResultsModal results={results} recos={RECOMMENDATIONS} onClose={() => setResults(null)} />}
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default RecosApp;
