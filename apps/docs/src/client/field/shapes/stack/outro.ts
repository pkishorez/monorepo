import { Kind } from '../pen/index.ts';
import type { Cloud, Label, V3 } from '../pen/index.ts';
import { box, lattice, sub3 } from '../pen/index.ts';

/*
 * The end: what is coming. Three packages in a row. The first is built,
 * kabuki: its outline bright, filled in. The next two are being built:
 * each one's outline draws itself in, in its turn on the story clock, its
 * inside filling after, then both dissolve back to a faint sketch and the
 * loop starts again. Between them, specks carry on from the built one to
 * the next, as work does.
 */

const SIZE = 0.44;
const GAP = 0.62;
const AT: readonly V3[] = [
  [-GAP, 0, 0],
  [0, 0, 0],
  [GAP, 0, 0],
];

/** When each package being built draws in, on the story clock. */
const TURNS = [
  { outline: 0.08, fill: 0.3, length: 0.22 },
  { outline: 0.46, fill: 0.68, length: 0.22 },
] as const;

export function outro(c: Cloud): void {
  const { n, random } = c;

  // Built: a bright outline, filled with a fine even lattice.
  box(c, AT[0]!, SIZE, SIZE, 0.07, 1.2);
  lattice(c, n * 0.05, AT[0]!, SIZE * 0.7, SIZE * 0.7, 0.75);

  // Being built: each drawn in its turn, a faint sketch the rest of the loop.
  TURNS.forEach((turn, index) => {
    const at = AT[index + 1]!;
    box(c, at, SIZE, SIZE, 0.07, 0.95, (u) => [
      Kind.reveal,
      0.14,
      u,
      turn.outline,
      turn.length,
    ]);
    lattice(
      c,
      n * 0.04,
      at,
      SIZE * 0.7,
      SIZE * 0.7,
      0.6,
      () => true,
      (x, y) => [Kind.reveal, 0, (x + y) / 2, turn.fill, turn.length],
    );
  });

  // Work carrying on: specks leaving each package for the next.
  for (let k = 0; k < n * 0.005; k++) {
    const from = Math.floor(random() * 2);
    const y = (random() - 0.5) * SIZE * 0.6;
    const start: V3 = [AT[from]![0] + SIZE / 2 + 0.02, y, 0];
    const end: V3 = [AT[from + 1]![0] - SIZE / 2 - 0.02, y, 0];
    c.add(start, 1, [Kind.flow, random(), ...sub3(end, start)]);
  }
}

export const outroLabels: readonly Label[] = [
  { text: 'kabuki', at: [AT[0]![0], SIZE / 2 + 0.1, 0] },
];
