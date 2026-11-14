// Reads a screenshot's pixels with Node alone, so the bar check runs on any
// runner without an image library. Covers what the emulator and the
// simulator write: 8- or 16-bit, gray or RGB, with or without alpha, not
// interlaced.
import { inflateSync } from 'node:zlib';

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

/** { width, height, rgb(x, y) -> [r, g, b] } for a PNG file's bytes. */
export function decodePng(bytes) {
  if (bytes.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG.');
  let at = 8;
  let header;
  const data = [];
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('ascii', at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        color: body[9],
        interlace: body[12],
      };
    } else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  const { width, height, depth, color, interlace } = header;
  const channels = CHANNELS[color];
  if (!channels || (depth !== 8 && depth !== 16) || interlace !== 0)
    throw new Error(`Unsupported PNG: color ${color}, depth ${depth}.`);

  const step = (channels * depth) / 8;
  const stride = width * step;
  const raw = inflateSync(Buffer.concat(data));
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= step ? out[i - step] : 0;
      const b = up ? up[i] : 0;
      const c = up && i >= step ? up[i - step] : 0;
      out[i] = (line[i] + unfilter(filter, a, b, c)) & 0xff;
    }
  }

  // A 16-bit channel's high byte is close enough for a color match.
  const read = (x, y, channel) =>
    pixels[y * stride + x * step + (channel * depth) / 8];
  return {
    width,
    height,
    rgb(x, y) {
      if (channels < 3) {
        const gray = read(x, y, 0);
        return [gray, gray, gray];
      }
      return [read(x, y, 0), read(x, y, 1), read(x, y, 2)];
    },
  };
}

function unfilter(filter, a, b, c) {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return a;
    case 2:
      return b;
    case 3:
      return (a + b) >> 1;
    case 4: {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    default:
      throw new Error(`Unknown PNG filter ${filter}.`);
  }
}

/**
 * The share (0 to 1) of pixels in rows [from, to) within `tolerance` of
 * `hex` on every channel.
 */
export function shareOfColor(image, from, to, hex, tolerance = 6) {
  const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const start = Math.max(0, from);
  const end = Math.min(image.height, to);
  let matching = 0;
  let total = 0;
  for (let y = start; y < end; y++) {
    for (let x = 0; x < image.width; x++) {
      const pixel = image.rgb(x, y);
      total++;
      if (pixel.every((value, i) => Math.abs(value - want[i]) <= tolerance))
        matching++;
    }
  }
  return total === 0 ? 0 : matching / total;
}
