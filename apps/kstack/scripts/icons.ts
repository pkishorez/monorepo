// Writes the app icons into public/icons with nothing but node:zlib.
// Run with `pnpm icons` after changing the art; the PNGs are committed.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

type Rgb = readonly [number, number, number];

const BACKGROUND: Rgb = [24, 24, 27];
const MARK: Rgb = [139, 92, 246];
const INNER: Rgb = [250, 250, 250];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Uint8Array): Buffer => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
};

const encodePng = (size: number, pixel: (x: number, y: number) => Rgb) => {
  const rows = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x + 0.5, y + 0.5);
      rows[row + 1 + x * 3] = r;
      rows[row + 2 + x * 3] = g;
      rows[row + 3 + x * 3] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', new Uint8Array()),
  ]);
};

// A filled disc with a smaller white disc inside; `scale` is the disc's
// share of the canvas, so maskable art stays inside the 80% safe zone.
const icon = (size: number, scale: number) =>
  encodePng(size, (x, y) => {
    const d = Math.hypot(x - size / 2, y - size / 2) / (size / 2);
    if (d < scale * 0.38) return INNER;
    if (d < scale) return MARK;
    return BACKGROUND;
  });

const out = new URL('../public/icons/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), icon(192, 0.8));
writeFileSync(new URL('icon-512.png', out), icon(512, 0.8));
writeFileSync(new URL('maskable-512.png', out), icon(512, 0.6));
writeFileSync(new URL('apple-touch-icon.png', out), icon(180, 0.7));
