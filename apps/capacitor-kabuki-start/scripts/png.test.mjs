import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { decodePng, shareOfColor } from './png.mjs';

/** A PNG of `rows` (arrays of [r, g, b, a]), each row with `filter`. */
function png(rows, filter = 0) {
  const width = rows[0].length;
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    return Buffer.concat([head, body, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(rows.length, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = rows.flatMap((row) => {
    const bytes = row.flat();
    // Sub: each byte less the one a pixel before it.
    const line =
      filter === 1
        ? bytes.map((value, i) => (value - (i >= 4 ? bytes[i - 4] : 0)) & 0xff)
        : bytes;
    return [filter, ...line];
  });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from(raw))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dark = [10, 10, 10, 255];
const white = [255, 255, 255, 255];

test('decodes RGBA pixels, filtered or not', () => {
  for (const filter of [0, 1]) {
    const image = decodePng(
      png(
        [
          [dark, white],
          [white, dark],
        ],
        filter,
      ),
    );
    assert.equal(image.width, 2);
    assert.deepEqual(image.rgb(1, 0), [255, 255, 255]);
    assert.deepEqual(image.rgb(1, 1), [10, 10, 10]);
  }
});

test('counts the share of a band in a color, within a tolerance', () => {
  const image = decodePng(
    png([
      [dark, dark, [12, 9, 11, 255], white],
      [white, white, white, white],
    ]),
  );
  assert.equal(shareOfColor(image, 0, 1, '#0a0a0a'), 0.75);
  assert.equal(shareOfColor(image, 1, 2, '#ffffff'), 1);
  assert.equal(shareOfColor(image, 0, 0, '#ffffff'), 0);
});
