'use client';
import { forwardRef } from 'react';
import type { MediaKind, MediaStatus } from '@/types/media';
import { cn } from '@/lib/cn';
import { fmtUsd } from './gen-client';

export interface GenForm {
  mode: MediaKind;
  prompt: string;
  text: string;
  imageModel: string;
  imageAspect: string;
  imageCount: number;
  /** '' = model default price, else "quality|resolution". */
  imageTier: string;
  videoModel: string;
  videoAspect: string;
  videoCount: number;
  videoDuration: number;
  videoRes: string;
  voiceId: string;
  voiceModel: string;
  stability: number;
  similarity: number;
}

export const IMAGE_ASPECTS = ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'];
export const VIDEO_ASPECTS = ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3', '21:9'];
const IMAGE_COUNTS = [1, 2, 4, 8];
const VIDEO_COUNTS = [1, 2, 3];
const VIDEO_SECONDS = [2, 4, 5, 8, 10, 15];

const selectCls =
  'h-9 rounded-md border border-subtle bg-panel-elevated px-2.5 font-mono text-[11px] text-paper outline-none transition-colors hover:border-highlight focus:border-orange disabled:opacity-50';

export function initialForm(status: MediaStatus, prev?: GenForm): GenForm {
  const base: GenForm = prev ?? {
    mode: 'image',
    prompt: '',
    text: '',
    imageModel: '',
    imageAspect: '16:9',
    imageCount: 1,
    imageTier: '',
    videoModel: '',
    videoAspect: '16:9',
    videoCount: 1,
    videoDuration: 5,
    videoRes: '480p',
    voiceId: '',
    voiceModel: '',
    stability: 0.5,
    similarity: 0.75,
  };
  const f = { ...base };
  if (status.xai.configured) {
    if (!status.xai.imageModels.some((m) => m.id === f.imageModel)) f.imageModel = status.xai.imageModels[0]?.id ?? '';
    const vm = status.xai.videoModels.find((m) => m.id === f.videoModel) ?? status.xai.videoModels[0];
    f.videoModel = vm?.id ?? '';
    if (vm && !vm.resolutions.includes(f.videoRes)) f.videoRes = vm.resolutions[0];
  }
  if (status.elevenlabs.configured) {
    if (!status.elevenlabs.voices.some((v) => v.id === f.voiceId)) f.voiceId = status.elevenlabs.voices[0]?.id ?? '';
    if (!status.elevenlabs.models.some((m) => m.id === f.voiceModel)) {
      f.voiceModel = (status.elevenlabs.models.find((m) => m.id === 'eleven_flash_v2_5') ?? status.elevenlabs.models[0])?.id ?? '';
    }
  }
  return f;
}

/** Body for POST /api/media/quote. */
export function buildRequest(f: GenForm): unknown {
  if (f.mode === 'image') {
    const [quality, resolution] = f.imageTier ? f.imageTier.split('|') : [undefined, undefined];
    return { kind: 'image', model: f.imageModel, prompt: f.prompt, aspect: f.imageAspect, count: f.imageCount, quality, resolution };
  }
  if (f.mode === 'video') {
    return { kind: 'video', model: f.videoModel, prompt: f.prompt, aspect: f.videoAspect, count: f.videoCount, duration: f.videoDuration, resolution: f.videoRes };
  }
  return { kind: 'voice', model: f.voiceModel, voiceId: f.voiceId, text: f.text, stability: f.stability, similarity: f.similarity };
}

/** Rough client-side hint only; the confirm dialog shows the server's quote. */
function hint(f: GenForm, s: MediaStatus): string {
  if (f.mode === 'image' && s.xai.configured) {
    const m = s.xai.imageModels.find((x) => x.id === f.imageModel);
    if (!m) return '';
    const [q, r] = f.imageTier.split('|');
    const unit = m.tiers?.find((t) => t.quality === q && t.resolution === r)?.priceUsd ?? m.priceUsd;
    return `${f.imageCount} image${f.imageCount > 1 ? 's' : ''} · est. ${fmtUsd(unit * f.imageCount)}`;
  }
  if (f.mode === 'video' && s.xai.configured) {
    const m = s.xai.videoModels.find((x) => x.id === f.videoModel);
    const per = m?.perSecondUsd[f.videoRes];
    return per === undefined ? '' : `${f.videoCount} clip${f.videoCount > 1 ? 's' : ''} x ${f.videoDuration}s ${f.videoRes} · est. ${fmtUsd(per * f.videoDuration * f.videoCount)}`;
  }
  if (f.mode === 'voice' && s.elevenlabs.configured) {
    const m = s.elevenlabs.models.find((x) => x.id === f.voiceModel);
    const credits = Math.ceil(f.text.length * (m?.creditMultiplier ?? 1));
    const left = s.elevenlabs.quota?.remaining;
    return `${f.text.length.toLocaleString()} chars = ${credits.toLocaleString()} credits${left !== undefined ? ` of ${left.toLocaleString()} left` : ''}`;
  }
  return '';
}

function MissingKey({ name, note }: { name: string; note?: string }) {
  return (
    <div className="rounded-md border border-amber/40 bg-amber/5 px-4 py-3 text-[12.5px] text-secondary">
      <p className="text-paper">
        Add <code className="font-mono text-amber">{name}</code> to <code className="font-mono text-amber">~/Volta-OS/.env.local</code> to enable this.
      </p>
      <p className="mt-1 font-mono text-[10.5px] text-muted">
        {note ?? 'Then restart: launchctl kickstart -k gui/$(id -u)/com.epsilon.volta-os'}
      </p>
    </div>
  );
}

function Unavailable({ text }: { text: string }) {
  return <div className="rounded-md border border-subtle bg-panel-elevated px-4 py-3 text-[12.5px] text-secondary">{text}</div>;
}

export const GenComposer = forwardRef<
  HTMLTextAreaElement,
  {
    status: MediaStatus;
    form: GenForm;
    patch: (p: Partial<GenForm>) => void;
    busy: boolean;
    onSubmit: () => void;
  }
>(function GenComposer({ status, form: f, patch, busy, onSubmit }, ref) {
  const modes: { id: MediaKind; label: string }[] = [
    { id: 'image', label: 'Image' },
    { id: 'video', label: 'Video' },
    { id: 'voice', label: 'Voice' },
  ];
  const el = status.elevenlabs;
  const xai = status.xai;
  const storageBad = !status.storage.ok;

  let body: React.ReactNode;
  let canSubmit = false;
  if (f.mode === 'voice') {
    if (!el.configured) body = <MissingKey name={el.missing} />;
    else if (!el.voices.length || !el.models.length) body = <Unavailable text={el.error ?? 'ElevenLabs returned no voices or models for this key.'} />;
    else {
      canSubmit = f.text.trim().length > 0;
      const model = el.models.find((m) => m.id === f.voiceModel);
      body = (
        <>
          <textarea
            ref={ref}
            value={f.text}
            onChange={(e) => patch({ text: e.target.value })}
            rows={2}
            maxLength={model?.maxChars ?? 5000}
            placeholder="Text to speak"
            className="w-full resize-y rounded-md border border-subtle bg-obsidian px-3 py-2 text-[13px] text-paper outline-none placeholder:text-muted focus:border-orange"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Voice" value={f.voiceId} onChange={(e) => patch({ voiceId: e.target.value })} className={cn(selectCls, 'max-w-[260px]')}>
              {el.voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <select aria-label="Voice model" value={f.voiceModel} onChange={(e) => patch({ voiceModel: e.target.value })} className={selectCls}>
              {el.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.creditMultiplier}x
                </option>
              ))}
            </select>
            <Slider label="Stability" value={f.stability} onChange={(v) => patch({ stability: v })} />
            <Slider label="Similarity" value={f.similarity} onChange={(v) => patch({ similarity: v })} />
          </div>
        </>
      );
    }
  } else if (!xai.configured) {
    body = <MissingKey name={xai.missing} />;
  } else if (f.mode === 'image') {
    const m = xai.imageModels.find((x) => x.id === f.imageModel);
    if (!xai.imageModels.length) body = <Unavailable text={xai.imageError ?? 'xAI lists no image models for this key.'} />;
    else {
      canSubmit = f.prompt.trim().length > 0;
      const tiers = m?.tiers ?? [];
      body = (
        <>
          <PromptInput ref={ref} value={f.prompt} onChange={(v) => patch({ prompt: v })} max={m?.maxPromptLength ?? 4000} placeholder="Describe the image" />
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Image model" value={f.imageModel} onChange={(e) => patch({ imageModel: e.target.value, imageTier: '' })} className={selectCls}>
              {xai.imageModels.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.id} · {fmtUsd(x.priceUsd)}
                </option>
              ))}
            </select>
            {tiers.length > 0 && (
              <select aria-label="Quality tier" value={f.imageTier} onChange={(e) => patch({ imageTier: e.target.value })} className={selectCls}>
                <option value="">default tier</option>
                {[...tiers]
                  .sort((a, b) => a.priceUsd - b.priceUsd)
                  .map((t) => (
                    <option key={`${t.quality}|${t.resolution}`} value={`${t.quality}|${t.resolution}`}>
                      {t.quality} {t.resolution} · {fmtUsd(t.priceUsd)}
                    </option>
                  ))}
              </select>
            )}
            <select aria-label="Aspect ratio" value={f.imageAspect} onChange={(e) => patch({ imageAspect: e.target.value })} className={selectCls}>
              {IMAGE_ASPECTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select aria-label="Count" value={f.imageCount} onChange={(e) => patch({ imageCount: Number(e.target.value) })} className={selectCls}>
              {IMAGE_COUNTS.map((n) => (
                <option key={n} value={n}>
                  x{n}
                </option>
              ))}
            </select>
          </div>
        </>
      );
    }
  } else {
    const m = xai.videoModels.find((x) => x.id === f.videoModel);
    if (!xai.videoModels.length) body = <Unavailable text={`Video generation is not available for this xAI key. ${xai.videoError ?? ''}`.trim()} />;
    else {
      canSubmit = f.prompt.trim().length > 0;
      body = (
        <>
          <PromptInput ref={ref} value={f.prompt} onChange={(v) => patch({ prompt: v })} max={4000} placeholder="Describe the video" />
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Video model"
              value={f.videoModel}
              onChange={(e) => {
                const nm = xai.videoModels.find((x) => x.id === e.target.value);
                patch({ videoModel: e.target.value, videoRes: nm && !nm.resolutions.includes(f.videoRes) ? nm.resolutions[0] : f.videoRes });
              }}
              className={selectCls}
            >
              {xai.videoModels.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.id} · from {fmtUsd(x.perSecondUsd['480p'])}/s
                </option>
              ))}
            </select>
            <select aria-label="Resolution" value={f.videoRes} onChange={(e) => patch({ videoRes: e.target.value })} className={selectCls}>
              {(m?.resolutions ?? []).map((r) => (
                <option key={r} value={r}>
                  {r} · {fmtUsd(m?.perSecondUsd[r] ?? 0)}/s
                </option>
              ))}
            </select>
            <select aria-label="Aspect ratio" value={f.videoAspect} onChange={(e) => patch({ videoAspect: e.target.value })} className={selectCls}>
              {VIDEO_ASPECTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select aria-label="Duration" value={f.videoDuration} onChange={(e) => patch({ videoDuration: Number(e.target.value) })} className={selectCls}>
              {VIDEO_SECONDS.map((n) => (
                <option key={n} value={n}>
                  {n}s
                </option>
              ))}
            </select>
            <select aria-label="Count" value={f.videoCount} onChange={(e) => patch({ videoCount: Number(e.target.value) })} className={selectCls}>
              {VIDEO_COUNTS.map((n) => (
                <option key={n} value={n}>
                  x{n}
                </option>
              ))}
            </select>
          </div>
        </>
      );
    }
  }

  const disabled = busy || !canSubmit || storageBad;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) onSubmit();
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Mode" className="flex rounded-md border border-subtle bg-obsidian p-0.5">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={f.mode === m.id}
              onClick={() => patch({ mode: m.id })}
              className={cn(
                'h-8 rounded px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors',
                f.mode === m.id ? 'bg-orange text-obsidian' : 'text-secondary hover:text-paper',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted">{hint(f, status)}</span>
        <button
          type="submit"
          disabled={disabled}
          className={cn(
            'ml-auto h-9 min-w-[170px] rounded-md border border-orange bg-orange px-4 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-obsidian transition-[filter]',
            disabled ? 'cursor-not-allowed opacity-40' : 'robo-pulse hover:brightness-110',
          )}
        >
          {busy ? 'Working...' : 'Review & generate'}
        </button>
      </div>
      {body}
    </form>
  );
});

const PromptInput = forwardRef<HTMLTextAreaElement, { value: string; onChange: (v: string) => void; max: number; placeholder: string }>(function PromptInput(
  { value, onChange, max, placeholder },
  ref,
) {
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={2}
      maxLength={max}
      placeholder={placeholder}
      className="w-full resize-y rounded-md border border-subtle bg-obsidian px-3 py-2 text-[13px] text-paper outline-none placeholder:text-muted focus:border-orange"
    />
  );
});

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-md border border-subtle bg-panel-elevated px-2.5 font-mono text-[10.5px] uppercase tracking-[0.04em] text-secondary">
      {label}
      <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-24 accent-orange" />
      <span className="w-8 text-right text-paper">{value.toFixed(2)}</span>
    </label>
  );
}
