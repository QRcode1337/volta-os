// Tiny dependency-free highlighter for TSX / HTML / CSS snippets (good enough for docs, not a parser).
import type { CSSProperties, ReactNode } from 'react';

const TOKEN_RE = new RegExp(
  [
    String.raw`(\/\*[\s\S]*?\*\/|\/\/[^\n]*|<!--[\s\S]*?-->)`, // 1 comment
    String.raw`('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|\x60(?:\\.|[^\x60\\])*\x60)`, // 2 string
    String.raw`(=>)`, // 3 arrow
    String.raw`(<\/?[A-Za-z][\w.:-]*|\/?>)`, // 4 tag
    String.raw`\b(import|from|export|default|const|let|var|function|return|if|else|for|of|in|new|type|interface|extends|as|typeof|true|false|null|undefined|async|await)\b`, // 5 keyword
    String.raw`(--[A-Za-z][\w-]*)`, // 6 css custom property
    String.raw`(#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?\b|#[0-9A-Fa-f]{3}\b|\b\d+(?:\.\d+)?(?:px|ms|s|%|em|rem|vh|vw|deg|fr)?\b)`, // 7 number / hex
  ].join('|'),
  'g',
);

const STYLE: Record<number, CSSProperties> = {
  1: { color: '#6E6A61', fontStyle: 'italic' },
  2: { color: '#E8C07D' },
  3: { color: '#FF7A3D' },
  4: { color: '#5EC8BC' },
  5: { color: '#FF7A3D' },
  6: { color: '#93C5FD' },
  7: { color: '#C084FC' },
};

export function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of code.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(code.slice(last, idx));
    const group = m.findIndex((g, i) => i > 0 && g !== undefined);
    out.push(
      <span key={key++} style={STYLE[group]}>
        {m[0]}
      </span>,
    );
    last = idx + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}
