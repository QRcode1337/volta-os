// Minimal line diff: trims common prefix/suffix, LCS on the middle (bounded), then hunks with context.

export interface DiffLine {
  kind: 'same' | 'add' | 'del';
  text: string;
  a?: number; // 1-based line in "before"
  b?: number; // 1-based line in "after"
}

export function lineDiff(before: string, after: string): DiffLine[] {
  const A = before === '' ? [] : before.split('\n');
  const B = after === '' ? [] : after.split('\n');
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const am = A.slice(pre, A.length - suf);
  const bm = B.slice(pre, B.length - suf);
  const out: DiffLine[] = [];
  for (let i = 0; i < pre; i++) out.push({ kind: 'same', text: A[i], a: i + 1, b: i + 1 });

  const mid: DiffLine[] = [];
  if (am.length * bm.length > 2_000_000) {
    am.forEach((t, i) => mid.push({ kind: 'del', text: t, a: pre + i + 1 }));
    bm.forEach((t, j) => mid.push({ kind: 'add', text: t, b: pre + j + 1 }));
  } else {
    const n = am.length;
    const m = bm.length;
    const L: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = am[i] === bm[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (am[i] === bm[j]) {
        mid.push({ kind: 'same', text: am[i], a: pre + i + 1, b: pre + j + 1 });
        i++;
        j++;
      } else if (L[i + 1][j] >= L[i][j + 1]) {
        mid.push({ kind: 'del', text: am[i], a: pre + i + 1 });
        i++;
      } else {
        mid.push({ kind: 'add', text: bm[j], b: pre + j + 1 });
        j++;
      }
    }
    for (; i < n; i++) mid.push({ kind: 'del', text: am[i], a: pre + i + 1 });
    for (; j < m; j++) mid.push({ kind: 'add', text: bm[j], b: pre + j + 1 });
  }
  out.push(...mid);
  for (let k = 0; k < suf; k++) {
    const ai = A.length - suf + k;
    const bi = B.length - suf + k;
    out.push({ kind: 'same', text: A[ai], a: ai + 1, b: bi + 1 });
  }
  return out;
}

export type DiffRow = DiffLine | { kind: 'gap'; count: number };

/** Collapse unchanged runs to `context` lines around each change. */
export function withContext(lines: DiffLine[], context = 3): DiffRow[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.kind !== 'same') for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true;
  });
  const rows: DiffRow[] = [];
  let gap = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (gap) rows.push({ kind: 'gap', count: gap });
      gap = 0;
      rows.push(l);
    } else gap++;
  });
  if (gap) rows.push({ kind: 'gap', count: gap });
  return rows;
}
