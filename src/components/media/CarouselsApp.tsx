'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { pushToEditorInbox } from '@/lib/editor-inbox';
import { makeInboxItem } from '@/lib/media-ids';
import { cn } from '@/lib/cn';
import type { Deck, Slide } from './data';
import { PinMarker, SlideView, type EditableField, type SlidePin } from './SlideView';
import { pad2, slidePalette, slideToBlob } from './slide-render';
import { MediaKeyframes, MediaTopBar, Modal, ToastStack, copyText, loadJSON, saveJSON, useToasts } from './ui';
import { ExternalLink } from 'lucide-react';

const BACKUP_KEY = 'volta:carousels:backup:v1';

type DeckStatus = 'DRAFT' | 'APPROVED' | 'REVISION REQUESTED';
interface DeckState {
  edits: Record<string, Partial<Record<EditableField, string>>>;
  wildcard: Record<string, boolean>;
  pins: SlidePin[];
  status: DeckStatus;
  /** Fingerprint of the Notion text this review was made against. */
  rev?: string;
}
type AllState = Record<string, DeckState>;

interface DecksResponse {
  decks: Deck[];
  sources: { id: string; title: string; url: string; decks: number }[];
  inaccessible: { id: string; title: string; url: string; hint: string }[];
  errors: string[];
  state: { decks: Record<string, DeckState & { updatedAt?: string }> } | null;
  storage: { available: boolean; reason: string | null; file: string };
}

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: string } | { kind: 'error'; message: string };

const emptyDeck = (): DeckState => ({ edits: {}, wildcard: {}, pins: [], status: 'DRAFT' });
const tagOf = (d: Deck) => `S${String(d.postNumber).padStart(2, '0')}`;

/** Voiceover length at 150 wpm when the page has a script, else 3 s per slide. */
const deckSeconds = (d: Deck, slideCount: number) => (d.voiceover ? Math.max(3, Math.round((d.voiceover.trim().split(/\s+/).length / 150) * 60)) : slideCount * 3);

/** Small stable hash of a deck's text (djb2): detects that the Notion copy changed after a review. */
function deckRev(d: Deck): string {
  let h = 5381;
  for (const ch of d.slides.map((x) => `${x.kicker}|${x.headline}|${x.body}`).join('\n')) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

function applyEdits(slide: Slide, st: DeckState): Slide {
  const e = st.edits[slide.id];
  return e ? { ...slide, ...e } : slide;
}

function StatusPill({ status }: { status: DeckStatus }) {
  const cls =
    status === 'APPROVED'
      ? 'border-green/50 bg-green/10 text-green'
      : status === 'REVISION REQUESTED'
        ? 'border-amber/50 bg-amber/10 text-amber'
        : 'border-subtle bg-panel-elevated text-secondary';
  return (
    <span className={cn('inline-flex h-5 items-center rounded-full border px-2 font-mono text-[9px] font-semibold uppercase tracking-[0.06em]', cls)}>
      {status === 'APPROVED' ? '✓ ' : status === 'REVISION REQUESTED' ? '↻ ' : '● '}
      {status}
    </span>
  );
}

/** Markdown revision prompt for Claude: per-slide edits, layout switches and pinned comments. */
export function buildRevisionPrompt(deck: Deck, st: DeckState): string {
  const pinsBySlide = (id: string) => st.pins.filter((p) => p.slideId === id).sort((a, b) => a.n - b.n);
  const editedCount = Object.keys(st.edits).length;
  const wildCount = Object.values(st.wildcard).filter(Boolean).length;
  const lines: string[] = [
    `# Claude Revision Request — ${tagOf(deck)}: ${deck.title}`,
    '',
    `**Platform:** ${deck.platform} · **Channel:** ${deck.handle} · **Format:** ${deck.slides.length} slides, 4:5 (1080×1350)`,
    `**Notion source (read-only, do not edit):** ${deck.notionUrl}${deck.episode ? ` · **Episode:** ${deck.episode}` : ''}${deck.source ? ` · **Source:** ${deck.source}` : ''}`,
    `**Review summary:** ${st.pins.length} pinned comment${st.pins.length === 1 ? '' : 's'} · ${editedCount} slide${editedCount === 1 ? '' : 's'} hand-edited · ${wildCount} wildcard layout${wildCount === 1 ? '' : 's'}`,
    '',
    'Revise this carousel using the `/robo` brand system (Ink Well #0A0A0A / Paper #F5F2EB, accent #FF5500, Outfit headlines, Doto numerals) and the `/tone` voice skill.',
    'Treat my inline edits as approved copy — keep them verbatim unless a comment says otherwise. Address every pinned comment.',
    '',
  ];
  deck.slides.forEach((orig, i) => {
    const cur = applyEdits(orig, st);
    const wild = !!st.wildcard[orig.id];
    const pal = slidePalette(orig, i, wild);
    lines.push(`## Slide ${pad2(i + 1)} — ${orig.kind.toUpperCase()}`);
    lines.push(`- **Layout:** ${wild ? `🃏 WILDCARD poster (${pal.name})` : `STANDARD (/robo ${orig.theme})`}`);
    lines.push(`- **Kicker:** ${cur.kicker}`);
    lines.push(`- **Headline:** ${cur.headline}`);
    lines.push(`- **Body:** ${cur.body}`);
    const e = st.edits[orig.id];
    if (e) {
      (Object.keys(e) as EditableField[]).forEach((f) => {
        if (e[f] !== undefined && e[f] !== orig[f]) lines.push(`- ✎ **Edited ${f}:** "${orig[f]}" → "${e[f]}"`);
      });
    }
    const pins = pinsBySlide(orig.id);
    pins.forEach((p) =>
      lines.push(`- 📍 **Pin ${p.n}** (x ${Math.round(p.x * 100)}%, y ${Math.round(p.y * 100)}%): ${p.text || '_(no note — flag this region for a second look)_'}`),
    );
    if (!e && !pins.length) lines.push('- ✓ No changes requested — keep as is.');
    lines.push('');
  });
  lines.push('## Deliverable');
  lines.push('Return the full revised deck as JSON: `[{ "slide": 1, "kicker": "", "headline": "", "body": "", "layout": "standard" | "wildcard" }]`.');
  lines.push('Headlines ≤ 9 words, body ≤ 32 words, one idea per slide, last slide keeps a clear CTA.');
  return lines.join('\n');
}

function initialFrom(data: DecksResponse): AllState {
  const backup = loadJSON<AllState>(BACKUP_KEY) ?? {};
  const out: AllState = {};
  for (const d of data.decks) {
    const server = data.state?.decks?.[d.id];
    const b = backup[d.id];
    // the Windsor copy wins; a browser backup only fills in when the drive had nothing (or was unplugged)
    const src = server ?? (!data.storage.available || !data.state ? b : undefined);
    out[d.id] = src && Array.isArray(src.pins) ? { ...emptyDeck(), edits: src.edits ?? {}, wildcard: src.wildcard ?? {}, pins: src.pins, status: src.status ?? 'DRAFT', rev: src.rev } : emptyDeck();
  }
  return out;
}

export function CarouselsApp() {
  const [res, setRes] = useState<{ status: 'loading' | 'ready' | 'error'; data: DecksResponse | null; error: string | null; notConfigured: boolean }>({ status: 'loading', data: null, error: null, notConfigured: false });
  const load = useCallback((force = false) => {
    setRes((r) => ({ ...r, status: 'loading' }));
    fetch(`/api/carousels${force ? '?refresh=1' : ''}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as DecksResponse & { error?: string; notConfigured?: boolean };
        if (!r.ok) setRes({ status: 'error', data: null, error: j.error ?? `HTTP ${r.status}`, notConfigured: !!j.notConfigured });
        else setRes({ status: 'ready', data: j, error: null, notConfigured: false });
      })
      .catch((e: Error) => setRes({ status: 'error', data: null, error: e.message, notConfigured: false }));
  }, []);
  useEffect(() => load(), [load]);

  if (res.status === 'ready' && res.data && res.data.decks.length > 0) return <CarouselsBoard data={res.data} onReload={() => load(true)} />;
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <MediaKeyframes />
      <MediaTopBar title="VOLTA" accent="CAROUSELS" subtitle="Shorts decks from Notion" />
      <div className="mx-auto mt-16 max-w-[560px] px-6 text-[13px] leading-relaxed text-secondary" aria-live="polite">
        {res.status === 'loading' && <p className="font-mono text-[11px] text-muted">Reading the Shorts pages from Notion…</p>}
        {res.status === 'error' && (
          <p className="rounded-lg border border-[#EF4444]/40 bg-[#1F0F0F] p-3 text-paper">
            {res.notConfigured ? 'NOTION_TOKEN is not set in .env.local, so the decks cannot load.' : `Could not load the decks: ${res.error}`}{' '}
            <button type="button" onClick={() => load()} className="text-orange underline">
              Retry
            </button>
          </p>
        )}
        {res.status === 'ready' && res.data && (
          <div className="rounded-lg border border-dashed border-subtle p-4">
            <p className="font-semibold text-paper">No shorts found.</p>
            <p className="mt-1">The pages under Video Production tagged Shorts/TikTok have no “S01 — title” blocks with HOOK and VO lines yet.</p>
            {res.data.inaccessible.map((n) => (
              <p key={n.id} className="mt-2 text-amber">
                {n.title}: {n.hint}
              </p>
            ))}
            {res.data.errors.map((e) => (
              <p key={e} className="mt-2 font-mono text-[11px] text-muted">
                {e}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SaveBadge({ save, file }: { save: SaveState; file: string }) {
  const cls = save.kind === 'error' ? 'text-[#EF4444]' : save.kind === 'saving' ? 'text-amber' : 'text-muted';
  const text =
    save.kind === 'saving'
      ? 'saving to Windsor…'
      : save.kind === 'saved'
        ? `saved to Windsor ${new Date(save.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
        : save.kind === 'error'
          ? `NOT saved: ${save.message}`
          : 'approvals & comments save to Windsor';
  return (
    <span className={cn('hidden max-w-[360px] truncate font-mono text-[10px] md:inline', cls)} title={`${file}\nNotion is never written.`} role="status">
      ● {text}
    </span>
  );
}

function CarouselsBoard({ data, onReload }: { data: DecksResponse; onReload: () => void }) {
  const decks = data.decks;
  const [state, setState] = useState<AllState>(() => initialFrom(data));
  const [deckId, setDeckId] = useState(decks[0].id);
  const [mode, setMode] = useState<'edit' | 'comment'>('edit');
  const [activePin, setActivePin] = useState<string | null>(null);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const [slideW, setSlideW] = useState(340);
  const [save, setSave] = useState<SaveState>(data.storage.available ? { kind: 'idle' } : { kind: 'error', message: data.storage.reason ?? 'Windsor is not mounted' });
  const stripRef = useRef<HTMLDivElement>(null);
  const { toasts, push, dismiss } = useToasts();

  // Autosave: one PUT per changed deck to the Windsor drive (debounced). The browser keeps a backup copy in case the drive is away.
  const savedSig = useRef<Map<string, string>>(new Map(decks.map((d) => [d.id, JSON.stringify(initialFrom(data)[d.id])])));
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const stateRef = useRef(state);
  stateRef.current = state;
  const flush = useCallback(
    async (id: string) => {
      timers.current.delete(id);
      const st = stateRef.current[id];
      const deck = decks.find((x) => x.id === id);
      if (!st || !deck) return;
      const body = { ...st, rev: deckRev(deck) };
      const sig = JSON.stringify(st);
      if (savedSig.current.get(id) === sig) return;
      saveJSON(BACKUP_KEY, stateRef.current);
      setSave({ kind: 'saving' });
      try {
        const r = await fetch('/api/carousels/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deckId: id, state: body }) });
        const j = (await r.json().catch(() => ({}))) as { error?: string; savedAt?: string };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        savedSig.current.set(id, sig);
        setSave({ kind: 'saved', at: j.savedAt ?? new Date().toISOString() });
      } catch (err) {
        setSave({ kind: 'error', message: (err as Error).message });
      }
    },
    [decks],
  );
  useEffect(() => {
    for (const d of decks) {
      const st = state[d.id];
      if (!st || savedSig.current.get(d.id) === JSON.stringify(st)) continue;
      const old = timers.current.get(d.id);
      if (old) clearTimeout(old);
      timers.current.set(d.id, setTimeout(() => void flush(d.id), 600));
    }
  }, [state, decks, flush]);
  useEffect(() => {
    const pending = timers.current;
    const onHide = () => pending.forEach((_, id) => void flush(id));
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [flush]);

  // size slides to the filmstrip height
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      setSlideW(Math.round(Math.max(220, Math.min(440, (h - 70) * 0.8))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const deck = decks.find((d) => d.id === deckId) ?? decks[0];
  const ds = state[deck.id] ?? emptyDeck();
  const slides = useMemo(() => deck.slides.map((s) => applyEdits(s, ds)), [deck, ds]);

  const update = useCallback(
    (fn: (s: DeckState) => DeckState, keepStatus = false) => {
      setState((cur) => {
        const prev = cur[deckId] ?? emptyDeck();
        const next = fn(prev);
        if (!keepStatus && prev.status === 'APPROVED') next.status = 'DRAFT';
        const d = decks.find((x) => x.id === deckId);
        if (!next.rev && d) next.rev = deckRev(d); // remember which Notion text this review is against
        return { ...cur, [deckId]: next };
      });
    },
    [deckId, decks],
  );

  const onEdit = (slideId: string, field: EditableField, value: string) => {
    const orig = deck.slides.find((s) => s.id === slideId);
    update((s) => {
      const e = { ...(s.edits[slideId] ?? {}) };
      if (orig && orig[field] === value) delete e[field];
      else e[field] = value;
      const edits = { ...s.edits };
      if (Object.keys(e).length) edits[slideId] = e;
      else delete edits[slideId];
      return { ...s, edits };
    });
  };

  const toggleWild = (slideId: string) => update((s) => ({ ...s, wildcard: { ...s.wildcard, [slideId]: !s.wildcard[slideId] } }));

  const dropPin = (slideId: string, e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(0.97, Math.max(0.03, (e.clientX - r.left) / r.width));
    const y = Math.min(0.97, Math.max(0.03, (e.clientY - r.top) / r.height));
    const n = ds.pins.reduce((m, p) => Math.max(m, p.n), 0) + 1;
    const id = `${deck.id}-pin-${n}`;
    update((s) => ({ ...s, pins: [...s.pins, { id, n, slideId, x, y, text: '' }] }));
    setActivePin(id);
  };
  const savePin = (id: string, text: string) => {
    update((s) => ({ ...s, pins: s.pins.map((p) => (p.id === id ? { ...p, text } : p)) }));
    setActivePin(null);
  };
  const deletePin = (id: string) => {
    update((s) => ({ ...s, pins: s.pins.filter((p) => p.id !== id) }), true);
    setActivePin(null);
  };

  const approve = () => {
    update((s) => ({ ...s, status: 'APPROVED' }), true);
    const open = ds.pins.filter((p) => p.text).length;
    push({ tone: 'ok', message: `${tagOf(deck)} approved${open ? ` (${open} comment${open > 1 ? 's' : ''} logged as notes)` : ''}. Saved to Windsor; Notion is untouched.` });
  };

  const requestRevision = async () => {
    const md = buildRevisionPrompt(deck, ds);
    const ok = await copyText(md);
    update((s) => ({ ...s, status: 'REVISION REQUESTED' }), true);
    setPromptText(md);
    push({ tone: ok ? 'ok' : 'error', message: ok ? 'Revision prompt copied — paste it into Claude.' : 'Clipboard blocked — copy the prompt from the dialog.' });
  };

  const exportPngs = async () => {
    if (exporting) return;
    const total = slides.length;
    setExporting({ done: 0, total });
    try {
      for (let i = 0; i < total; i++) {
        const wild = !!ds.wildcard[deck.slides[i].id];
        const blob = await slideToBlob({ slide: slides[i], index: i, total, handle: deck.handle, wildcard: wild });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${tagOf(deck).toLowerCase()}-slide-${pad2(i + 1)}${wild ? '-wildcard' : ''}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 2000);
        setExporting({ done: i + 1, total });
        await new Promise((r) => window.setTimeout(r, 320));
      }
      push({ tone: 'ok', message: `Exported ${total} PNGs (1080×1350) for ${tagOf(deck)}.` });
    } catch (err) {
      push({ tone: 'error', message: `Export failed — ${(err as Error).message}` });
    } finally {
      setExporting(null);
    }
  };

  const sendToEditor = () => {
    const waiting = pushToEditorInbox(
      makeInboxItem({
        source: 'carousels',
        ref: deck.id,
        title: `Short ${tagOf(deck)} — ${deck.title}`,
        kind: 'ANIMATION',
        durationSec: deckSeconds(deck, slides.length),
        cues: slides.map((s, i) => ({ atSec: Math.round((i * deckSeconds(deck, slides.length)) / slides.length), voiceover: s.body || s.headline, visualCue: `Slide ${pad2(i + 1)} · ${s.kicker} · ${s.headline}` })),
        notion: { title: deck.pageTitle, url: deck.notionUrl },
      }),
    );
    push({ tone: 'ok', message: `${tagOf(deck)} sent to VOLTA Editor as a ${deckSeconds(deck, slides.length)}s hand-off (${waiting} waiting).`, href: '/apps/editor', hrefLabel: 'Open VOLTA Editor' });
  };

  const resetDeck = () => {
    setState((cur) => ({ ...cur, [deckId]: emptyDeck() }));
    setActivePin(null);
    push({ tone: 'info', message: `${tagOf(deck)} reset to the original Notion text.` });
  };

  // keyboard: E / C switch modes, Esc closes pin box
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (promptText) return;
      if (e.key === 'Escape') setActivePin(null);
      else if (e.key.toLowerCase() === 'e' && !e.metaKey && !e.ctrlKey) setMode('edit');
      else if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey) setMode('comment');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [promptText]);

  const editedCount = Object.keys(ds.edits).length;
  const wildCount = Object.values(ds.wildcard).filter(Boolean).length;
  const sortedPins = [...ds.pins].sort((a, b) => a.n - b.n);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <MediaKeyframes />
      <MediaTopBar
        title="VOLTA"
        accent="CAROUSELS"
        subtitle="Shorts decks from Notion · review & approval"
        right={
          <>
            <SaveBadge save={save} file={data.storage.file} />
            <span className="hud-label hidden md:inline">{decks.length} shorts · {decks.reduce((n, d) => n + d.slides.length, 0)} slides</span>
            <button type="button" onClick={onReload} title="Re-read the Shorts pages from Notion (cached for 10 minutes)" className="h-7 rounded-full border border-subtle bg-panel-elevated px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-secondary hover:border-highlight hover:text-paper">
              ↻ Refresh Notion
            </button>
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        {/* ── deck list ── */}
        <aside className="hud-scroll flex w-[272px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-subtle bg-panel p-3">
          <p className="hud-label px-1 pb-1">Deck queue</p>
          {decks.map((d) => {
            const st = state[d.id] ?? emptyDeck();
            const active = d.id === deck.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setDeckId(d.id);
                  setActivePin(null);
                  stripRef.current?.scrollTo({ left: 0 });
                }}
                className={cn(
                  'flex gap-3 rounded-[10px] border p-2.5 text-left transition-colors',
                  active ? 'border-orange/70 bg-orange/[0.06]' : 'border-subtle bg-panel-elevated hover:border-highlight',
                )}
              >
                <div className="pointer-events-none shrink-0 overflow-hidden rounded-[4px] border border-subtle">
                  <SlideView slide={applyEdits(d.slides[0], st)} index={0} total={d.slides.length} handle={d.handle} wildcard={!!st.wildcard[d.slides[0].id]} width={64} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] font-semibold uppercase text-orange">
                    {tagOf(d)}
                    {d.queue ? <span className="text-muted"> · post #{d.queue}</span> : d.bench ? <span className="text-muted"> · bench</span> : null}
                  </p>
                  <p className="line-clamp-2 text-[13px] font-semibold leading-tight text-paper">{d.title}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <StatusPill status={st.status} />
                    <span className="font-mono text-[9.5px] uppercase text-muted">
                      {d.slides.length} slides · 📍{st.pins.length}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
          <div className="mt-auto rounded-[10px] border border-subtle p-3 font-mono text-[10px] leading-relaxed text-muted">
            <p className="hud-label mb-1">Shortcuts</p>
            <p>
              <span className="text-paper">E</span> edit copy · <span className="text-paper">C</span> comment pins
            </p>
            <p>
              <span className="text-paper">↵</span> commit headline · <span className="text-paper">Esc</span> cancel
            </p>
          </div>
        </aside>

        {/* ── main ── */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-subtle px-5 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-doto text-[22px] leading-none text-orange">{tagOf(deck)}</span>
                <h2 className="truncate text-[18px] font-bold tracking-tight">{deck.title}</h2>
                <StatusPill status={ds.status} />
              </div>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.05em] text-muted">
                {deck.platform} · {deck.handle} · {slides.length} slides · ✎ {editedCount} edited · 🃏 {wildCount} wildcard · 📍 {ds.pins.length} pins
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="flex rounded-full border border-subtle bg-panel-elevated p-0.5" role="tablist" aria-label="Review mode">
                {(['edit', 'comment'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => setMode(m)}
                    className={cn('h-7 rounded-full px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.05em]', mode === m ? 'bg-paper text-obsidian' : 'text-secondary hover:text-paper')}
                  >
                    {m === 'edit' ? '✎ Edit copy' : '📍 Comment'}
                  </button>
                ))}
              </div>
              <button type="button" onClick={approve} className="h-8 rounded-md border border-green/60 bg-green/10 px-3 font-mono text-[10.5px] font-bold uppercase tracking-[0.05em] text-green hover:bg-green hover:text-obsidian">
                ✓ Approve Deck
              </button>
              <button type="button" onClick={requestRevision} className="h-8 rounded-md border border-orange bg-orange px-3 font-mono text-[10.5px] font-bold uppercase tracking-[0.05em] text-obsidian hover:brightness-110">
                Request Claude Revision (Copy Prompt)
              </button>
              <button
                type="button"
                onClick={exportPngs}
                disabled={!!exporting}
                className="h-8 rounded-md border border-subtle bg-panel-elevated px-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em] text-secondary hover:border-highlight hover:text-paper"
              >
                {exporting ? `Exporting ${exporting.done}/${exporting.total}…` : '⤓ Export Slides as PNGs'}
              </button>
              <button type="button" onClick={sendToEditor} className="h-8 rounded-md border border-subtle px-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em] text-secondary hover:border-orange/60 hover:text-orange">
                Send to VOLTA Editor
              </button>
              <button type="button" onClick={resetDeck} className="h-8 rounded-md px-2 font-mono text-[10px] uppercase text-muted hover:text-paper" title="Discard edits, pins and layout switches">
                ↺
              </button>
            </div>
          </div>

          {/* from Notion */}
          <div className="flex shrink-0 flex-wrap items-start gap-x-6 gap-y-1 border-b border-subtle bg-panel px-5 py-2.5 text-[12px] leading-snug">
            <p className="min-w-[240px] flex-1">
              <span className="hud-label mr-2 !text-[9.5px]">Hook</span>
              <span className="font-semibold text-paper">{deck.hook}</span>
            </p>
            {deck.episode && (
              <p className="text-secondary">
                <span className="hud-label mr-2 !text-[9.5px]">Episode</span>
                {deck.episode}
              </p>
            )}
            {deck.source && (
              <p className="min-w-[240px] flex-[2] text-secondary">
                <span className="hud-label mr-2 !text-[9.5px]">Source</span>
                {deck.source}
              </p>
            )}
            {deck.caption && (
              <p className="basis-full text-secondary">
                <span className="hud-label mr-2 !text-[9.5px]">Caption</span>
                {deck.caption}
              </p>
            )}
            {ds.rev && ds.rev !== deckRev(deck) && (
              <p className="basis-full rounded border border-amber/40 bg-amber/5 px-2 py-1 text-amber">
                The Notion text for this short changed after you reviewed it, so your edits and pins may no longer line up.{' '}
                <button type="button" className="underline" onClick={() => update((s) => ({ ...s, rev: deckRev(deck) }), true)}>
                  Mark as reviewed against the current text
                </button>
              </p>
            )}
            <a href={deck.notionUrl} target="_blank" rel="noreferrer noopener" className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.05em] text-secondary hover:text-orange">
              Open in Notion <ExternalLink size={10} />
            </a>
          </div>

          {/* filmstrip */}
          <div
            ref={stripRef}
            className="hud-scroll flex min-h-[300px] flex-1 items-center gap-6 overflow-x-auto overflow-y-hidden px-6"
            onWheel={(e) => {
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
            }}
            onClick={() => setActivePin(null)}
          >
            {slides.map((slide, i) => {
              const orig = deck.slides[i];
              const wild = !!ds.wildcard[orig.id];
              const pins = ds.pins.filter((p) => p.slideId === orig.id);
              const edited = !!ds.edits[orig.id];
              return (
                <div key={orig.id} className="flex shrink-0 flex-col gap-2.5" style={{ width: slideW }}>
                  <div
                    className={cn(
                      'relative overflow-visible rounded-[6px] shadow-[0_20px_50px_rgba(0,0,0,0.55)] ring-1 transition-shadow',
                      wild ? 'ring-purple/60' : 'ring-subtle',
                      mode === 'comment' && 'cursor-crosshair hover:ring-2 hover:ring-orange',
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="overflow-hidden rounded-[6px]">
                      <SlideView
                        slide={slide}
                        index={i}
                        total={slides.length}
                        handle={deck.handle}
                        wildcard={wild}
                        width={slideW}
                        editable={mode === 'edit'}
                        onEdit={(f, v) => onEdit(orig.id, f, v)}
                      />
                    </div>
                    {mode === 'comment' && <div className="absolute inset-0 z-10" onClick={(e) => dropPin(orig.id, e)} aria-label="Drop a comment pin" />}
                    {pins.map((p) => (
                      <PinMarker
                        key={p.id}
                        pin={p}
                        active={activePin === p.id}
                        onOpen={() => setActivePin(p.id)}
                        onSave={(t) => savePin(p.id, t)}
                        onDelete={() => deletePin(p.id)}
                        onClose={() => setActivePin(null)}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-doto text-[15px] text-orange">{pad2(i + 1)}</span>
                    <span className="font-mono text-[9.5px] uppercase text-muted">/ {pad2(slides.length)} · {orig.kind}</span>
                    {edited && <span className="font-mono text-[9.5px] uppercase text-amber">✎ edited</span>}
                    {pins.length > 0 && <span className="font-mono text-[9.5px] uppercase text-orange">📍{pins.length}</span>}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={wild}
                      onClick={() => toggleWild(orig.id)}
                      className={cn(
                        'ml-auto flex h-6 items-center gap-1.5 rounded-full border px-2 font-mono text-[9px] font-semibold uppercase tracking-[0.04em] transition-colors',
                        wild ? 'border-purple/60 bg-purple/15 text-paper' : 'border-subtle text-secondary hover:border-highlight hover:text-paper',
                      )}
                    >
                      <span className={cn('relative h-3 w-5 rounded-full', wild ? 'bg-purple' : 'bg-highlight')}>
                        <span className={cn('absolute top-0.5 h-2 w-2 rounded-full bg-paper transition-all', wild ? 'left-2.5' : 'left-0.5')} />
                      </span>
                      {wild ? '🃏 Wildcard Layout' : 'Switch to Wildcard Layout'}
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="w-2 shrink-0" />
          </div>

          {/* review notes */}
          <section className="flex h-[188px] shrink-0 border-t border-subtle bg-panel">
            <div className="hud-scroll min-w-0 flex-1 overflow-y-auto px-5 py-3">
              <p className="hud-label mb-2">📍 Pinned comments ({ds.pins.length})</p>
              {sortedPins.length === 0 ? (
                <p className="text-[12.5px] text-muted">
                  Switch to <span className="text-paper">📍 Comment</span> (press C) and click anywhere on a slide to drop a numbered pin.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {sortedPins.map((p) => {
                    const idx = deck.slides.findIndex((s) => s.id === p.slideId);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setActivePin(p.id);
                            stripRef.current?.scrollTo({ left: Math.max(0, idx * (slideW + 24) - 40), behavior: 'smooth' });
                          }}
                          className="flex w-full items-start gap-2.5 rounded-md px-2 py-1 text-left hover:bg-panel-elevated"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange font-mono text-[10px] font-bold text-obsidian">{p.n}</span>
                          <span className="font-mono text-[10px] uppercase text-muted">S{pad2(idx + 1)}</span>
                          <span className={cn('text-[12.5px] leading-snug', p.text ? 'text-paper' : 'italic text-muted')}>{p.text || 'Empty note — click to write it'}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="hud-scroll w-[360px] shrink-0 overflow-y-auto border-l border-subtle px-5 py-3">
              <p className="hud-label mb-2">✎ Copy edits ({editedCount})</p>
              {editedCount === 0 ? (
                <p className="text-[12.5px] text-muted">
                  In <span className="text-paper">✎ Edit copy</span> mode click any kicker, headline or body to rewrite it inline.
                </p>
              ) : (
                <ul className="space-y-2">
                  {deck.slides.map((orig, i) => {
                    const e = ds.edits[orig.id];
                    if (!e) return null;
                    return (
                      <li key={orig.id} className="text-[12px] leading-snug">
                        <span className="font-mono text-[10px] uppercase text-orange">Slide {pad2(i + 1)}</span>
                        {(Object.keys(e) as EditableField[]).map((f) => (
                          <p key={f} className="mt-0.5 text-secondary">
                            <span className="font-mono text-[10px] uppercase text-muted">{f}: </span>
                            <span className="text-muted line-through">{orig[f]}</span> <span className="text-paper">{e[f]}</span>
                          </p>
                        ))}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </main>
      </div>

      <Modal open={!!promptText} onClose={() => setPromptText(null)} label="Claude revision prompt" className="flex w-[min(820px,94vw)] flex-col">
        <header className="flex items-center gap-3 border-b border-subtle px-5 py-3.5">
          <div>
            <p className="text-[15px] font-semibold">Revision prompt copied to clipboard</p>
            <p className="font-mono text-[10.5px] text-muted">Paste into Claude · deck status → REVISION REQUESTED</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              const ok = promptText ? await copyText(promptText) : false;
              push({ tone: ok ? 'ok' : 'error', message: ok ? 'Copied again.' : 'Clipboard blocked — select the text manually.' });
            }}
            className="ml-auto h-7 rounded-full bg-orange px-3 font-mono text-[10px] font-bold uppercase text-obsidian"
          >
            Copy again
          </button>
          <button type="button" onClick={() => setPromptText(null)} className="h-7 rounded-full border border-subtle px-3 font-mono text-[10px] uppercase text-secondary hover:text-paper">
            Close
          </button>
        </header>
        <pre className="hud-scroll selectable max-h-[64vh] overflow-auto whitespace-pre-wrap bg-obsidian p-5 font-mono text-[11.5px] leading-relaxed text-secondary">{promptText}</pre>
      </Modal>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

export default CarouselsApp;
