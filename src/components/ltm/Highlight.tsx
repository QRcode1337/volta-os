'use client';
import { splitHighlight } from './ltm-client';

export function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitHighlight(text, query).map((s, i) =>
        s.hit ? (
          <mark key={i} className="rounded-[2px] bg-orange/30 px-px text-paper">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}
