import { Kind } from '../pen/index.ts';
import type { Cloud, V3 } from '../pen/index.ts';
import { roundRect, segment, stroke } from '../pen/index.ts';

/*
 * renders: only what changed draws again. A grid of small component
 * cards, all quiet; about once a second exactly one of them flashes, its
 * one re-render, and fades, a different one each time, while every other
 * card stays still.
 */

const COLS = 4;
const ROWS = 4;
const W = 0.36;
const H = 0.25;
const GAP = 0.08;
/** The order cards flash in: scattered, so no two in a row are neighbours. */
const ORDER = [5, 14, 0, 10, 3, 12, 7, 1, 9, 15, 4, 11, 2, 13, 6, 8];
const BEAT = 1.1;

export function renders(c: Cloud): void {
  const { n } = c;
  const loop = ORDER.length * BEAT;
  const left = -((COLS - 1) * (W + GAP)) / 2;
  const top = ((ROWS - 1) * (H + GAP)) / 2;
  for (let r = 0; r < ROWS; r++) {
    for (let k = 0; k < COLS; k++) {
      const card = r * COLS + k;
      const at: V3 = [left + k * (W + GAP), top - r * (H + GAP), 0];
      const turn = ORDER.indexOf(card) / ORDER.length;
      const flash = () =>
        [Kind.cycle, 0.5, turn, 1 / ORDER.length, loop] as const;
      stroke(c, n * 0.028, roundRect(at, W, H, 0.03), 0.7, flash);
      // Inside: a title and a line, as any small component has.
      const x = at[0] - W / 2 + 0.05;
      stroke(
        c,
        n * 0.005,
        segment([x, at[1] + 0.05, 0], [x + 0.14, at[1] + 0.05, 0]),
        0.9,
        flash,
      );
      stroke(
        c,
        n * 0.006,
        segment(
          [x, at[1] - 0.02, 0],
          [x + 0.22 - (card % 3) * 0.04, at[1] - 0.02, 0],
        ),
        0.45,
        flash,
      );
    }
  }
}
