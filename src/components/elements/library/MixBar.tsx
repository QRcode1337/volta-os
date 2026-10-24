'use client';
import { useState } from 'react';

export interface MixSegment {
  label: string;
  value: number;
  color: string;
}

const MONO = '"JetBrains Mono", monospace';

/** Segmented proportion bar with a % legend. */
export function MixBar({ segments, height = 10 }: { segments: MixSegment[]; height?: number }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div>
      <div style={{ display: 'flex', gap: 2, height, borderRadius: 999, overflow: 'hidden', background: '#1C1B19' }}>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.label}
              title={`${s.label} · ${s.value}`}
              style={{ width: `${(s.value / total) * 100}%`, background: s.color, transition: 'width 300ms cubic-bezier(0.16, 1, 0.3, 1)' }}
            />
          ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 10 }}>
        {segments.map((s) => (
          <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: `600 10px/1 ${MONO}`, letterSpacing: '0.06em', color: '#A39E93' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
            {s.label} <span style={{ color: '#F5F2EB' }}>{Math.round((s.value / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** MixBar + per-segment range/number editors. */
export function EditableMixBar({ initial, caption = 'EMAILS · PAST 24H' }: { initial: MixSegment[]; caption?: string }) {
  const [segments, setSegments] = useState(initial);
  const total = segments.reduce((a, s) => a + s.value, 0);
  const set = (i: number, value: number) => setSegments((s) => s.map((x, j) => (j === i ? { ...x, value } : x)));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ font: '700 36px/1 Doto, monospace', color: '#F5F2EB' }}>{total}</span>
        <span style={{ font: `600 10px/1 ${MONO}`, letterSpacing: '0.08em', color: '#6E6A61' }}>{caption}</span>
      </div>
      <MixBar segments={segments} />
      {segments.map((s, i) => (
        <label
          key={s.label}
          style={{ display: 'grid', gridTemplateColumns: '84px 1fr 52px', alignItems: 'center', gap: 10, font: `600 10px/1 ${MONO}`, letterSpacing: '0.06em', color: '#A39E93' }}
        >
          {s.label}
          <input type="range" min={0} max={40} value={s.value} onChange={(e) => set(i, Number(e.target.value))} style={{ accentColor: s.color }} />
          <input
            type="number"
            min={0}
            max={999}
            value={s.value}
            onChange={(e) => set(i, Math.max(0, Number(e.target.value) || 0))}
            style={{ width: 52, background: '#0A0A0A', border: '1px solid #262522', borderRadius: 4, color: '#F5F2EB', font: 'inherit', padding: '5px 6px' }}
          />
        </label>
      ))}
    </div>
  );
}
