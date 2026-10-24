export interface PixelMascotLogoProps {
  size?: number;
  color?: string;
  className?: string;
}

// 8×8 pixel robot head. 1 = filled.
const GRID = [
  '00011000',
  '00111100',
  '11111111',
  '10100101',
  '11111111',
  '11000011',
  '01111110',
  '01011010',
];

/** Merge each row's filled pixels into horizontal runs → fewer rects, no seams between pixels. */
const RUNS: { x: number; y: number; w: number }[] = GRID.flatMap((row, y) => {
  const runs: { x: number; y: number; w: number }[] = [];
  let start = -1;
  for (let x = 0; x <= row.length; x++) {
    const filled = row[x] === '1';
    if (filled && start < 0) start = x;
    if (!filled && start >= 0) {
      runs.push({ x: start, y, w: x - start });
      start = -1;
    }
  }
  return runs;
});

/** Crisp orange pixel mascot used in the brand header and micro-app icons. */
export function PixelMascotLogo({ size = 28, color = '#FF5500', className }: PixelMascotLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      className={className}
      aria-label="VOLTA mascot"
      role="img"
    >
      <title>VOLTA mascot</title>
      <g fill={color}>
        {RUNS.map(({ x, y, w }) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={w} height={1} />
        ))}
      </g>
    </svg>
  );
}

export default PixelMascotLogo;
