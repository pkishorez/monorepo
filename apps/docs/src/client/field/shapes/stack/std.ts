import { Kind, moved } from '../pen/index.ts';
import type { Cloud, Label, V3 } from '../pen/index.ts';
import { add3, lattice, segment, stroke, sub3, turnY } from '../pen/index.ts';

/*
 * std-toolkit: single-table data, synced. Two tables of rows and columns,
 * turned a little towards each other, the key column brightest, and a stream
 * of entries flowing from one to the other along a few of their rows.
 */

const ROWS = 8;
const COLS = 4;
const W = 0.7;
const H = 1.12;

/** Where a point of a table's own plane sits in the scene. */
function at(side: -1 | 1, p: V3): V3 {
  return add3([side * 0.56, 0, side * 0.12], turnY(p, -side * 0.32));
}

function table(c: Cloud, filled: (r: number, k: number) => boolean): void {
  const { n } = c;
  const line = n * 0.011;
  for (let r = 0; r <= ROWS; r++) {
    const y = H / 2 - (r / ROWS) * H;
    stroke(
      c,
      line,
      segment([-W / 2, y, 0], [W / 2, y, 0]),
      r === 1 ? 0.8 : 0.42,
    );
  }
  for (let k = 0; k <= COLS; k++) {
    const x = -W / 2 + (k / COLS) * W;
    stroke(c, line * 1.3, segment([x, -H / 2, 0], [x, H / 2, 0]), 0.42);
  }
  // Cells holding something: a fine lattice, the key column brighter.
  const cw = W / COLS;
  const ch = H / ROWS;
  for (let r = 1; r < ROWS; r++) {
    for (let k = 0; k < COLS; k++) {
      if (!filled(r, k)) continue;
      const center: V3 = [-W / 2 + (k + 0.5) * cw, H / 2 - (r + 0.5) * ch, 0];
      lattice(
        c,
        n * 0.0048,
        center,
        cw * 0.62,
        ch * 0.42,
        k === 0 ? 1.3 : 0.75,
      );
    }
  }
}

export function std(c: Cloud): void {
  const { n, random } = c;
  table(
    moved(c, (p) => at(-1, p)),
    (r, k) => k === 0 || (r * 7 + k * 3) % 5 !== 0,
  );
  table(
    moved(c, (p) => at(1, p)),
    (r, k) => k === 0 || (r * 7 + k * 5) % 4 !== 0,
  );

  // The stream: entries leaving the left table's rows for the right's.
  const rows = [2, 3, 5, 6];
  for (let k = 0; k < n * 0.014; k++) {
    const r = rows[Math.floor(random() * rows.length)]!;
    const y = H / 2 - (r + 0.5) * (H / ROWS) + (random() - 0.5) * 0.02;
    const from = at(-1, [W / 2 + 0.02, y, 0]);
    const to = at(1, [-W / 2 - 0.02, y, 0]);
    c.add(from, 1.1, [Kind.flow, random(), ...sub3(to, from)]);
  }
}

export const stdLabels: readonly Label[] = [
  { text: 'server table', at: at(-1, [0, H / 2 + 0.1, 0]) },
  { text: 'client table', at: at(1, [0, H / 2 + 0.1, 0]) },
  // Between the streams, where no row flows.
  { text: 'sync', kind: 'message', at: [0, H / 2 - 4.5 * (H / ROWS), 0] },
];
