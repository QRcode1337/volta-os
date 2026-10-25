'use client';
// Preset argument form. The browser only picks values (numbers, enum keys, composition ids, file ids);
// the server validates them again and builds the argv from config/studio-projects.json.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Play, Plus, X } from 'lucide-react';
import type { ArgSpecPublic, GenerationInput, MusicInput, PresetPublic, StudioOutput, StudioProject, StudioStorage } from '@/types/studio';
import { cn } from '@/lib/cn';
import { api, fmtDur } from './studio-client';

export interface InputsData {
  outputs: (StudioOutput & { projectName: string })[];
  generations: GenerationInput[];
  music?: MusicInput[];
}

type Values = Record<string, unknown>;

const field = 'h-8 w-full rounded-md border border-subtle bg-obsidian px-2 text-[12.5px] text-paper outline-none focus:border-orange';
const labelCls = 'mb-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-muted';

function defaults(preset: PresetPublic, prefill: Values | undefined): Values {
  const v: Values = {};
  for (const [k, a] of Object.entries(preset.args)) {
    if (a.type === 'enum') v[k] = a.default ?? a.options[0];
    else if (a.type === 'number' || a.type === 'int') v[k] = a.default ?? a.min;
    else if (a.type === 'files') v[k] = [];
    else v[k] = '';
  }
  return { ...v, ...(prefill ?? {}) };
}

function FileSelect({
  value,
  onChange,
  kinds,
  inputs,
  placeholder,
}: {
  value: string;
  onChange: (id: string) => void;
  kinds: string[];
  inputs: InputsData | null;
  placeholder: string;
}) {
  const outs = (inputs?.outputs ?? []).filter((o) => kinds.includes(o.media));
  const gens = (inputs?.generations ?? []).filter((g) => kinds.includes(g.media));
  const tracks = (inputs?.music ?? []).filter((m) => kinds.includes(m.media));
  const missing = tracks.filter((m) => m.offline);
  return (
    <>
      <select className={field} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{inputs ? placeholder : 'Loading files...'}</option>
        {outs.length > 0 && (
          <optgroup label="Project outputs">
            {outs.map((o) => (
              <option key={o.id} value={o.id} disabled={o.offline}>
                {o.projectName} · {o.name}
                {o.durationSec ? ` · ${fmtDur(o.durationSec)}` : ''}
                {o.offline ? ' (iCloud, not downloaded)' : ''}
              </option>
            ))}
          </optgroup>
        )}
        {gens.length > 0 && (
          <optgroup label="Generations manifest">
            {gens.map((g) => (
              <option key={g.id} value={g.id}>
                Generations · {g.media === 'audio' ? 'voice' : 'video'} · {g.prompt.length > 48 ? `${g.prompt.slice(0, 45)}...` : g.prompt}
              </option>
            ))}
          </optgroup>
        )}
        {tracks.length > 0 && (
          <optgroup label="VANTA VECTOR">
            {tracks.map((m) => (
              <option key={m.id} value={m.id} disabled={m.offline}>
                VANTA VECTOR · {m.prompt.length > 48 ? `${m.prompt.slice(0, 45)}...` : m.prompt}
                {m.offline ? ' (iCloud, not downloaded)' : ''}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {missing.length > 0 && (
        <p className="mt-1 text-[10.5px] leading-snug text-muted">
          {missing.length} VANTA VECTOR track{missing.length === 1 ? ' is' : 's are'} in iCloud and can&apos;t be picked yet. To download, run{' '}
          <code className="font-mono text-secondary">{missing[0].brctl}</code>
        </p>
      )}
    </>
  );
}

function Field({
  name,
  spec,
  value,
  set,
  project,
  inputs,
}: {
  name: string;
  spec: ArgSpecPublic;
  value: unknown;
  set: (v: unknown) => void;
  project: StudioProject;
  inputs: InputsData | null;
}) {
  const id = `f-${name}`;
  switch (spec.type) {
    case 'number':
    case 'int':
      return (
        <div>
          <label htmlFor={id} className={labelCls}>
            {spec.label}
          </label>
          <input
            id={id}
            type="number"
            className={field}
            min={spec.min}
            max={spec.max}
            step={spec.type === 'int' ? 1 : 'any'}
            value={value as number | string}
            onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </div>
      );
    case 'enum':
      return (
        <div>
          <label htmlFor={id} className={labelCls}>
            {spec.label}
          </label>
          <select id={id} className={field} value={String(value)} onChange={(e) => set(e.target.value)}>
            {spec.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      );
    case 'composition': {
      const comps = project.compositions;
      return (
        <div>
          <label htmlFor={id} className={labelCls}>
            {spec.label}
          </label>
          {comps.length ? (
            <select id={id} className={field} value={String(value)} onChange={(e) => set(e.target.value)}>
              <option value="">Choose a composition</option>
              {comps.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id}
                  {c.width && c.height ? ` · ${c.width}x${c.height}` : ''}
                  {c.durationSec ? ` · ${fmtDur(c.durationSec)}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <input id={id} className={field} placeholder="Composition id" value={String(value)} onChange={(e) => set(e.target.value)} />
          )}
        </div>
      );
    }
    case 'file':
      return (
        <div>
          <label htmlFor={id} className={labelCls}>
            {spec.label}
          </label>
          <FileSelect value={String(value)} onChange={set} kinds={spec.kinds} inputs={inputs} placeholder={`Pick a ${spec.kinds.join(' or ')} file`} />
        </div>
      );
    case 'files': {
      const ids = value as string[];
      const label = (fid: string) => {
        const o = inputs?.outputs.find((x) => x.id === fid);
        if (o) return `${o.projectName} · ${o.name}`;
        const g = inputs?.generations.find((x) => x.id === fid);
        const m = inputs?.music?.find((x) => x.id === fid);
        return g ? `Generations · ${g.name}` : m ? `VANTA VECTOR · ${m.prompt}` : fid;
      };
      const move = (i: number, d: number) => {
        const next = [...ids];
        [next[i], next[i + d]] = [next[i + d], next[i]];
        set(next);
      };
      return (
        <div>
          <span className={labelCls}>
            {spec.label} · {ids.length} of {spec.min}-{spec.max}
          </span>
          <ol className="mb-1.5 space-y-1">
            {ids.map((fid, i) => (
              <li key={`${fid}-${i}`} className="flex items-center gap-1.5 rounded-md border border-subtle bg-obsidian px-2 py-1 text-[12px] text-paper">
                <span className="w-4 font-mono text-[10px] text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{label(fid)}</span>
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="text-muted hover:text-paper disabled:opacity-30" aria-label="Move up">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" disabled={i === ids.length - 1} onClick={() => move(i, 1)} className="text-muted hover:text-paper disabled:opacity-30" aria-label="Move down">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => set(ids.filter((_, j) => j !== i))} className="text-muted hover:text-[#EF4444]" aria-label="Remove">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ol>
          {ids.length < spec.max && (
            <div className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5 shrink-0 text-muted" />
              <FileSelect value="" onChange={(fid) => fid && set([...ids, fid])} kinds={spec.kinds} inputs={inputs} placeholder="Add a clip..." />
            </div>
          )}
        </div>
      );
    }
  }
}

export function PresetForm({
  project,
  preset,
  prefill,
  storage,
  busy,
  onSubmit,
}: {
  project: StudioProject;
  preset: PresetPublic;
  prefill?: Values;
  storage: StudioStorage | null;
  busy: boolean;
  onSubmit: (args: Values) => void;
}) {
  const [values, setValues] = useState<Values>(() => defaults(preset, prefill));
  const [inputs, setInputs] = useState<InputsData | null>(null);
  const needsFiles = useMemo(() => Object.values(preset.args).some((a) => a.type === 'file' || a.type === 'files'), [preset]);

  useEffect(() => setValues(defaults(preset, prefill)), [preset, prefill]);
  useEffect(() => {
    if (!needsFiles) return;
    let alive = true;
    api<InputsData>('/api/studio/outputs?scope=inputs')
      .then((d) => alive && setInputs(d))
      .catch(() => alive && setInputs({ outputs: [], generations: [] }));
    return () => {
      alive = false;
    };
  }, [needsFiles, preset.id, project.id]);

  const missing = Object.entries(preset.args).find(([k, a]) => {
    const v = values[k];
    if (a.type === 'files') return (v as string[]).length < a.min;
    if (a.type === 'number' || a.type === 'int') return v === '' || Number.isNaN(Number(v));
    return v === '' || v === undefined;
  });
  const windsorBlocked = preset.usesWindsor && storage !== null && !storage.ok;
  const disabled = busy || !preset.ready || windsorBlocked || !!missing;
  const entries = Object.entries(preset.args);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (disabled) return;
        if (preset.confirm && !window.confirm(preset.confirm)) return;
        onSubmit(values);
      }}
    >
      {preset.description && <p className="text-[12.5px] leading-snug text-secondary">{preset.description}</p>}
      {!preset.ready && (
        <p className="flex items-start gap-2 rounded-md border border-amber/40 bg-amber/5 px-3 py-2 text-[12px] text-paper">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
          <span>{preset.notReadyReason}</span>
        </p>
      )}
      {windsorBlocked && (
        <p className="flex items-start gap-2 rounded-md border border-amber/40 bg-amber/5 px-3 py-2 text-[12px] text-paper">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
          <span>{storage?.reason}</span>
        </p>
      )}
      {entries.length > 0 && (
        <div className={cn('grid gap-3', entries.length > 1 && 'sm:grid-cols-2')}>
          {entries.map(([k, spec]) => (
            <div key={k} className={cn(spec.type === 'files' && 'sm:col-span-2')}>
              <Field name={k} spec={spec} value={values[k]} set={(v) => setValues((s) => ({ ...s, [k]: v }))} project={project} inputs={inputs} />
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-orange px-5 text-[12.5px] font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Queue {preset.label}
        </button>
        {missing && <span className="font-mono text-[10.5px] text-muted">Needs: {preset.args[missing[0]].label}</span>}
        <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted" title={preset.command}>
          {preset.usesWindsor ? 'Windsor renders · ' : preset.outputDir ? `${preset.outputDir} · ` : ''}
          {preset.command}
        </code>
      </div>
    </form>
  );
}
