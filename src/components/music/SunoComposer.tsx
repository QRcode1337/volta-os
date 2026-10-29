'use client';
// Composer tools for the Suno panel: chip pickers (style tags, bracketed lyric cues, speech tone, sound), a lyric-sheet
// header + section builder, "Draft with AI" with one-step undo, and saved formulas (presets) per field.
import { useState, type RefObject } from 'react';
import { BookmarkPlus, ChevronDown, Loader2, Undo2, Wand2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { api } from './music-client';
import { KEYS, LYRIC_CUES, SONG_SECTIONS, hasListItem, lyricHeader, sectionBlock, toggleListItem, type ChipGroup, type DraftKind, type LyricHeader } from './suno-formulas';
import type { SunoDraftResult } from './suno-types';

const chip =
  'rounded-full border border-subtle px-2 py-0.5 font-mono text-[10px] text-secondary transition-colors hover:border-highlight hover:text-paper disabled:opacity-40';
const chipOn = 'border-orange/60 bg-orange/10 text-paper';
const mini =
  'inline-flex h-6 items-center gap-1 rounded-full border border-subtle px-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] text-secondary transition-colors hover:border-highlight hover:text-paper disabled:cursor-not-allowed disabled:opacity-40';
const input = 'w-full rounded-md border border-subtle bg-obsidian px-2 py-1 text-[11.5px] text-paper placeholder:text-muted focus:border-orange/60 focus:outline-none';

/** Insert text at the textarea's cursor (or append), then put the cursor after it. */
export function insertAtCursor(ref: RefObject<HTMLTextAreaElement | null>, value: string, onChange: (v: string) => void, text: string) {
  const el = ref.current;
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const next = value.slice(0, start) + text + value.slice(end);
  onChange(next);
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    el.setSelectionRange(start + text.length, start + text.length);
  });
}

/** Collapsible rows of chips. `isOn` marks chips already in a comma list; `onPick` adds/removes or inserts. */
export function ChipPicker({ groups, isOn, onPick, title, defaultOpen = false }: { groups: ChipGroup[]; isOn?: (c: string) => boolean; onPick: (c: string) => void; title: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-subtle/70 bg-obsidian/40">
      <button type="button" className="flex w-full items-center gap-1.5 px-2.5 py-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted hover:text-paper" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronDown className={cn('h-3 w-3 transition-transform', !open && '-rotate-90')} /> {title}
      </button>
      {open && (
        <div className="space-y-1.5 px-2.5 pb-2.5">
          {groups.map((g) => (
            <div key={g.label} className="flex flex-wrap items-center gap-1">
              <span className="mr-1 w-[74px] shrink-0 font-mono text-[9px] uppercase tracking-[0.06em] text-muted">{g.label}</span>
              {g.chips.map((c) => (
                <button key={c} type="button" className={cn(chip, isOn?.(c) && chipOn)} onClick={() => onPick(c)}>
                  {c}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Chips that toggle entries in a comma-separated field (style tags, tone, sound). */
export function ListChips({ groups, value, onChange, title }: { groups: ChipGroup[]; value: string; onChange: (v: string) => void; title: string }) {
  return <ChipPicker groups={groups} title={title} isOn={(c) => hasListItem(value, c)} onPick={(c) => onChange(toggleListItem(value, c))} />;
}

const EMPTY_HEADER: LyricHeader = { title: '', bpm: '', genre: '', key: 'Any', meter: '4/4', vocals: '', arrangement: '' };

/** Lyric-sheet tools: header block, section skeletons and bracketed production cues inserted at the cursor. */
export function LyricTools({ value, onChange, textRef, title }: { value: string; onChange: (v: string) => void; textRef: RefObject<HTMLTextAreaElement | null>; title: string }) {
  const [h, setH] = useState<LyricHeader>(EMPTY_HEADER);
  const [showHeader, setShowHeader] = useState(false);
  const set = (x: Partial<LyricHeader>) => setH((p) => ({ ...p, ...x }));
  const addHeader = () => {
    const block = lyricHeader({ ...h, title: h.title || title });
    if (block) onChange(`${block}\n\n${value.trimStart()}`);
    setShowHeader(false);
  };
  const addSection = (name: string, hint: string) => {
    const before = value.slice(0, textRef.current?.selectionStart ?? value.length);
    insertAtCursor(textRef, value, onChange, `${before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''}${sectionBlock(name, hint)}`);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" className={cn(mini, showHeader && chipOn)} onClick={() => setShowHeader((s) => !s)}>
          Header
        </button>
        {SONG_SECTIONS.map((s) => (
          <button key={s.name} type="button" className={mini} title={`Insert [${s.name} – ${s.hint}]`} onClick={() => addSection(s.name, s.hint)}>
            + {s.name}
          </button>
        ))}
      </div>
      {showHeader && (
        <div className="grid grid-cols-2 gap-1.5 rounded-md border border-subtle/70 bg-obsidian/40 p-2.5 sm:grid-cols-4">
          <input className={input} placeholder={`Title (${title || 'song title'})`} value={h.title} onChange={(e) => set({ title: e.target.value })} />
          <input className={input} placeholder="BPM (152)" inputMode="numeric" value={h.bpm} onChange={(e) => set({ bpm: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
          <input className={input} placeholder="Genre (Melodic Industrial Trap)" value={h.genre} onChange={(e) => set({ genre: e.target.value })} />
          <select className={input} value={h.key} onChange={(e) => set({ key: e.target.value })} aria-label="Key">
            {KEYS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input className={input} placeholder="Meter (4/4)" value={h.meter} onChange={(e) => set({ meter: e.target.value })} />
          <input className={cn(input, 'col-span-2 sm:col-span-3')} placeholder="Vocals + character (Massive female hook + deep male verses)" value={h.vocals} onChange={(e) => set({ vocals: e.target.value })} />
          <input className={cn(input, 'col-span-2 sm:col-span-3')} placeholder="Arrangement (evolving arpeggios, wide choirs, sub-heavy drops, half-time breakdown)" value={h.arrangement} onChange={(e) => set({ arrangement: e.target.value })} />
          <button type="button" className={cn(mini, 'justify-center')} onClick={addHeader}>
            Insert at top
          </button>
        </div>
      )}
      <ChipPicker groups={LYRIC_CUES} title="Composition cues · inserted as [Cue] at the cursor" onPick={(c) => insertAtCursor(textRef, value, onChange, `[${c}] `)} />
    </div>
  );
}

/** "Draft with AI": a short brief -> the field's text, through the LLM gateway. One-step undo. */
export function DraftBar({ kind, current, context, onApply, placeholder }: { kind: DraftKind; current: string; context: string; onApply: (text: string) => void; placeholder: string }) {
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<SunoDraftResult>('/api/music/suno/draft', { method: 'POST', body: { kind, brief, current, context } });
      setUndo(current);
      setModel(r.model);
      onApply(r.text);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <input className={input} value={brief} maxLength={2000} placeholder={placeholder} onChange={(e) => setBrief(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !busy && (brief.trim() || current.trim()) && void run()} />
        <button type="button" className={cn(mini, 'shrink-0 text-orange')} disabled={busy || (!brief.trim() && !current.trim())} onClick={() => void run()} title={current.trim() ? 'Revise the current text (or follow the brief)' : 'Write from the brief'}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} {current.trim() ? 'Revise' : 'Draft'}
        </button>
        {undo !== null && !busy && (
          <button type="button" className={cn(mini, 'shrink-0')} onClick={() => (onApply(undo), setUndo(null))} title="Put back the text from before the draft">
            <Undo2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {err && <p className="font-mono text-[10px] text-[#EF4444]">{err}</p>}
      {model && !err && undo !== null && <p className="font-mono text-[9.5px] text-muted">Drafted by {model}. Undo puts back the previous text.</p>}
    </div>
  );
}

interface Preset {
  name: string;
  text: string;
  builtIn?: boolean;
}

const presetKey = (kind: DraftKind) => `volta:music:suno:presets:${kind}`;
const readPresets = (kind: DraftKind): Preset[] => {
  try {
    const raw = window.localStorage.getItem(presetKey(kind));
    const list = raw ? (JSON.parse(raw) as Preset[]) : [];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.name === 'string' && typeof p.text === 'string') : [];
  } catch {
    return [];
  }
};
const writePresets = (kind: DraftKind, list: Preset[]) => {
  try {
    window.localStorage.setItem(presetKey(kind), JSON.stringify(list));
  } catch {
    // storage unavailable: presets just don't persist
  }
};

/** Saved formulas for one field: built-in examples plus your own (kept in this browser). */
export function Presets({ kind, value, onLoad, builtIn }: { kind: DraftKind; value: string; onLoad: (text: string) => void; builtIn: Preset[] }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<Preset[]>([]);
  const [name, setName] = useState('');
  const toggle = () => {
    if (!open) setMine(readPresets(kind));
    setOpen((o) => !o);
  };
  const save = () => {
    const n = name.trim().slice(0, 60);
    if (!n || !value.trim()) return;
    const next = [...mine.filter((p) => p.name !== n), { name: n, text: value }];
    writePresets(kind, next);
    setMine(next);
    setName('');
  };
  const remove = (n: string) => {
    const next = mine.filter((p) => p.name !== n);
    writePresets(kind, next);
    setMine(next);
  };
  return (
    <div className="relative inline-block">
      <button type="button" className={cn(mini, open && chipOn)} onClick={toggle} aria-expanded={open}>
        <BookmarkPlus className="h-3 w-3" /> Formulas
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-md border border-subtle bg-panel-elevated p-2 shadow-xl">
          <ul className="max-h-56 space-y-0.5 overflow-y-auto">
            {[...builtIn.map((p) => ({ ...p, builtIn: true })), ...mine].map((p) => (
              <li key={`${p.builtIn ? 'b' : 'm'}:${p.name}`} className="flex items-center gap-1">
                <button type="button" className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-[11.5px] text-paper hover:bg-obsidian" title={p.text.slice(0, 300)} onClick={() => (onLoad(p.text), setOpen(false))}>
                  {p.name}
                  {p.builtIn && <span className="ml-1.5 font-mono text-[9px] uppercase text-muted">example</span>}
                </button>
                {!p.builtIn && (
                  <button type="button" className="rounded p-1 text-muted hover:text-[#EF4444]" aria-label={`Delete ${p.name}`} onClick={() => remove(p.name)}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
            {!builtIn.length && !mine.length && <li className="px-2 py-1 font-mono text-[10px] text-muted">No saved formulas yet.</li>}
          </ul>
          <div className="mt-2 flex gap-1.5 border-t border-subtle pt-2">
            <input className={input} value={name} maxLength={60} placeholder="Save current as..." onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
            <button type="button" className={cn(mini, 'shrink-0')} disabled={!name.trim() || !value.trim()} onClick={save}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
