import { Kind } from '../pen/index.ts';
import type { Cloud } from '../pen/index.ts';
import { segment, stroke } from '../pen/index.ts';

/*
 * lotel: a trace, as a waterfall. A time axis along the top, and under it
 * the spans of one request, each a bar starting where its parent was busy,
 * growing left to right as time runs, the whole trace drawn again on a loop.
 */

/** [start, length] in the trace's time, 0..1, one per row, in call order. */
const SPANS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0.03, 0.34],
  [0.06, 0.14],
  [0.22, 0.13],
  [0.4, 0.46],
  [0.43, 0.18],
  [0.63, 0.2],
  [0.66, 0.07],
  [0.88, 0.1],
];

const LEFT = -0.88;
const WIDTH = 1.76;
const TOP = 0.56;
const STEP = 0.135;

export function lotel(c: Cloud): void {
  const { n, random } = c;
  const total = SPANS.reduce((sum, [, len]) => sum + len, 0);

  SPANS.forEach(([start, len], row) => {
    const y = TOP - row * STEP;
    const x = LEFT + start * WIDTH;
    const w = len * WIDTH;
    // A bar of fine dots, three deep and a little thick, that grows.
    const count = (n * 0.62 * len) / total;
    for (let k = 0; k < count; k++) {
      const u = random();
      const v = (k % 5) / 4 - 0.5;
      c.add([x + u * w, y + v * 0.05, 0], row === 0 ? 1.15 : 0.95, [
        Kind.grow,
        0,
        u,
        start,
        len,
      ]);
    }
    // Where the span starts, a bright tick.
    stroke(
      c,
      n * 0.003,
      segment([x, y - 0.035, 0], [x, y + 0.035, 0]),
      1.8,
      () => [Kind.grow, 0, 0, start, len],
    );
  });

  // The time axis, with a tick every tenth.
  const axis = TOP + 0.13;
  stroke(c, n * 0.04, segment([LEFT, axis, 0], [LEFT + WIDTH, axis, 0]), 0.45);
  for (let t = 0; t <= 10; t++) {
    const x = LEFT + (t / 10) * WIDTH;
    stroke(
      c,
      n * 0.0015,
      segment([x, axis, 0], [x, axis + (t % 5 === 0 ? 0.06 : 0.03), 0]),
      0.8,
    );
  }
  // Faint row guides, so the rows read as one table of time.
  SPANS.forEach((_, row) => {
    const y = TOP - row * STEP;
    stroke(
      c,
      n * 0.012,
      segment([LEFT, y, -0.03], [LEFT + WIDTH, y, -0.03]),
      0.12,
    );
  });
}
