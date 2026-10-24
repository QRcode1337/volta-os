'use client';
import { useState } from 'react';
import type { MouseEvent } from 'react';

export interface FramePin {
  n: number;
  x: number; // 0-100 %
  y: number; // 0-100 %
}

const MONO = '"JetBrains Mono", monospace';

/** 16:9 review frame: click anywhere to drop a pulsing, numbered orange pin with crosshairs. */
export function SpatialPinFrame({ initialPins = [] }: { initialPins?: FramePin[] }) {
  const [pins, setPins] = useState<FramePin[]>(initialPins);
  const last = pins[pins.length - 1];

  const place = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10;
    const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10;
    setPins((p) => [...p, { n: p.length + 1, x, y }]);
  };

  return (
    <div
      onClick={place}
      style={{
        position: 'relative',
        aspectRatio: '16 / 9',
        overflow: 'hidden',
        borderRadius: 10,
        border: '1px solid #262522',
        cursor: 'crosshair',
        background: 'radial-gradient(ellipse at 60% 40%, #24221F 0%, #0A0A0A 70%)',
      }}
    >
      {/* rule-of-thirds guide */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(#26252299 1px, transparent 1px), linear-gradient(90deg, #26252299 1px, transparent 1px)',
          backgroundSize: '33.333% 33.333%',
        }}
      />
      {last && (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: `${last.y}%`, height: 1, background: 'rgba(255,85,0,0.4)' }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${last.x}%`, width: 1, background: 'rgba(255,85,0,0.4)' }} />
        </>
      )}
      {pins.map((p) => (
        <div key={p.n} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)' }}>
          <span
            style={{
              position: 'absolute',
              inset: -6,
              borderRadius: 999,
              border: '2px solid #FF5500',
              animation: 'robo-pin-pulse 1.6s ease-out infinite',
            }}
          />
          <span
            style={{
              position: 'relative',
              display: 'flex',
              width: 24,
              height: 24,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              background: '#FF5500',
              color: '#0A0A0A',
              font: `700 11px/1 ${MONO}`,
              boxShadow: '0 0 0 3px rgba(10,10,10,0.8), 0 0 16px rgba(255,85,0,0.7)',
            }}
          >
            {p.n}
          </span>
        </div>
      ))}
      <span style={{ position: 'absolute', left: 12, bottom: 10, font: `600 10px/1 ${MONO}`, letterSpacing: '0.06em', color: '#A39E93' }}>
        {last ? `PIN #${last.n} · x: ${last.x}% · y: ${last.y}%` : 'CLICK TO DROP A PIN'}
      </span>
      {pins.length > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPins([]);
          }}
          style={{
            position: 'absolute',
            right: 10,
            top: 10,
            height: 24,
            padding: '0 10px',
            borderRadius: 999,
            border: '1px solid #3A3834',
            background: 'rgba(10,10,10,0.8)',
            color: '#A39E93',
            font: `600 10px/1 ${MONO}`,
            letterSpacing: '0.08em',
            cursor: 'pointer',
          }}
        >
          CLEAR {pins.length}
        </button>
      )}
      <style>{'@keyframes robo-pin-pulse{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.8);opacity:0}}'}</style>
    </div>
  );
}
