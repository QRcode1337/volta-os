import { ImageResponse } from 'next/og';
import { MASCOT_BG, MASCOT_GRID, MASCOT_ORANGE } from './mascot';

/**
 * Renders the pixel mascot as a square PNG for home-screen / PWA icons.
 * `padding` is the fraction of the edge left empty on each side (maskable icons need ~0.2 so the
 * launcher's circle/squircle crop never clips the mascot).
 */
export function mascotIcon(size: number, padding = 0.18) {
  const inner = Math.round(size * (1 - padding * 2));
  const cell = Math.floor(inner / 8);
  const grid = cell * 8;
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: MASCOT_BG,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: grid, height: grid, display: 'flex', flexDirection: 'column' }}>
          {MASCOT_GRID.map((row, y) => (
            <div key={y} style={{ display: 'flex', height: cell }}>
              {row.split('').map((c, x) => (
                <div key={x} style={{ width: cell, height: cell, background: c === '1' ? MASCOT_ORANGE : 'transparent' }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
