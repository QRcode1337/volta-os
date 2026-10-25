// Pure (isomorphic) timecode + spatial helpers shared by the prompt compiler, the UI and the review-note writer.
// No 'use client', no DOM, no server-only imports.

export function formatHMS(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
}

/** HH:MM:SS.cc : short renders need the fraction. */
export function formatClock(sec: number): string {
  const t = Math.max(0, sec);
  const cs = Math.min(99, Math.floor((t - Math.floor(t)) * 100 + 1e-6));
  return `${formatHMS(t)}.${String(cs).padStart(2, '0')}`;
}

const pct = (n: number) => `${n.toFixed(1)}%`;

/** 3x3 region name: Top/Center/Bottom x Left/Center/Right ("Center" when both central). */
export function regionDescriptor(x: number, y: number): string {
  const h = x < 40 ? 'Left' : x > 60 ? 'Right' : 'Center';
  const v = y < 33.3 ? 'Top' : y > 66.6 ? 'Bottom' : 'Center';
  if (h === 'Center' && v === 'Center') return 'Center';
  if (v === 'Center') return `Center-${h}`;
  if (h === 'Center') return `${v}-Center`;
  return `${v}-${h}`;
}

interface PinGeom {
  xPercent: number;
  yPercent: number;
  region?: { x: number; y: number; w: number; h: number };
}

export function coordsLabel(pin: PinGeom): string {
  if (pin.region) return `x: ${pct(pin.xPercent)}, y: ${pct(pin.yPercent)}, w: ${pct(pin.region.w)}, h: ${pct(pin.region.h)}`;
  return `x: ${pct(pin.xPercent)}, y: ${pct(pin.yPercent)}`;
}

/** Pixel position of the pin inside the real frame (e.g. "(648, 1536) px of 1080x1920"), or '' when the size is unknown. */
export function pixelLabel(pin: PinGeom, width: number | null, height: number | null): string {
  if (!width || !height) return '';
  const px = Math.round((pin.xPercent / 100) * width);
  const py = Math.round((pin.yPercent / 100) * height);
  if (pin.region) {
    const rw = Math.round((pin.region.w / 100) * width);
    const rh = Math.round((pin.region.h / 100) * height);
    return `(${px}, ${py}) px, ${rw}x${rh} px box, of ${width}x${height}`;
  }
  return `(${px}, ${py}) px of ${width}x${height}`;
}

export const frameAt = (sec: number, fps: number) => Math.round(sec * fps);

export function fmtDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return m > 0 ? `${m}:${String(Math.floor(s)).padStart(2, '0')}` : `${s.toFixed(1)}s`;
}
