import { lattice, segment, stroke } from '../pen/index.ts';
import type { Cloud, Label } from '../pen/index.ts';

/*
 * one table: every kind of thing in a single table. Rows and columns held
 * nearly flat, the key column brightest, and the rows in three bands, one
 * per kind of entity, each band its own brightness, so the kinds read
 * apart while sharing every line of the grid.
 */

const ROWS = 9;
const COLS = 5;
const W = 1.3;
const H = 1.1;

/** The bands of rows, by entity: its first and last row, and brightness. */
const BANDS = [
  { name: 'Task', from: 1, to: 4, bright: 0.95 },
  { name: 'Board', from: 5, to: 6, bright: 0.6 },
  { name: 'Settings', from: 7, to: 8, bright: 0.38 },
] as const;

const yOf = (r: number) => H / 2 - (r / ROWS) * H;

export function oneTable(c: Cloud): void {
  const { n } = c;
  const line = n * 0.012;
  for (let r = 0; r <= ROWS; r++)
    stroke(
      c,
      line,
      segment([-W / 2, yOf(r), 0], [W / 2, yOf(r), 0]),
      r === 1 ? 0.8 : 0.36,
    );
  for (let k = 0; k <= COLS; k++) {
    const x = -W / 2 + (k / COLS) * W;
    stroke(c, line * 0.9, segment([x, -H / 2, 0], [x, H / 2, 0]), 0.36);
  }
  const cw = W / COLS;
  const ch = H / ROWS;
  for (const band of BANDS)
    for (let r = band.from; r <= band.to; r++)
      for (let k = 0; k < COLS; k++) {
        if (k > 0 && (r * 5 + k * 3) % 4 === 0) continue;
        lattice(
          c,
          n * 0.0036,
          [-W / 2 + (k + 0.5) * cw, yOf(r) - ch / 2, 0],
          cw * 0.62,
          ch * 0.4,
          k === 0 ? 1.4 : band.bright,
        );
      }
}

export const oneTableLabels: readonly Label[] = [
  ...BANDS.map((band): Label => ({
    text: band.name,
    at: [W / 2 + 0.16, (yOf(band.from) + yOf(band.to + 1)) / 2, 0],
  })),
  { text: 'key', kind: 'note', at: [-W / 2 + W / COLS / 2, H / 2 + 0.08, 0] },
];
