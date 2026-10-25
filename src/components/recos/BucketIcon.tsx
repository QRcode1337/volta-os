import type { Bucket } from './recos-lib';
import { BUCKET_COLORS } from './recos-lib';

/** Small geometric glyph per bucket, drawn on a 24×24 grid. */
export function BucketIcon({ bucket, size = 20 }: { bucket: Bucket; size?: number }) {
  const c = BUCKET_COLORS[bucket];
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true } as const;
  switch (bucket) {
    case 'Memory': // stacked strata
      return (
        <svg {...common}>
          <path d="M12 3 21 7.5 12 12 3 7.5Z" fill={c} fillOpacity={0.9} />
          <path d="M3 12 12 16.5 21 12" stroke={c} strokeWidth={1.8} strokeLinejoin="round" />
          <path d="M3 16.5 12 21 21 16.5" stroke={c} strokeWidth={1.8} strokeLinejoin="round" strokeOpacity={0.55} />
        </svg>
      );
    case 'Content': // film frame with a play wedge
      return (
        <svg {...common}>
          <rect x={3} y={5} width={18} height={14} rx={2} stroke={c} strokeWidth={1.8} />
          <path d="M10 9.2v5.6l4.8-2.8Z" fill={c} />
          <path d="M6 5v14M18 5v14" stroke={c} strokeWidth={1.2} strokeOpacity={0.5} />
        </svg>
      );
    case 'Routines': // segmented dial
      return (
        <svg {...common}>
          <circle cx={12} cy={12} r={8.5} stroke={c} strokeWidth={1.8} strokeDasharray="4.2 2.4" />
          <path d="M12 7v5l3.5 2.5" stroke={c} strokeWidth={2} strokeLinecap="square" />
          <rect x={11} y={11} width={2} height={2} fill={c} />
        </svg>
      );
    case 'Systems': // monitor with a pulse line
      return (
        <svg {...common}>
          <rect x={3} y={4.5} width={18} height={12} rx={1.6} stroke={c} strokeWidth={1.8} />
          <path d="M6 11h3l1.6-3 2.4 6 1.6-3H18" stroke={c} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
          <path d="M9 20h6M12 16.5V20" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
        </svg>
      );
  }
}
