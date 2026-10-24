'use client';
import { useEffect, useState } from 'react';

/** Animates 0 → target with easeOutCubic. Change `runKey` to replay. */
export function useCountUp(target: number, durationMs = 1400, runKey = 0): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, runKey]);
  return value;
}

export interface MetricHeroProps {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  caption?: string;
  color?: string;
  runKey?: number;
}

/** Doto hero number inside a /robo HUD card. */
export function MetricHero({ label, value, decimals = 0, prefix = '', suffix = '', caption, color = '#F5F2EB', runKey = 0 }: MetricHeroProps) {
  const v = useCountUp(value, 1400, runKey);
  return (
    <div style={{ background: '#141413', border: '1px solid #262522', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ font: '600 10px/1 "JetBrains Mono", monospace', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#A39E93' }}>{label}</div>
      <div style={{ marginTop: 12, font: '700 40px/1 Doto, monospace', letterSpacing: '0.02em', color, fontVariantNumeric: 'tabular-nums' }}>
        {prefix}
        {v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
        {suffix}
      </div>
      {caption && <div style={{ marginTop: 8, font: '400 12px/1.4 Outfit, sans-serif', color: '#6E6A61' }}>{caption}</div>}
    </div>
  );
}
