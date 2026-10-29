'use client';
// "Create in Suno": a song (lyrics + style tags) or a speech clip (script + tone) -> an interactive `claude --chrome` session
// that fills in suno.com/create in Patrick's own Chrome and downloads the MP3s -> "Import from Downloads" moves them into
// the Suno library folder on Windsor. Every creation spends Suno credits, so it always goes through a confirm step.
// The local suno-api service only shows credits now; when it is down or its cookie is stale, creating still works.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, Loader2, RefreshCw, Sparkles, Terminal } from 'lucide-react';
import { cn } from '@/lib/cn';
import { api } from './music-client';
import { SUNO_CREDIT_CHOICES } from './suno-types';
import type { SunoCreateBody, SunoCredit, SunoHandoff, SunoImportResult, SunoMode, SunoSaveContext, SunoSoundType, SunoStatus, SunoVoice } from './suno-types';
import { DraftBar, ListChips, LyricTools, Presets } from './SunoComposer';
import { EXAMPLE_LYRICS_SKELETON, EXAMPLE_STYLE, KEYS, SOUND_GROUPS, STYLE_GROUPS, TONE_GROUPS } from './suno-formulas';

const DRAFT_KEY = 'volta:music:suno:draft';
const PENDING_KEY = 'volta:music:suno:handoff';
const CLAIM_AFTER_DAYS = 2;

interface Draft {
  mode: SunoMode;
  title: string;
  tags: string;
  lyrics: string;
  instrumental: boolean;
  script: string;
  tone: string;
  voice: SunoVoice;
  sound: string;
  soundType: SunoSoundType;
  bpm: string;
  key: string;
  seraphim: boolean;
}
const EMPTY: Draft = { mode: 'song', title: '', tags: '', lyrics: '', instrumental: false, script: '', tone: '', voice: 'any', sound: '', soundType: 'one-shot', bpm: '', key: 'Any', seraphim: false };
const MODES: { id: SunoMode; label: string }[] = [
  { id: 'song', label: 'Song' },
  { id: 'speech', label: 'Speech' },
  { id: 'sound', label: 'Sound' },
];

interface Pending {
  since: number;
  ctx: SunoSaveContext;
}

type Phase = 'idle' | 'confirm' | 'submitting' | 'handed_off' | 'importing' | 'done';

const field = 'w-full rounded-md border border-subtle bg-obsidian px-2.5 py-1.5 text-[12.5px] text-paper placeholder:text-muted focus:border-orange/60 focus:outline-none disabled:opacity-50';
const label = 'mb-1 block font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted';
const btn =
  'inline-flex h-8 items-center gap-1.5 rounded-full border border-subtle px-3.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary transition-colors hover:border-highlight hover:text-paper disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-subtle disabled:hover:text-secondary';
const primaryBtn =
  'inline-flex h-8 items-center gap-1.5 rounded-full bg-orange px-4 font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';

const readJson = <T,>(key: string): T | null => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const writeJson = (key: string, value: unknown) => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable: the panel still works, it just forgets across reloads
  }
};

export interface SunoPanelProps {
  onSaved: () => void;
  onCopy: (text: string, what: string) => void;
  onToast: (message: string, tone: 'success' | 'error') => void;
}

export function SunoPanel({ onSaved, onCopy, onToast }: SunoPanelProps) {
  const [status, setStatus] = useState<SunoStatus | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pending, setPending] = useState<Pending | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [results, setResults] = useState<SunoImportResult[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const patch = (x: Partial<Draft>) => setDraft((d) => ({ ...d, ...x }));
  const lyricsRef = useRef<HTMLTextAreaElement | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      setStatus(await api<SunoStatus>('/api/music/suno/status'));
      setStatusErr(null);
    } catch (err) {
      setStatusErr((err as Error).message);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
    const d = readJson<Partial<Draft>>(DRAFT_KEY);
    if (d) setDraft({ ...EMPTY, ...d });
    const p = readJson<Pending>(PENDING_KEY);
    if (p && typeof p.since === 'number' && p.ctx && Date.now() - p.since < CLAIM_AFTER_DAYS * 86_400_000) {
      setPending(p);
      setPhase('handed_off');
    } else writeJson(PENDING_KEY, null);
  }, [check]);

  useEffect(() => {
    writeJson(DRAFT_KEY, draft);
  }, [draft]);

  const isSong = draft.mode === 'song';
  const credits: SunoCredit[] = SUNO_CREDIT_CHOICES.filter((c) => c === 'Patrick' || c === 'Suno' || (c === 'Seraphim of the Void' && draft.seraphim));
  const ctx: SunoSaveContext = {
    mode: draft.mode,
    title: draft.title.trim(),
    tags: isSong ? draft.tags.trim() : draft.mode === 'speech' ? draft.tone.trim() : '',
    lyrics: isSong ? (draft.instrumental ? '' : draft.lyrics) : draft.mode === 'speech' ? draft.script : draft.sound,
    instrumental: isSong && draft.instrumental,
    credits,
  };
  /** The rest of the piece, so AI drafts of one field fit the others. */
  const draftContext = [
    draft.title.trim() && `Title: ${draft.title.trim()}`,
    isSong && draft.tags.trim() && `Style: ${draft.tags.trim()}`,
    isSong && (draft.instrumental ? 'Instrumental (no vocals).' : draft.lyrics.trim() && `Lyrics so far:\n${draft.lyrics.trim().slice(0, 1500)}`),
    draft.mode === 'speech' && draft.tone.trim() && `Tone: ${draft.tone.trim()}`,
    draft.mode === 'speech' && draft.script.trim() && `Script so far:\n${draft.script.trim().slice(0, 1500)}`,
    draft.mode === 'sound' && `${draft.soundType === 'loop' ? 'Loop' : 'One-shot'}${draft.bpm ? `, ${draft.bpm} BPM` : ''}${draft.key !== 'Any' ? `, key ${draft.key}` : ''}`,
  ]
    .filter(Boolean)
    .join('\n');

  const missingInput = !draft.title.trim()
    ? 'Add a title.'
    : isSong
      ? !draft.tags.trim()
        ? 'Add style tags.'
        : !draft.instrumental && !draft.lyrics.trim()
          ? 'Add lyrics, or switch on Instrumental.'
          : null
      : draft.mode === 'speech'
        ? !draft.script.trim()
          ? 'Add the script to speak.'
          : null
        : !draft.sound.trim()
          ? 'Describe the sound.'
          : null;
  const busy = phase === 'submitting' || phase === 'handed_off' || phase === 'importing';
  const canCreate = !!status?.canCreate;

  const submit = async () => {
    setPhase('submitting');
    setNote(null);
    setResults([]);
    setBrief(null);
    const body: SunoCreateBody = {
      mode: draft.mode,
      title: ctx.title,
      tags: draft.tags.trim(),
      lyrics: draft.lyrics,
      instrumental: ctx.instrumental,
      script: draft.script,
      tone: draft.tone.trim(),
      voice: draft.voice,
      sound: draft.sound.trim(),
      soundType: draft.soundType,
      bpm: draft.bpm.trim(),
      key: draft.key,
      confirm: true,
    };
    try {
      const h = await api<SunoHandoff>('/api/music/suno/generate', { method: 'POST', body });
      const p: Pending = { since: h.since, ctx };
      writeJson(PENDING_KEY, p);
      setPending(p);
      setPhase('handed_off');
      if (h.opened) {
        setNote(null);
        onToast('Claude is creating it in your Chrome. Watch the Terminal window.', 'success');
      } else {
        setBrief(h.prompt);
        setNote(`Could not open Terminal${h.error ? `: ${h.error}` : ''}. Copy the brief and run it with \`claude --chrome\` yourself.`);
      }
    } catch (err) {
      setNote((err as Error).message);
      setPhase('idle');
      onToast((err as Error).message, 'error');
      void check();
    }
  };

  const importNow = async () => {
    if (!pending) return;
    setPhase('importing');
    setNote(null);
    try {
      const out = await api<{ results: SunoImportResult[]; rootEnabled: boolean; dir: string }>('/api/music/suno/import', { method: 'POST', body: { since: pending.since, ...pending.ctx } });
      setResults(out.results);
      const saved = out.results.filter((r) => r.state === 'saved').length;
      const failed = out.results.filter((r) => r.state === 'error').length;
      if (!out.results.length) {
        setNote('No new .mp3 or .wav files in ~/Downloads yet. Wait for the downloads to finish, then import again.');
        setPhase('handed_off');
        return;
      }
      if (failed) {
        setNote(`${failed} file${failed === 1 ? '' : 's'} could not be imported. They stay in ~/Downloads; import again once they finish downloading.`);
        setPhase('handed_off');
      } else {
        writeJson(PENDING_KEY, null);
        setPending(null);
        setPhase('done');
      }
      if (saved) {
        onSaved();
        onToast(`${saved} file${saved === 1 ? '' : 's'} imported to ${out.dir}.${out.rootEnabled ? '' : ' The Suno folder is disabled under Folders.'}`, 'success');
      }
      void check();
    } catch (err) {
      setNote((err as Error).message);
      setPhase('handed_off');
    }
  };

  const forget = () => {
    writeJson(PENDING_KEY, null);
    setPending(null);
    setPhase('idle');
    setNote(null);
    setBrief(null);
  };

  return (
    <section className="hud-scroll max-h-[70vh] shrink-0 overflow-y-auto border-b border-subtle bg-panel px-4 py-3" aria-label="Create in Suno">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="hud-label flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-orange" /> Create in Suno · your Chrome
        </p>
        {status?.credits && (
          <span className="rounded-full border border-subtle bg-panel-elevated px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em] text-secondary" title="From Suno via the local service">
            <span className="text-green">{status.credits.left}</span> credits left
            {status.credits.monthlyLimit !== null && status.credits.monthlyUsage !== null ? ` · ${status.credits.monthlyUsage}/${status.credits.monthlyLimit} used this ${status.credits.period ?? 'month'}` : ''}
          </span>
        )}
        <button type="button" className={cn(btn, 'ml-auto h-7 px-3')} onClick={() => void check()} disabled={checking}>
          <RefreshCw className={cn('h-3 w-3', checking && 'animate-spin')} /> Recheck
        </button>
      </div>

      {statusErr && <p className="mb-3 rounded-md border border-[#EF4444]/40 bg-[#EF4444]/5 px-3 py-2 font-mono text-[11px] text-[#EF4444]">Could not check the Suno service: {statusErr}</p>}
      {!status && !statusErr && <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Checking the Suno service...</p>}
      {status && !status.windsorMounted && (
        <p className="mb-3 rounded-md border border-amber/40 bg-amber/5 px-3 py-2 text-[12.5px] text-paper">The Windsor drive is not mounted, so finished files have nowhere to go. Plug it in, then press Recheck.</p>
      )}
      {status && status.windsorMounted && !status.ready && <CreditsState status={status} onCopy={onCopy} />}

      <div className="mb-3 flex gap-1.5" role="tablist" aria-label="What to create">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={draft.mode === m.id}
            disabled={busy}
            className={cn(btn, 'h-7 px-3', draft.mode === m.id && 'border-orange/60 text-paper')}
            onClick={() => patch({ mode: m.id })}
          >
            {m.label}
          </button>
        ))}
        <span className="ml-2 self-center font-mono text-[10px] text-muted">{draft.mode === 'song' ? 'Suno Songs' : draft.mode === 'speech' ? 'Suno Speech · voiceover for videos' : 'Suno Sounds · FX and loops for videos'}</span>
      </div>

      <fieldset disabled={!canCreate || busy} className={cn('grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]', !canCreate && 'opacity-50')}>
        <div className="space-y-3">
          <div>
            <label className={label} htmlFor="suno-title">Title</label>
            <input id="suno-title" className={field} value={draft.title} maxLength={100} onChange={(e) => patch({ title: e.target.value })} placeholder={isSong ? 'Song title' : draft.mode === 'speech' ? 'Clip title' : 'Sound name'} />
          </div>

          {isSong && (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <label className={cn(label, 'mb-0')} htmlFor="suno-tags">Style</label>
                  <span className="ml-auto font-mono text-[9.5px] text-muted">{draft.tags.length}/1000</span>
                  <Presets kind="style" value={draft.tags} onLoad={(t) => patch({ tags: t })} builtIn={[{ name: 'Toycore glitch (dark 8-bit)', text: EXAMPLE_STYLE }]} />
                </div>
                <textarea id="suno-tags" className={cn(field, 'min-h-[84px] resize-y leading-relaxed')} value={draft.tags} maxLength={1000} onChange={(e) => patch({ tags: e.target.value })} placeholder="dark emotional 8-bit toycore, glitch hop, toy piano arpeggios, deep moog synth, half time groove..." />
                <ListChips groups={STYLE_GROUPS} value={draft.tags} onChange={(v) => patch({ tags: v })} title="Style chips · click to add or remove" />
                <DraftBar kind="style" current={draft.tags} context={draftContext} onApply={(t) => patch({ tags: t })} placeholder="Brief: e.g. haunted nursery rhyme meets industrial trap, female hook" />
                <p className="font-mono text-[10px] text-muted">Comma-separated. These also become the track tags in the library.</p>
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-paper">
                <input type="checkbox" className="h-3.5 w-3.5 accent-[#FF5500]" checked={draft.instrumental} onChange={(e) => patch({ instrumental: e.target.checked })} />
                Instrumental (no vocals; lyrics are ignored)
              </label>
            </>
          )}

          {draft.mode === 'speech' && (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <label className={cn(label, 'mb-0')} htmlFor="suno-tone">Tone</label>
                  <span className="ml-auto font-mono text-[9.5px] text-muted">{draft.tone.length}/500</span>
                  <Presets kind="tone" value={draft.tone} onLoad={(t) => patch({ tone: t })} builtIn={[{ name: 'Late-night documentary', text: 'low warm male voice, slow and deliberate, measured pauses, documentary calm, close mic' }]} />
                </div>
                <textarea id="suno-tone" className={cn(field, 'min-h-[60px] resize-y leading-relaxed')} value={draft.tone} maxLength={500} onChange={(e) => patch({ tone: e.target.value })} placeholder="Describe the delivery: tone, pacing, mood and setting" />
                <ListChips groups={TONE_GROUPS} value={draft.tone} onChange={(v) => patch({ tone: v })} title="Tone chips · voice, pacing, mood, setting" />
                <DraftBar kind="tone" current={draft.tone} context={draftContext} onApply={(t) => patch({ tone: t })} placeholder="Brief: e.g. an old archivist confessing something on a crackly phone line" />
              </div>
              <div>
                <label className={label} htmlFor="suno-voice">Vocal gender</label>
                <select id="suno-voice" className={field} value={draft.voice} onChange={(e) => patch({ voice: e.target.value as SunoVoice })}>
                  <option value="any">Let Suno choose</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </div>
            </>
          )}

          {draft.mode === 'sound' && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={label} htmlFor="suno-stype">Type</label>
                <select id="suno-stype" className={field} value={draft.soundType} onChange={(e) => patch({ soundType: e.target.value as SunoSoundType })}>
                  <option value="one-shot">One-shot</option>
                  <option value="loop">Loop</option>
                </select>
              </div>
              <div>
                <label className={label} htmlFor="suno-bpm">BPM</label>
                <input id="suno-bpm" className={field} inputMode="numeric" value={draft.bpm} placeholder="Auto" onChange={(e) => patch({ bpm: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
              </div>
              <div>
                <label className={label} htmlFor="suno-key">Key</label>
                <select id="suno-key" className={field} value={draft.key} onChange={(e) => patch({ key: e.target.value })}>
                  {KEYS.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-[12.5px] text-paper">
            <input type="checkbox" className="h-3.5 w-3.5 accent-[#FF5500]" checked={draft.seraphim} onChange={(e) => patch({ seraphim: e.target.checked })} />
            Also credit &quot;Seraphim of the Void&quot;
          </label>
          <p className="font-mono text-[10px] text-muted">Credits recorded: {credits.join(', ')}</p>
        </div>

        <div className="space-y-1.5">
          {isSong && (
            <>
              <div className="flex items-center gap-2">
                <label className={cn(label, 'mb-0')} htmlFor="suno-lyrics">Lyrics + composition</label>
                <span className="ml-auto font-mono text-[9.5px] text-muted">{draft.lyrics.length}/5000</span>
                <Presets kind="lyrics" value={draft.lyrics} onLoad={(t) => patch({ lyrics: t })} builtIn={[{ name: 'Forbidden Names (format example)', text: EXAMPLE_LYRICS_SKELETON }]} />
              </div>
              {!draft.instrumental && <LyricTools value={draft.lyrics} onChange={(v) => patch({ lyrics: v })} textRef={lyricsRef} title={draft.title} />}
              <textarea
                ref={lyricsRef}
                id="suno-lyrics"
                className={cn(field, 'min-h-[300px] resize-y font-mono leading-relaxed')}
                value={draft.lyrics}
                maxLength={5000}
                disabled={draft.instrumental}
                onChange={(e) => patch({ lyrics: e.target.value })}
                placeholder={'[152 BPM] [Melodic Industrial Trap] [Key: D harmonic minor] [4/4]\n\n[Verse 1 – restrained, intimate]\n[Half-time trap beat] [808 glide] [Low male vocal] [Dm–C–Bb–A]\nLines here...\n\n[Hook – huge, melodic]\n[Full drums] [Wide female lead] [Forte]\n...'}
              />
              {!draft.instrumental && <DraftBar kind="lyrics" current={draft.lyrics} context={draftContext} onApply={(t) => patch({ lyrics: t })} placeholder="Brief: theme, story, hook idea, structure (e.g. the Watchers teaching forbidden arts, anthem hook)" />}
            </>
          )}
          {draft.mode === 'speech' && (
            <>
              <div className="flex items-center gap-2">
                <label className={cn(label, 'mb-0')} htmlFor="suno-script">Script</label>
                <span className="ml-auto font-mono text-[9.5px] text-muted">{draft.script.length}/5000</span>
                <Presets kind="script" value={draft.script} onLoad={(t) => patch({ script: t })} builtIn={[]} />
              </div>
              <textarea id="suno-script" className={cn(field, 'min-h-[300px] resize-y leading-relaxed')} value={draft.script} maxLength={5000} onChange={(e) => patch({ script: e.target.value })} placeholder="Write or paste your speech. Line breaks are breaths; … is a held pause." />
              <DraftBar kind="script" current={draft.script} context={draftContext} onApply={(t) => patch({ script: t })} placeholder="Brief: what the voiceover says, length, the scene it plays over" />
            </>
          )}
          {draft.mode === 'sound' && (
            <>
              <div className="flex items-center gap-2">
                <label className={cn(label, 'mb-0')} htmlFor="suno-sound">Sound</label>
                <span className="ml-auto font-mono text-[9.5px] text-muted">{draft.sound.length}/500</span>
                <Presets kind="sound" value={draft.sound} onLoad={(t) => patch({ sound: t })} builtIn={[{ name: 'Cinematic sub impact', text: 'deep sub boom impact with a metallic tail, huge cathedral reverb, cinematic, decays into low rumble' }]} />
              </div>
              <textarea id="suno-sound" className={cn(field, 'min-h-[110px] resize-y leading-relaxed')} value={draft.sound} maxLength={500} onChange={(e) => patch({ sound: e.target.value })} placeholder="Describe the sound you want: source, texture, space, character" />
              <ListChips groups={SOUND_GROUPS} value={draft.sound} onChange={(v) => patch({ sound: v })} title="Sound chips · source, texture, space, character" />
              <DraftBar kind="sound" current={draft.sound} context={draftContext} onApply={(t) => patch({ sound: t })} placeholder="Brief: e.g. a door opening onto something enormous breathing in the dark" />
            </>
          )}
        </div>
      </fieldset>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {phase === 'confirm' ? (
          <div className="flex flex-1 flex-wrap items-center gap-3 rounded-md border border-amber/50 bg-amber/5 px-3 py-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber" />
            <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-paper">
              <strong>This spends Suno credits.</strong> A song typically costs about 10 credits and returns 2 clips.
              {status?.credits ? ` You have ${status.credits.left} left.` : ''} A Terminal window opens where Claude creates &quot;{ctx.title}&quot; in your Chrome and downloads it. If Cloudflare asks &quot;Verify you are human&quot;, tick it yourself.
            </p>
            <button type="button" className={primaryBtn} onClick={() => void submit()}>
              <Sparkles className="h-3 w-3" /> Spend credits and create
            </button>
            <button type="button" className={btn} onClick={() => setPhase('idle')}>
              Cancel
            </button>
          </div>
        ) : phase === 'idle' || phase === 'done' ? (
          <>
            <button type="button" className={primaryBtn} disabled={!canCreate || !!missingInput} onClick={() => (setResults([]), setPhase('confirm'))}>
              <Sparkles className="h-3 w-3" /> Create in Suno
            </button>
            {canCreate && missingInput && <span className="font-mono text-[10.5px] text-muted">{missingInput}</span>}
          </>
        ) : null}
        {phase === 'submitting' && (
          <span className="flex items-center gap-2 font-mono text-[11px] text-secondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Opening Claude in Terminal...
          </span>
        )}
      </div>

      {(phase === 'handed_off' || phase === 'importing') && pending && (
        <div className="mt-3 rounded-md border border-subtle bg-obsidian px-3 py-2.5">
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-paper">
            <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-orange" />
            <span>
              Claude is creating &quot;{pending.ctx.title}&quot; ({pending.ctx.mode}) in your Chrome. When it says the MP3s are downloaded, import them from ~/Downloads into the Suno folder on Windsor.
            </span>
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" className={primaryBtn} disabled={phase === 'importing'} onClick={() => void importNow()}>
              {phase === 'importing' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Import from Downloads
            </button>
            {brief && (
              <button type="button" className={btn} onClick={() => onCopy(brief, 'Suno brief')}>
                <Copy className="h-3 w-3" /> Copy brief
              </button>
            )}
            <button type="button" className={btn} disabled={phase === 'importing'} onClick={forget}>
              Stop tracking
            </button>
          </div>
        </div>
      )}

      {note && <p className="mt-3 rounded-md border border-amber/40 bg-amber/5 px-3 py-2 text-[12.5px] text-paper">{note}</p>}

      {results.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-label="Imported files">
          {results.map((r) => (
            <li key={r.from} className="flex flex-wrap items-center gap-3 rounded-md border border-subtle bg-obsidian px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-paper">{r.from}</span>
              <span className={cn('inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.05em]', r.state === 'error' ? 'text-[#EF4444]' : 'text-green')}>
                {r.state === 'error' ? null : <Check className="h-3 w-3" />}
                {r.state === 'saved' ? `imported · ${r.file}` : r.state === 'duplicate' ? `already in library · ${r.file}` : (r.message ?? r.state)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CopyLine({ text, what, onCopy }: { text: string; what: string; onCopy: SunoPanelProps['onCopy'] }) {
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded bg-obsidian px-2.5 py-1.5 font-mono text-[11px] text-secondary" title={text}>
        {text}
      </code>
      <button type="button" className={cn(btn, 'h-7 px-3')} onClick={() => onCopy(text, what)}>
        <Copy className="h-3 w-3" /> Copy
      </button>
    </div>
  );
}

/** The suno-api service only reads credits now, so this is informational: creating works without it. */
function CreditsState({ status, onCopy }: { status: SunoStatus; onCopy: SunoPanelProps['onCopy'] }) {
  const needCookie = status.missing.includes('SUNO_COOKIE') || status.state === 'auth_error';
  return (
    <details className="mb-3 rounded-lg border border-amber/40 bg-amber/5 px-3.5 py-2.5" role="status">
      <summary className="cursor-pointer text-[12.5px] text-paper">
        <strong className="font-semibold">Credits unavailable.</strong> {status.message}
      </summary>
      <div className="mt-3 space-y-3 text-[12.5px] text-secondary">
        {status.state !== 'down' && needCookie && (
          <div>
            <p className="mb-1.5">
              Put a fresh <code className="font-mono text-[11px]">SUNO_COOKIE</code> (the Cookie header of the <code className="font-mono text-[11px]">auth.suno.com/v1/client</code> request, signed in) in this file. It holds a secret, so do not share it:
            </p>
            <CopyLine text={status.envPath} what="Path" onCopy={onCopy} />
          </div>
        )}
        <div>
          <p className="mb-1.5">{status.state === 'down' ? 'Start (or restart) the service:' : 'Then restart the service and press Recheck:'}</p>
          <CopyLine text={status.restartCommand} what="Restart command" onCopy={onCopy} />
          <p className="mt-1.5 font-mono text-[10px] text-muted">Log: {status.logPath}</p>
        </div>
      </div>
    </details>
  );
}
