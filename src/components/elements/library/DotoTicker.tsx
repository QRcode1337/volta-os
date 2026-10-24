'use client';
import { useEffect, useState } from 'react';

const MONO = '"JetBrains Mono", monospace';
const pad = (n: number) => String(n).padStart(2, '0');

/** Live Doto counters: a streaming token count and a session timer. */
export function DotoTicker({ startTokens = 186_420 }: { startTokens?: number }) {
  const [tokens, setTokens] = useState(startTokens);
  const [sec, setSec] = useState(0);

  useEffect(() => {
    const a = setInterval(() => setTokens((t) => t + 37 + (t % 23)), 120);
    const b = setInterval(() => setSec((s) => s + 1), 1000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, []);

  const cell = (label: string, value: string, color = '#F5F2EB') => (
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={{ font: `600 10px/1 ${MONO}`, letterSpacing: '0.08em', color: '#6E6A61' }}>{label}</span>
      <span style={{ font: '700 34px/1 Doto, monospace', letterSpacing: '0.03em', color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 36 }}>
      {cell('CONTEXT TOKENS', tokens.toLocaleString('en-US'))}
      {cell('SESSION', `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`, '#FF5500')}
    </div>
  );
}
