/** 18200000 → "18.2M", 186420 → "186k", 950 → "950" */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

/** 9.44 → "$9.44", 256 → "$256", 0.00004 → "$0.00004" */
export function formatUsd(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toPrecision(1)}`;
  if (n >= 100) return `$${Math.round(n)}`;
  return `$${n.toFixed(2)}`;
}

export function formatInt(n: number): string {
  return n.toLocaleString('en-US');
}

/** seconds → "HH:MM:SS:FF" at the given fps */
export function formatTimecode(sec: number, fps = 30): string {
  const total = Math.max(0, sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const f = Math.floor((total - Math.floor(total)) * fps);
  return [h, m, s, f].map((v) => String(v).padStart(2, '0')).join(':');
}
