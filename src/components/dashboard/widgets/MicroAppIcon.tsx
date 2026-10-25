import type { MicroAppItem } from '@/types/os';
import { cn } from '@/lib/cn';

// 7×7 pixel glyphs, 1 = filled.
const GLYPHS: Record<MicroAppItem['iconType'], string[]> = {
  // eye (screen memory)
  ltm: ['0000000', '0011100', '0100010', '1001001', '0100010', '0011100', '0000000'],
  // linked memory nodes
  honcho: ['1000001', '0100010', '0011100', '0010100', '0011100', '0100010', '1000001'],
  // magnifier
  search: ['0111000', '1000100', '1000100', '1000100', '0111000', '0000110', '0000011'],
  // terminal prompt
  sessions: ['1111111', '1000001', '1010001', '1001001', '1010111', '1000001', '1111111'],
  // stacked servers
  systems: ['1111111', '1000101', '1111111', '0000000', '1111111', '1000101', '1111111'],
  // clapperboard
  editor: ['1010101', '1111111', '0000000', '1111111', '1000001', '1001001', '1111111'],
  // script page with lines
  scripts: ['1111100', '1000110', '1011101', '1000001', '1011101', '1000001', '1111111'],
  // generative sparkle
  generations: ['0001000', '0001000', '0011100', '1111111', '0011100', '0001000', '0001000'],
  // play button in a film frame
  studio: ['1111111', '1010001', '1011001', '1011101', '1011001', '1010001', '1111111'],
  // cart
  recos: ['1100000', '0111111', '0100101', '0111110', '0100000', '0111100', '0010010'],
  // dotted sphere
  brain: ['0011100', '0101010', '1010101', '0101010', '1010101', '0101010', '0011100'],
  // stacked slides
  carousels: ['0011111', '0010001', '1111101', '1000101', '1000111', '1000100', '1111100'],
  // component grid
  elements: ['1110111', '1010101', '1110111', '0000000', '1110111', '1010101', '1110111'],
  // pen stroke
  excalidraw: ['0000011', '0000111', '0001110', '0011100', '0111000', '1110000', '1100000'],
};

interface MicroAppIconProps {
  type: MicroAppItem['iconType'];
  color?: string;
  size?: number; // outer square px
  className?: string;
}

/** 28×28 rounded dark-orange square with a crisp pixel glyph. */
export function MicroAppIcon({ type, color = '#FF5500', size = 28, className }: MicroAppIconProps) {
  const glyph = GLYPHS[type];
  const inner = Math.round(size * 0.5);
  return (
    <span
      className={cn('relative flex shrink-0 items-center justify-center rounded-[7px] border transition-all', className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(145deg, ${color}2E, ${color}12)`,
        borderColor: `${color}40`,
        boxShadow: `inset 0 1px 0 ${color}26`,
      }}
    >
      <svg width={inner} height={inner} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden>
        {glyph.flatMap((row, y) =>
          row.split('').map((c, x) => (c === '1' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} /> : null)),
        )}
      </svg>
    </span>
  );
}
