'use client';
// "Generate in Suno": lyrics + style tags + title -> the local suno-api service -> mp3s in the Suno library folder on Windsor.
// Every generation spends Suno credits, so it always goes through a confirm step. When the service is down or the cookie /
// 2Captcha key are not set, the panel shows the setup state with the exact file to edit instead of the form.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { api } from './music-client';
import { SUNO_CREDIT_CHOICES } from './suno-types';
import type { SunoClip, SunoCredit, SunoGenerateBody, SunoSaveContext, SunoSaveResult, SunoStatus } from './suno-types';

const DRAFT_KEY = 'volta:music:suno:draft';
const PENDING_KEY = 'volta:music:suno:pending';
const POLL_MS = 5000;
const GIVE_UP_MS = 8 * 60_000;
const CLAIM_AFTER_DAYS = 2;

interface Draft {
  title: string;
  tags: string;
  lyrics: string;
  instrumental: boolean;
  seraphim: boolean;
}
const EMPTY: Draft = { title: '', tags: '', lyrics: '', instrumental: false, seraphim: false };

interface Pending {
  ids: string[];
  ctx: SunoSaveContext;
  at: number;
}

type Phase = 'idle' | 'confirm' | 'submitting' | 'waiting' | 'saving' | 'done' | 'stalled';

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

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
  });

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
  const [clips, setClips] = useState<SunoClip[]>([]);
  const [results, setResults] = useState<SunoSaveResult[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const patch = (x: Partial<Draft>) => setDraft((d) => ({ ...d, ...x }));

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

  // ── poll until every clip is finished, then save them to Windsor ──
  const track = useCallback(
    async (pending: Pending) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const { signal } = ac;
      const deadline = Date.now() + GIVE_UP_MS;
      let failures = 0;
      setPhase('waiting');
      setNote(null);
      for (;;) {
        try {
          const r = await api<{ clips: SunoClip[] }>(`/api/music/suno/poll?ids=${pending.ids.join(',')}`, { signal });
          failures = 0;
          setClips(r.clips);
          if (r.clips.length && r.clips.every((c) => c.status === 'complete' || c.status === 'error')) break;
        } catch (err) {
          if (signal.aborted) return;
          if (++failures >= 5) {
            setNote(`Could not reach Suno to check progress: ${(err as Error).message}`);
            setPhase('stalled');
            return;
          }
        }
        if (Date.now() > deadline) {
          setNote('Still not finished after 8 minutes. Suno keeps working; check again in a bit.');
          setPhase('stalled');
          return;
        }
        await sleep(POLL_MS, signal);
        if (signal.aborted) return;
      }
      setPhase('saving');
      try {
        const out = await api<{ results: SunoSaveResult[]; rootEnabled: boolean; dir: string }>('/api/music/suno/save', {
          method: 'POST',
          body: { ids: pending.ids, ...pending.ctx },
          signal,
        });
        setResults(out.results);
        const ok = out.results.filter((r) => r.state === 'saved' || r.state === 'exists').length;
        writeJson(PENDING_KEY, null);
        setPhase('done');
        if (ok) {
          onSaved();
          onToast(`${ok} song${ok === 1 ? '' : 's'} saved to ${out.dir}.${out.rootEnabled ? '' : ' The Suno folder is disabled under Folders.'}`, 'success');
        } else onToast('No songs were saved. See the panel for details.', 'error');
        void check();
      } catch (err) {
        if (signal.aborted) return;
        setNote(`${(err as Error).message}`);
        setPhase('stalled');
      }
    },
    [check, onSaved, onToast],
  );

  useEffect(() => {
    void check();
    const d = readJson<Partial<Draft>>(DRAFT_KEY);
    if (d) setDraft({ ...EMPTY, ...d });
    const p = readJson<Pending>(PENDING_KEY);
    if (p && Array.isArray(p.ids) && p.ids.length && Date.now() - p.at < CLAIM_AFTER_DAYS * 86_400_000) void track(p);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    writeJson(DRAFT_KEY, draft);
  }, [draft]);

  const credits: SunoCredit[] = SUNO_CREDIT_CHOICES.filter((c) => c === 'Patrick' || c === 'Suno' || (c === 'Seraphim of the Void' && draft.seraphim));
  const ctx: SunoSaveContext = { title: draft.title.trim(), tags: draft.tags.trim(), lyrics: draft.instrumental ? '' : draft.lyrics, instrumental: draft.instrumental, credits };

  const missingInput = !draft.title.trim() ? 'Add a title.' : !draft.tags.trim() ? 'Add style tags.' : !draft.instrumental && !draft.lyrics.trim() ? 'Add lyrics, or switch on Instrumental.' : null;
  const busy = phase === 'submitting' || phase === 'waiting' || phase === 'saving';
  const ready = !!status?.ready;

  const submit = async () => {
    setPhase('submitting');
    setNote(null);
    setResults([]);
    setClips([]);
    const body: SunoGenerateBody = { title: ctx.title, tags: ctx.tags, lyrics: ctx.lyrics, instrumental: ctx.instrumental, confirm: true };
    try {
      const r = await api<{ clips: SunoClip[]; credits: SunoStatus['credits'] }>('/api/music/suno/generate', { method: 'POST', body });
      setClips(r.clips);
      if (r.credits) setStatus((s) => (s ? { ...s, credits: r.credits } : s));
      const pending: Pending = { ids: r.clips.map((c) => c.id), ctx, at: Date.now() };
      writeJson(PENDING_KEY, pending);
      void track(pending);
    } catch (err) {
      setNote((err as Error).message);
      setPhase('idle');
      onToast((err as Error).message, 'error');
      void check();
    }
  };

  const retry = () => {
    const p = readJson<Pending>(PENDING_KEY);
    if (p) void track(p);
  };
  const forget = () => {
    abortRef.current?.abort();
    writeJson(PENDING_KEY, null);
    setPhase('idle');
    setNote(null);
  };

  return (
    <section className="hud-scroll max-h-[70vh] shrink-0 overflow-y-auto border-b border-subtle bg-panel px-4 py-3" aria-label="Generate in Suno">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="hud-label flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-orange" /> Generate in Suno · local suno-api
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

      {status && !status.ready && <SetupState status={status} onCopy={onCopy} />}

      <fieldset disabled={!ready || busy} className={cn('grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]', !ready && 'opacity-50')}>
        <div className="space-y-3">
          <div>
            <label className={label} htmlFor="suno-title">Title</label>
            <input id="suno-title" className={field} value={draft.title} maxLength={100} onChange={(e) => patch({ title: e.target.value })} placeholder="Song title" />
          </div>
          <div>
            <label className={label} htmlFor="suno-tags">Style tags</label>
            <input id="suno-tags" className={field} value={draft.tags} maxLength={500} onChange={(e) => patch({ tags: e.target.value })} placeholder="dark synthwave, female vocals, 100 bpm" />
            <p className="mt-1 font-mono text-[10px] text-muted">Comma-separated. These also become the track tags in the library.</p>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-paper">
            <input type="checkbox" className="h-3.5 w-3.5 accent-[#FF5500]" checked={draft.instrumental} onChange={(e) => patch({ instrumental: e.target.checked })} />
            Instrumental (no vocals; lyrics are ignored)
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-paper">
            <input type="checkbox" className="h-3.5 w-3.5 accent-[#FF5500]" checked={draft.seraphim} onChange={(e) => patch({ seraphim: e.target.checked })} />
            Also credit "Seraphim of the Void"
          </label>
          <p className="font-mono text-[10px] text-muted">Credits recorded: {credits.join(', ')}</p>
        </div>
        <div>
          <label className={label} htmlFor="suno-lyrics">Lyrics</label>
          <textarea
            id="suno-lyrics"
            className={cn(field, 'min-h-[170px] resize-y font-mono leading-relaxed')}
            value={draft.lyrics}
            maxLength={5000}
            disabled={draft.instrumental}
            onChange={(e) => patch({ lyrics: e.target.value })}
            placeholder={'[Verse]\nLines here...\n\n[Chorus]\n...'}
          />
          <p className="mt-1 font-mono text-[10px] text-muted">{draft.lyrics.length}/5000 · section tags like [Verse] and [Chorus] work.</p>
        </div>
      </fieldset>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {phase === 'confirm' ? (
          <div className="flex flex-1 flex-wrap items-center gap-3 rounded-md border border-amber/50 bg-amber/5 px-3 py-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber" />
            <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-paper">
              <strong>This spends Suno credits.</strong> Suno typically charges about 10 credits per generation and returns 2 clips.
              {status?.credits ? ` You have ${status.credits.left} left.` : ''} Generate "{ctx.title}"{ctx.instrumental ? ' (instrumental)' : ''}?
            </p>
            <button type="button" className={primaryBtn} onClick={() => void submit()}>
              <Sparkles className="h-3 w-3" /> Spend credits and generate
            </button>
            <button type="button" className={btn} onClick={() => setPhase('idle')}>
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button type="button" className={primaryBtn} disabled={!ready || busy || !!missingInput} onClick={() => setPhase('confirm')}>
              <Sparkles className="h-3 w-3" /> Generate in Suno
            </button>
            {ready && missingInput && phase === 'idle' && <span className="font-mono text-[10.5px] text-muted">{missingInput}</span>}
          </>
        )}
        {phase === 'submitting' && (
          <span className="flex items-center gap-2 font-mono text-[11px] text-secondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting to Suno (solving the captcha can take up to a minute)...
          </span>
        )}
      </div>

      {note && <p className="mt-3 rounded-md border border-amber/40 bg-amber/5 px-3 py-2 text-[12.5px] text-paper">{note}</p>}

      {clips.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-label="Suno clips">
          {clips.map((c) => {
            const r = results.find((x) => x.id === c.id);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-md border border-subtle bg-obsidian px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-paper">{c.title || ctx.title || c.id}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted">{c.id.slice(0, 8)}</span>
                {r ? (
                  <span className={cn('inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.05em]', r.state === 'error' ? 'text-[#EF4444]' : 'text-green')}>
                    {r.state === 'error' ? null : <Check className="h-3 w-3" />}
                    {r.state === 'saved' ? `saved · ${r.file}` : r.state === 'exists' ? `already saved · ${r.file}` : (r.message ?? r.state)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.05em] text-secondary">
                    {c.status !== 'complete' && c.status !== 'error' && <Loader2 className="h-3 w-3 animate-spin" />}
                    {c.status}
                    {c.error ? ` · ${c.error}` : ''}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {phase === 'saving' && (
        <p className="mt-2 flex items-center gap-2 font-mono text-[11px] text-secondary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving the mp3s to Windsor...
        </p>
      )}
      {phase === 'stalled' && (
        <div className="mt-2 flex gap-2">
          <button type="button" className={btn} onClick={retry}>
            <RefreshCw className="h-3 w-3" /> Check again
          </button>
          <button type="button" className={btn} onClick={forget}>
            Stop tracking
          </button>
        </div>
      )}
      {phase === 'done' && (
        <button type="button" className={cn(btn, 'mt-2')} onClick={() => (setPhase('idle'), setClips([]), setResults([]))}>
          Done
        </button>
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

function SetupState({ status, onCopy }: { status: SunoStatus; onCopy: SunoPanelProps['onCopy'] }) {
  const needCookie = status.missing.includes('SUNO_COOKIE') || status.state === 'auth_error';
  const needKey = status.missing.includes('TWOCAPTCHA_KEY');
  return (
    <div className="mb-3 rounded-lg border border-amber/40 bg-amber/5 p-3.5" role="status">
      <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-paper">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
        <span>
          <strong className="font-semibold">
            {status.state === 'down' ? 'The Suno service is not running.' : status.state === 'auth_error' ? 'Suno rejected the saved session.' : 'Suno setup is not finished.'}
          </strong>{' '}
          {status.message}
        </span>
      </p>
      <div className="mt-3 space-y-3 text-[12.5px] text-secondary">
        {status.state === 'down' ? (
          <div>
            <p className="mb-1.5">Start (or restart) the service:</p>
            <CopyLine text={status.restartCommand} what="Restart command" onCopy={onCopy} />
            <p className="mt-1.5 font-mono text-[10px] text-muted">Log: {status.logPath}</p>
          </div>
        ) : (
          <>
            <div>
              <p className="mb-1.5">Edit this file (it holds your secrets, so do not share it):</p>
              <CopyLine text={status.envPath} what="Path" onCopy={onCopy} />
            </div>
            {needCookie && (
              <div>
                <p className="font-semibold text-paper">SUNO_COOKIE</p>
                <p>suno.com/create (logged in) → DevTools → Network → click the request whose URL contains <code className="font-mono text-[11px]">?__clerk_api_version</code> → Request Headers → copy the whole <code className="font-mono text-[11px]">Cookie</code> value → paste after <code className="font-mono text-[11px]">SUNO_COOKIE=</code>.</p>
              </div>
            )}
            {needKey && (
              <div>
                <p className="font-semibold text-paper">TWOCAPTCHA_KEY</p>
                <p>2captcha.com account → fund the balance → copy the API key → paste after <code className="font-mono text-[11px]">TWOCAPTCHA_KEY=</code>.</p>
              </div>
            )}
            <div>
              <p className="mb-1.5">Then restart the service and press Recheck:</p>
              <CopyLine text={status.restartCommand} what="Restart command" onCopy={onCopy} />
            </div>
          </>
        )}
        {!status.windsorMounted && <p className="font-mono text-[11px] text-amber">The Windsor drive is not mounted.</p>}
      </div>
    </div>
  );
}
