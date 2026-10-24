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
    case 'Skills': // hexagon with diamond core
      return (
        <svg {...common}>
          <path d="M12 2.5 20.5 7.25v9.5L12 21.5 3.5 16.75v-9.5Z" stroke={c} strokeWidth={1.8} strokeLinejoin="round" />
          <path d="M12 8 16 12 12 16 8 12Z" fill={c} />
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
    case 'Apps': // 2×2 tiles, one rotated
      return (
        <svg {...common}>
          <rect x={3.5} y={3.5} width={7} height={7} rx={1.2} fill={c} />
          <rect x={3.5} y={13.5} width={7} height={7} rx={1.2} stroke={c} strokeWidth={1.8} />
          <rect x={13.5} y={13.5} width={7} height={7} rx={1.2} stroke={c} strokeWidth={1.8} />
          <rect x={14.2} y={4.2} width={5.6} height={5.6} rx={1} fill={c} fillOpacity={0.6} transform="rotate(45 17 7)" />
        </svg>
      );
  }
}
