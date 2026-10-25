import 'server-only';
import { deflateSync } from 'node:zlib';

// 1400x1400 podcast artwork rendered in pure Node (no fonts or image libraries needed): near-black field, orange ring and bolt.

const SIZE = 1400;
let memo: Buffer | null = null;

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

const BOLT: [number, number][] = [
  [0.58, 0.14],
  [0.31, 0.54],
  [0.48, 0.54],
  [0.4, 0.87],
  [0.7, 0.44],
  [0.52, 0.44],
  [0.63, 0.14],
];
function inPoly(x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = BOLT.length - 1; i < BOLT.length; j = i++) {
    const [xi, yi] = BOLT[i];
    const [xj, yj] = BOLT[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function coverPng(): Buffer {
  if (memo) return memo;
  const row = SIZE * 3 + 1;
  const raw = Buffer.alloc(row * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * row] = 0; // filter: none
    for (let x = 0; x < SIZE; x++) {
      const nx = x / SIZE;
      const ny = y / SIZE;
      const d = Math.hypot(nx - 0.5, ny - 0.5);
      let r = 10;
      let g = 10;
      let b = 12;
      const glow = Math.max(0, 1 - d / 0.55);
      r += 70 * glow * glow;
      g += 22 * glow * glow;
      if (x % 100 < 2 || y % 100 < 2) {
        r += 8;
        g += 8;
        b += 8;
      }
      if (Math.abs(d - 0.43) < 0.006) {
        r = 255;
        g = 85;
        b = 0;
      }
      if (inPoly(nx, ny)) {
        r = 255;
        g = 85;
        b = 0;
      }
      const o = y * row + 1 + x * 3;
      raw[o] = Math.min(255, r);
      raw[o + 1] = Math.min(255, g);
      raw[o + 2] = Math.min(255, b);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  memo = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  return memo;
}
