// Fit a skill name inside a circle-pack bubble (Second Brain → Skills). Pure geometry, no DOM: monospace
// glyphs are estimated at 0.6em wide, so a label of n characters at font size fs is ~n·fs·0.6 px.

export const MONO_CHAR_EM = 0.6;
const MAX_FS = 16;
const MIN_FS = 9;
/** Usable text width as a fraction of the radius (a centred line can use most of the 2r chord). */
const WIDTH_R = 1.8;

export interface BubbleLabel {
  /** 'full' = name (+ count line) inside the bubble; 'short' = one tiny truncated line; 'none' = too small. */
  kind: 'full' | 'short' | 'none';
  lines: string[];
  fs: number;
  /** Second line ("5× · superpowers") or null when it would not fit. */
  sub: string | null;
  subFs: number;
}

export const textWidth = (text: string, fs: number) => text.length * fs * MONO_CHAR_EM;

/** Truncate to fit `maxW` at `fs`, ending in an ellipsis when cut. */
export function truncateToWidth(text: string, fs: number, maxW: number): string {
  const max = Math.floor(maxW / (fs * MONO_CHAR_EM));
  if (text.length <= max) return text;
  return max <= 1 ? '…' : `${text.slice(0, max - 1)}…`;
}

/** Split a hyphenated name into two lines at the hyphen closest to the middle ("dispatching-" / "parallel-agents"). */
function splitAtHyphen(name: string): [string, string] | null {
  let best = -1;
  for (let i = 1; i < name.length - 1; i++) {
    if (name[i] === '-' && (best < 0 || Math.abs(i - name.length / 2) < Math.abs(best - name.length / 2))) best = i;
  }
  return best < 0 ? null : [name.slice(0, best + 1), name.slice(best + 1)];
}

export function fitBubbleLabel(name: string, r: number, sub: string, subShort: string): BubbleLabel {
  const maxW = WIDTH_R * r;
  if (r >= 32) {
    const fsCap = Math.min(MAX_FS, r * 0.42); // keep two/three lines of text inside the circle's height
    let lines: string[] | null = null;
    let fs = 0;
    const one = Math.min(fsCap, maxW / (name.length * MONO_CHAR_EM));
    if (one >= MIN_FS) {
      lines = [name];
      fs = one;
    } else {
      const parts = splitAtHyphen(name);
      if (parts) {
        const longest = Math.max(parts[0].length, parts[1].length);
        // Two lines sit slightly off-centre, where the chord is narrower — use 92% of the width.
        const two = Math.min(fsCap, (maxW * 0.92) / (longest * MONO_CHAR_EM));
        if (two >= MIN_FS) {
          lines = parts;
          fs = two;
        }
      }
    }
    if (!lines) {
      fs = MIN_FS;
      lines = [truncateToWidth(name, fs, maxW)];
    }
    const subFs = Math.max(8.5, fs * 0.75);
    const subMaxW = maxW * 0.9;
    const subText = textWidth(sub, subFs) <= subMaxW ? sub : textWidth(subShort, subFs) <= subMaxW ? subShort : null;
    return { kind: 'full', lines, fs, sub: subText, subFs };
  }
  if (r > 13) {
    const fs = 8;
    return { kind: 'short', lines: [truncateToWidth(name, fs, maxW * 0.95)], fs, sub: null, subFs: 0 };
  }
  return { kind: 'none', lines: [], fs: 0, sub: null, subFs: 0 };
}
