'use client';
// Track detail: file facts, actions (Studio / Editor / copy), and the notes editor (title, credits, Suno link, tags, BPM, key, lyrics).
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clapperboard, Cloud, Copy, ExternalLink, Film, Pause, Play, Plus, Save, Undo2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Cover } from './Cover';
import { fmtBytes, fmtClock } from './format';
import { brctlCommand } from '@/lib/media-ids';
import type { MusicTrack, TrackMeta } from './types';

const QUICK_CREDITS = ['Patrick', 'Suno', 'Seraphim of the Void'];

interface Draft {
  title: string;
  lyrics: string;
  notes: string;
  sunoUrl: string;
  key: string;
  bpm: string;
  tags: string;
  credits: string[];
}

const toDraft = (m: TrackMeta): Draft => ({
  title: m.title ?? '',
  lyrics: m.lyrics ?? '',
  notes: m.notes ?? '',
  sunoUrl: m.sunoUrl ?? '',
  key: m.key ?? '',
  bpm: m.bpm === null || m.bpm === undefined ? '' : String(m.bpm),
  tags: (m.tags ?? []).join(', '),
  credits: m.credits ?? [],
});

function toMeta(d: Draft): TrackMeta {
  const meta: TrackMeta = {
    title: d.title.trim() || undefined,
    lyrics: d.lyrics.trim() ? d.lyrics : undefined,
    notes: d.notes.trim() ? d.notes : undefined,
    sunoUrl: d.sunoUrl.trim() || undefined,
    key: d.key.trim() || undefined,
    credits: d.credits.length ? d.credits : undefined,
    tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean),
    bpm: d.bpm.trim() === '' ? undefined : Number(d.bpm),
  };
  if (!meta.tags?.length) delete meta.tags;
  return meta;
}

const field = 'w-full rounded-md border border-subtle bg-obsidian px-2.5 py-1.5 text-[12.5px] text-paper placeholder:text-muted focus:border-orange/60 focus:outline-none';
const label = 'mb-1 block font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted';
const actionBtn =
  'inline-flex h-7 items-center gap-1 rounded-full border border-subtle px-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] text-secondary transition-colors hover:border-highlight hover:text-paper disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-subtle disabled:hover:text-secondary';

export interface TrackPanelProps {
  track: MusicTrack;
  metaOk: boolean;
  metaReason: string | null;
  isCurrent: boolean;
  playing: boolean;
  saving: boolean;
  onClose: () => void;
  onPlay: () => void;
  onSave: (meta: TrackMeta) => void;
  onDirty: (dirty: boolean) => void;
  onUseInStudio: () => void;
  onSendToEditor: () => void;
  onCopy: (text: string, what: string) => void;
}

export function TrackPanel(p: TrackPanelProps) {
  const { track } = p;
  // Keyed by content, so a library refresh that changes nothing does not throw away what is being typed.
  const savedKey = JSON.stringify(toDraft(track.meta));
  const saved = useMemo(() => JSON.parse(savedKey) as Draft, [savedKey]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [creditInput, setCreditInput] = useState('');
  const patch = (x: Partial<Draft>) => setDraft((d) => ({ ...d, ...x }));

  // The panel is keyed by track id, so `saved` only changes when a save lands: adopt it (draft == what was sent).
  useEffect(() => setDraft(saved), [saved]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const { onDirty } = p;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  const bpmBad = draft.bpm.trim() !== '' && !(Number(draft.bpm) >= 20 && Number(draft.bpm) <= 400);
  const urlBad = draft.sunoUrl.trim() !== '' && !/^https?:\/\/\S+$/i.test(draft.sunoUrl.trim());
  const canSave = p.metaOk && dirty && !p.saving && !bpmBad && !urlBad;
  const save = () => canSave && p.onSave(toMeta(draft));

  const toggleCredit = (c: string) =>
    patch({ credits: draft.credits.some((x) => x.toLowerCase() === c.toLowerCase()) ? draft.credits.filter((x) => x.toLowerCase() !== c.toLowerCase()) : [...draft.credits, c] });
  const addCredit = () => {
    const c = creditInput.trim();
    if (c && !draft.credits.some((x) => x.toLowerCase() === c.toLowerCase())) patch({ credits: [...draft.credits, c] });
    setCreditInput('');
  };
  const extraCredits = draft.credits.filter((c) => !QUICK_CREDITS.some((q) => q.toLowerCase() === c.toLowerCase()));
  const offline = track.storage === 'icloud';

  const facts: [string, string][] = [
    ['Format', `${track.format}${track.codec ? ` (${track.codec})` : ''}`],
    ['Size', fmtBytes(track.bytes)],
    ['Length', fmtClock(track.durationSec)],
    ['Bitrate', track.bitrateKbps ? `${track.bitrateKbps} kbps` : '—'],
    ['Sample rate', track.sampleRate ? `${(track.sampleRate / 1000).toFixed(1)} kHz` : '—'],
    ['Channels', track.channels ? (track.channels === 1 ? 'mono' : track.channels === 2 ? 'stereo' : String(track.channels)) : '—'],
  ];
  const tagRows = (Object.entries(track.tags) as [string, string | undefined][]).filter(([, v]) => v);

  return (
    <aside
      className="hud-scroll flex w-[430px] max-w-[46vw] shrink-0 flex-col overflow-y-auto border-l border-subtle bg-panel max-md:fixed max-md:inset-x-0 max-md:top-[calc(3.5rem+env(safe-area-inset-top,0px))] max-md:bottom-[var(--mobile-tabbar-space)] max-md:z-40 max-md:w-full max-md:max-w-none max-md:border-l-0"
      aria-label="Track details"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          save();
        }
      }}
    >
      <div className="flex items-start gap-3 border-b border-subtle p-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-subtle">
          <Cover track={track} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-[17px] font-bold leading-tight text-paper" title={track.fileName}>
            {draft.title.trim() || track.title}
          </h2>
          <p className="mt-1 truncate font-mono text-[10px] text-muted" title={track.path}>
            {track.fileName}
          </p>
          <span
            className={cn(
              'mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.05em]',
              offline ? 'border-amber/50 text-amber' : 'border-green/40 text-green',
            )}
          >
            {offline ? <Cloud className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-green" />}
            {offline ? 'In iCloud' : 'Local'}
          </span>
        </div>
        <button type="button" onClick={p.onClose} aria-label="Close details" className="rounded-full p-1.5 text-muted hover:text-paper">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-5 p-4">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={cn(actionBtn, 'border-orange/40 text-orange hover:border-orange hover:text-orange')} onClick={p.onPlay} disabled={offline}>
            {p.isCurrent && p.playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />} {p.isCurrent && p.playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" className={actionBtn} onClick={p.onUseInStudio} disabled={offline} title="Copy this track's file id for Studio's Mux audio preset">
            <Clapperboard className="h-3 w-3" /> Use in Studio
          </button>
          <button type="button" className={actionBtn} onClick={p.onSendToEditor} disabled={offline} title="Add the stream URL to the VOLTA Editor inbox">
            <Film className="h-3 w-3" /> Send to Editor
          </button>
          <button type="button" className={actionBtn} onClick={() => p.onCopy(track.path, 'Path')}>
            <Copy className="h-3 w-3" /> Path
          </button>
        </div>

        {offline && (
          <div className="rounded-lg border border-amber/40 bg-amber/5 p-3 text-[12px] leading-relaxed text-paper">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
              <span>
                This file is an iCloud placeholder (0 bytes on this Mac). It cannot be played, probed or sent anywhere until it is downloaded. VOLTA never triggers the download; run this in Terminal:
              </span>
            </p>
            <code className="mt-2 block break-all rounded bg-obsidian px-2 py-1.5 font-mono text-[10.5px] text-secondary">{brctlCommand(track.path)}</code>
            <button type="button" className={cn(actionBtn, 'mt-2')} onClick={() => p.onCopy(brctlCommand(track.path), 'Download command')}>
              <Copy className="h-3 w-3" /> Copy command
            </button>
          </div>
        )}

        <dl className="grid grid-cols-3 gap-x-3 gap-y-2.5">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted">{k}</dt>
              <dd className="mt-0.5 font-mono text-[11.5px] text-paper">{v}</dd>
            </div>
          ))}
        </dl>
        {tagRows.length > 0 && (
          <div>
            <span className={label}>Embedded tags</span>
            <p className="font-mono text-[11px] leading-relaxed text-secondary">
              {tagRows.map(([k, v]) => (
                <span key={k} className="mr-3 inline-block">
                  <span className="text-muted">{k}</span> {v}
                </span>
              ))}
            </p>
          </div>
        )}

        <hr className="border-subtle" />

        {!p.metaOk && (
          <p className="flex items-start gap-2 rounded-md border border-amber/40 bg-amber/5 px-3 py-2 text-[12px] text-paper">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
            {p.metaReason ?? 'Notes storage is unavailable.'} Saving is disabled.
          </p>
        )}

        <div>
          <label className={label} htmlFor="mt-title">
            Title
          </label>
          <input id="mt-title" className={field} value={draft.title} placeholder={track.title} onChange={(e) => patch({ title: e.target.value })} maxLength={200} />
        </div>

        <div>
          <span className={label}>Credits</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_CREDITS.map((c) => {
              const on = draft.credits.some((x) => x.toLowerCase() === c.toLowerCase());
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCredit(c)}
                  aria-pressed={on}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11.5px] transition-colors',
                    on ? 'border-orange bg-orange/10 text-paper' : 'border-subtle text-secondary hover:border-highlight hover:text-paper',
                  )}
                >
                  {c}
                </button>
              );
            })}
            {extraCredits.map((c) => (
              <button key={c} type="button" onClick={() => toggleCredit(c)} className="inline-flex items-center gap-1 rounded-full border border-orange bg-orange/10 px-2.5 py-1 text-[11.5px] text-paper" title="Remove">
                {c} <X className="h-3 w-3 text-muted" />
              </button>
            ))}
            <span className="inline-flex items-center gap-1">
              <input
                className={cn(field, 'h-7 w-32 py-0')}
                value={creditInput}
                placeholder="Add credit"
                onChange={(e) => setCreditInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCredit();
                  }
                }}
                maxLength={60}
                aria-label="Add credit"
              />
              <button type="button" onClick={addCredit} aria-label="Add credit" className="rounded-full p-1 text-muted hover:text-paper">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
        </div>

        <div>
          <label className={label} htmlFor="mt-suno">
            Suno link
          </label>
          <div className="flex items-center gap-1.5">
            <input id="mt-suno" className={cn(field, urlBad && 'border-[#EF4444]/60')} value={draft.sunoUrl} placeholder="https://suno.com/song/..." onChange={(e) => patch({ sunoUrl: e.target.value })} inputMode="url" />
            {draft.sunoUrl.trim() && !urlBad && (
              <a href={draft.sunoUrl.trim()} target="_blank" rel="noreferrer noopener" aria-label="Open Suno link" className="rounded-full p-1.5 text-muted hover:text-paper">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
          {urlBad && <p className="mt-1 text-[11px] text-[#EF4444]">Needs a full http(s) URL.</p>}
        </div>

        <div className="grid grid-cols-[1fr_88px_88px] gap-2">
          <div>
            <label className={label} htmlFor="mt-tags">
              Mood / tags
            </label>
            <input id="mt-tags" className={field} value={draft.tags} placeholder="dark, synth, anthemic" onChange={(e) => patch({ tags: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="mt-bpm">
              BPM
            </label>
            <input id="mt-bpm" className={cn(field, bpmBad && 'border-[#EF4444]/60')} value={draft.bpm} inputMode="decimal" placeholder="—" onChange={(e) => patch({ bpm: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="mt-key">
              Key
            </label>
            <input id="mt-key" className={field} value={draft.key} placeholder="F#m" onChange={(e) => patch({ key: e.target.value })} maxLength={16} />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="mt-lyrics">
            Lyrics
          </label>
          <textarea
            id="mt-lyrics"
            className={cn(field, 'hud-scroll min-h-[220px] resize-y font-serif text-[14px] leading-relaxed')}
            value={draft.lyrics}
            placeholder={'[Verse 1]\n...'}
            onChange={(e) => patch({ lyrics: e.target.value })}
          />
        </div>

        <div>
          <label className={label} htmlFor="mt-notes">
            Notes
          </label>
          <textarea id="mt-notes" className={cn(field, 'hud-scroll min-h-[80px] resize-y')} value={draft.notes} placeholder="Prompt used, what to fix in the remaster, where it is going..." onChange={(e) => patch({ notes: e.target.value })} />
        </div>
      </div>

      <div className="sticky bottom-0 mt-auto flex items-center gap-2 border-t border-subtle bg-panel/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-orange px-4 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-black transition-opacity disabled:cursor-not-allowed disabled:bg-panel-elevated disabled:text-muted"
        >
          <Save className="h-3.5 w-3.5" /> {p.saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={() => setDraft(saved)} disabled={!dirty || p.saving} className={cn(actionBtn, 'h-8')}>
          <Undo2 className="h-3 w-3" /> Revert
        </button>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.05em] text-muted">
          {dirty ? 'Unsaved changes' : track.meta.updatedAt ? `Saved ${new Date(track.meta.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'No notes yet'}
        </span>
      </div>
    </aside>
  );
}
